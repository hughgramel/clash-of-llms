// Debate orchestrator service worker
// Manages debate state machine, frame discovery, and message routing

importScripts('../shared/constants.js');

// --- State ---

let debateState = {
  status: 'idle', // idle | preparing | debating | stopped | completed | error
  topic: null,
  roundLimit: null,
  currentRound: 0,
  leftLLM: null,
  rightLLM: null,
  leftFrameId: null,
  rightFrameId: null,
  tabId: null,
  transcript: [],
};

let arenaPort = null;

// --- State Persistence ---

async function persistState() {
  try {
    await chrome.storage.local.set({ debateState });
  } catch (e) {
    console.error('Failed to persist state:', e);
  }
}

async function restoreState() {
  try {
    const result = await chrome.storage.local.get('debateState');
    if (result.debateState) {
      debateState = result.debateState;
    }
  } catch (e) {
    console.error('Failed to restore state:', e);
  }
}

// --- Port Communication ---

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'arena') {
    arenaPort = port;

    port.onMessage.addListener((msg) => handleArenaMessage(msg, port));

    port.onDisconnect.addListener(() => {
      arenaPort = null;
    });
  }
});

function notifyArena(msg) {
  if (arenaPort) {
    try {
      arenaPort.postMessage(msg);
    } catch (e) {
      console.error('Failed to notify arena:', e);
    }
  }
}

// --- Arena Message Handler ---

async function handleArenaMessage(msg, port) {
  switch (msg.type) {
    case MSG.START_DEBATE:
      await startDebate(msg);
      break;

    case MSG.STOP_DEBATE:
      debateState.status = 'stopped';
      await persistState();
      break;

    case MSG.GET_STATUS:
      port.postMessage({
        type: 'STATUS',
        status: debateState.status,
        currentRound: debateState.currentRound,
        transcript: debateState.transcript,
      });
      break;

    case MSG.PRELOAD_IFRAMES:
      discoverAndFetchModels(msg);
      break;
  }
}

// --- Frame Discovery ---

async function discoverFrames(tabId, leftLLM, rightLLM) {
  const frames = await chrome.webNavigation.getAllFrames({ tabId });
  let leftFrameId = null;
  let rightFrameId = null;

  const leftUrlBase = new URL(LLM_CONFIG[leftLLM].url).hostname;
  const rightUrlBase = new URL(LLM_CONFIG[rightLLM].url).hostname;

  for (const frame of frames) {
    if (frame.frameId === 0) continue; // Skip top-level frame

    try {
      const frameHost = new URL(frame.url).hostname;
      if (frameHost.includes(leftUrlBase) && leftFrameId === null) {
        leftFrameId = frame.frameId;
      }
      if (frameHost.includes(rightUrlBase) && rightFrameId === null) {
        // Don't assign same frame to both
        if (frame.frameId !== leftFrameId) {
          rightFrameId = frame.frameId;
        }
      }
    } catch (e) {
      // Invalid URL, skip
    }
  }

  return { leftFrameId, rightFrameId };
}

// --- Send Message to Content Script in Frame ---

function sendToFrame(tabId, frameId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, { frameId }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!response) {
        reject(new Error('No response from content script'));
      } else if (!response.success) {
        reject(new Error(response.error || 'Content script error'));
      } else {
        resolve(response);
      }
    });
  });
}

// --- Wait for Adapter Ready ---

async function waitForAdapterReady(tabId, frameId, name, maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await sendToFrame(tabId, frameId, { type: 'IS_READY' });
      if (result.ready) return true;
    } catch (e) {
      // Content script not ready yet
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`${name} adapter did not become ready in time. Make sure you are logged in.`);
}

// --- Prompt Templates ---
// Turns are numbered sequentially: 1, 2, 3, 4, 5...
// Odd turns = left debater (FOR), Even turns = right debater (AGAINST)

let turnCounter = 0;

function makeInitialPrompt(topic, position, opponentName) {
  turnCounter = 1;
  return `You are participating in a structured debate against ${opponentName}. Your position is: ${position}.

The debate topic is: "${topic}"

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line, then present your opening argument. Be concise but thorough (2-3 paragraphs). Address the topic directly and present your strongest points.`;
}

function makeInitialWithContext(topic, position, opponentName, opponentArgument) {
  turnCounter = 2;
  return `You are participating in a structured debate against ${opponentName}. Your position is: ${position}.

The debate topic is: "${topic}"

Turn #1 (your opponent's opening argument):
---
${opponentArgument}
---

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line, then respond to their points while presenting your own opening argument. Be concise (2-3 paragraphs).`;
}

function makeRebuttalPrompt(topic, opponentName, opponentResponse, roundNum) {
  turnCounter++;
  const prevTurn = turnCounter - 1;
  return `We are in Round ${roundNum} of our debate on: "${topic}"

Turn #${prevTurn} — ${opponentName} argued:
---
${opponentResponse}
---

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line, then respond to their argument. Address their specific points, present counter-arguments, and strengthen your position. Be concise (2-3 paragraphs).`;
}

// --- Keep-Alive Alarm ---

function startKeepAlive() {
  chrome.alarms.create('debate-keepalive', { periodInMinutes: 0.4 });
}

function stopKeepAlive() {
  chrome.alarms.clear('debate-keepalive');
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'debate-keepalive') {
    // Just having this listener keeps the service worker alive
  }
});

// --- Get Current Tab ---

async function getCurrentArenaTabId() {
  const tabs = await chrome.tabs.query({
    url: chrome.runtime.getURL('arena/arena.html'),
  });
  if (tabs.length > 0) return tabs[0].id;
  return null;
}

// --- Model Preloading ---

async function discoverAndFetchModels({ leftLLM, rightLLM }) {
  try {
    const tabId = await getCurrentArenaTabId();
    if (!tabId) return;

    debateState.tabId = tabId;
    debateState.leftLLM = leftLLM;
    debateState.rightLLM = rightLLM;

    // Retry frame discovery — iframes may still be loading
    let leftFrameId = null;
    let rightFrameId = null;
    for (let attempt = 0; attempt < 15; attempt++) {
      const result = await discoverFrames(tabId, leftLLM, rightLLM);
      leftFrameId = result.leftFrameId;
      rightFrameId = result.rightFrameId;
      if (leftFrameId !== null && rightFrameId !== null) break;
      await new Promise((r) => setTimeout(r, 2000));
    }

    // Fetch models for each discovered frame independently
    if (leftFrameId !== null) {
      debateState.leftFrameId = leftFrameId;
      fetchModelsForSide(tabId, leftFrameId, leftLLM, 'left');
    }
    if (rightFrameId !== null) {
      debateState.rightFrameId = rightFrameId;
      fetchModelsForSide(tabId, rightFrameId, rightLLM, 'right');
    }
  } catch (e) {
    console.error('discoverAndFetchModels error:', e);
  }
}

async function fetchModelsForSide(tabId, frameId, llmKey, side) {
  try {
    const name = LLM_CONFIG[llmKey].name;
    await waitForAdapterReady(tabId, frameId, name, 20);
    const result = await sendToFrame(tabId, frameId, { type: 'GET_AVAILABLE_MODELS' });
    notifyArena({
      type: MSG.MODELS_AVAILABLE,
      side,
      llmKey,
      models: result.models || [],
    });
  } catch (e) {
    console.error(`fetchModelsForSide(${side}) error:`, e);
    notifyArena({
      type: MSG.MODELS_AVAILABLE,
      side,
      llmKey,
      models: [],
    });
  }
}

// --- Main Debate Flow ---

async function startDebate({ topic, roundLimit, leftLLM, rightLLM, leftModel, rightModel }) {
  try {
    // Preserve preloaded frame IDs if LLMs haven't changed
    const preloadedLeftFrame = (debateState.leftLLM === leftLLM) ? debateState.leftFrameId : null;
    const preloadedRightFrame = (debateState.rightLLM === rightLLM) ? debateState.rightFrameId : null;

    debateState = {
      status: 'preparing',
      topic,
      roundLimit: roundLimit || null,
      currentRound: 0,
      leftLLM,
      rightLLM,
      leftFrameId: preloadedLeftFrame,
      rightFrameId: preloadedRightFrame,
      tabId: debateState.tabId || null,
      transcript: [],
    };
    await persistState();

    // Find the arena tab
    const tabId = debateState.tabId || await getCurrentArenaTabId();
    if (!tabId) throw new Error('Arena tab not found');
    debateState.tabId = tabId;

    // Reuse preloaded frames or discover fresh
    let leftFrameId = debateState.leftFrameId;
    let rightFrameId = debateState.rightFrameId;

    if (leftFrameId === null || rightFrameId === null) {
      await new Promise((r) => setTimeout(r, 2000));
      const discovered = await discoverFrames(tabId, leftLLM, rightLLM);
      leftFrameId = leftFrameId || discovered.leftFrameId;
      rightFrameId = rightFrameId || discovered.rightFrameId;
    }

    if (leftFrameId === null) throw new Error(`Could not find ${LLM_CONFIG[leftLLM].name} iframe. Make sure the page has loaded.`);
    if (rightFrameId === null) throw new Error(`Could not find ${LLM_CONFIG[rightLLM].name} iframe. Make sure the page has loaded.`);

    debateState.leftFrameId = leftFrameId;
    debateState.rightFrameId = rightFrameId;
    await persistState();

    // Wait for both adapters to be ready
    const leftName = LLM_CONFIG[leftLLM].name;
    const rightName = LLM_CONFIG[rightLLM].name;

    await Promise.all([
      waitForAdapterReady(tabId, leftFrameId, leftName),
      waitForAdapterReady(tabId, rightFrameId, rightName),
    ]);

    // Select models if specified
    if (leftModel) {
      try {
        await sendToFrame(tabId, leftFrameId, { type: 'SELECT_MODEL', modelId: leftModel });
        await new Promise((r) => setTimeout(r, 500));
      } catch (e) {
        console.warn('Failed to select left model:', e.message);
      }
    }
    if (rightModel) {
      try {
        await sendToFrame(tabId, rightFrameId, { type: 'SELECT_MODEL', modelId: rightModel });
        await new Promise((r) => setTimeout(r, 500));
      } catch (e) {
        console.warn('Failed to select right model:', e.message);
      }
    }

    // Start keep-alive
    startKeepAlive();

    // Begin debate
    debateState.status = 'debating';
    debateState.currentRound = 1;
    await persistState();

    await runDebate();
  } catch (err) {
    debateState.status = 'error';
    await persistState();
    stopKeepAlive();
    notifyArena({ type: MSG.DEBATE_ERROR, error: err.message });
  }
}

async function runDebate() {
  const { tabId, leftFrameId, rightFrameId, topic, roundLimit, leftLLM, rightLLM } = debateState;
  const leftName = LLM_CONFIG[leftLLM].name;
  const rightName = LLM_CONFIG[rightLLM].name;

  try {
    // === Round 1: Opening arguments ===

    // Left LLM goes first (FOR position)
    notifyArena({
      type: MSG.DEBATE_UPDATE,
      round: 1,
      phase: 'left_thinking',
      leftLLM,
      rightLLM,
      roundLimit,
    });

    await sendToFrame(tabId, leftFrameId, {
      type: 'SEND_MESSAGE',
      text: makeInitialPrompt(topic, 'FOR the topic', rightName),
    });

    const leftR1 = await sendToFrame(tabId, leftFrameId, { type: 'WAIT_FOR_RESPONSE' });
    const leftResponse1 = leftR1.response;
    debateState.transcript.push({ round: 1, speaker: leftLLM, text: leftResponse1 });
    await persistState();

    if (debateState.status !== 'debating') return;

    // Right LLM responds (AGAINST position, with context)
    notifyArena({
      type: MSG.DEBATE_UPDATE,
      round: 1,
      phase: 'right_thinking',
      leftLLM,
      rightLLM,
      leftResponse: leftResponse1,
      roundLimit,
    });

    await sendToFrame(tabId, rightFrameId, {
      type: 'SEND_MESSAGE',
      text: makeInitialWithContext(topic, 'AGAINST the topic', leftName, leftResponse1),
    });

    const rightR1 = await sendToFrame(tabId, rightFrameId, { type: 'WAIT_FOR_RESPONSE' });
    const rightResponse1 = rightR1.response;
    debateState.transcript.push({ round: 1, speaker: rightLLM, text: rightResponse1 });
    await persistState();

    notifyArena({
      type: MSG.DEBATE_UPDATE,
      round: 1,
      phase: 'complete',
      leftLLM,
      rightLLM,
      leftResponse: leftResponse1,
      rightResponse: rightResponse1,
      roundLimit,
    });

    if (debateState.status !== 'debating') return;

    // === Subsequent rounds ===

    let lastLeftResponse = leftResponse1;
    let lastRightResponse = rightResponse1;

    for (let round = 2; debateState.status === 'debating'; round++) {
      if (roundLimit && round > roundLimit) {
        break;
      }

      debateState.currentRound = round;
      await persistState();

      // Left LLM rebuts
      notifyArena({
        type: MSG.DEBATE_UPDATE,
        round,
        phase: 'left_thinking',
        leftLLM,
        rightLLM,
        roundLimit,
      });

      await sendToFrame(tabId, leftFrameId, {
        type: 'SEND_MESSAGE',
        text: makeRebuttalPrompt(topic, rightName, lastRightResponse, round),
      });

      const leftR = await sendToFrame(tabId, leftFrameId, { type: 'WAIT_FOR_RESPONSE' });
      lastLeftResponse = leftR.response;
      debateState.transcript.push({ round, speaker: leftLLM, text: lastLeftResponse });
      await persistState();

      if (debateState.status !== 'debating') break;

      // Right LLM rebuts
      notifyArena({
        type: MSG.DEBATE_UPDATE,
        round,
        phase: 'right_thinking',
        leftLLM,
        rightLLM,
        leftResponse: lastLeftResponse,
        roundLimit,
      });

      await sendToFrame(tabId, rightFrameId, {
        type: 'SEND_MESSAGE',
        text: makeRebuttalPrompt(topic, leftName, lastLeftResponse, round),
      });

      const rightR = await sendToFrame(tabId, rightFrameId, { type: 'WAIT_FOR_RESPONSE' });
      lastRightResponse = rightR.response;
      debateState.transcript.push({ round, speaker: rightLLM, text: lastRightResponse });
      await persistState();

      notifyArena({
        type: MSG.DEBATE_UPDATE,
        round,
        phase: 'complete',
        leftLLM,
        rightLLM,
        leftResponse: lastLeftResponse,
        rightResponse: lastRightResponse,
        roundLimit,
      });
    }

    // Debate finished
    debateState.status = 'completed';
    await persistState();
    stopKeepAlive();
    notifyArena({
      type: MSG.DEBATE_COMPLETE,
      transcript: debateState.transcript,
    });
  } catch (err) {
    debateState.status = 'error';
    await persistState();
    stopKeepAlive();
    notifyArena({ type: MSG.DEBATE_ERROR, error: err.message });
  }
}

// --- Initialization ---

restoreState();
