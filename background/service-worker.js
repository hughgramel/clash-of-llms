// Debate orchestrator service worker
// Manages debate state machine, frame discovery, and message routing

importScripts('../shared/constants.js');

const MAX_ROUNDS_SAFETY_CAP = 50;

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
  autoEnd: true,
  nextSpeaker: 'left',
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
  console.log('[Clash SW] handleArenaMessage:', msg.type, JSON.stringify(msg));
  switch (msg.type) {
    case MSG.START_DEBATE:
      await startDebate(msg);
      break;

    case MSG.STOP_DEBATE:
      debateState.status = 'stopped';
      await persistState();
      break;

    case MSG.CONTINUE_DEBATE:
      await continueDebate();
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

  if (!frames) return { leftFrameId, rightFrameId };

  const leftUrlBase = new URL(LLM_CONFIG[leftLLM].url).hostname;
  const rightUrlBase = new URL(LLM_CONFIG[rightLLM].url).hostname;

  console.log(`[Clash] discoverFrames: looking for ${leftUrlBase} and ${rightUrlBase} in ${frames.length} frames`);

  for (const frame of frames) {
    if (frame.frameId === 0) continue; // Skip top-level frame

    try {
      const frameHost = new URL(frame.url).hostname;
      console.log(`[Clash]   frame ${frame.frameId}: ${frame.url} (host: ${frameHost})`);
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
      console.log(`[Clash]   frame ${frame.frameId}: invalid URL "${frame.url}"`);
    }
  }

  console.log(`[Clash] discoverFrames result: left=${leftFrameId}, right=${rightFrameId}`);
  return { leftFrameId, rightFrameId };
}

// --- Send Message to Content Script in Frame ---

function sendToFrame(tabId, frameId, message) {
  console.log(`[Clash SW] sendToFrame(tab=${tabId}, frame=${frameId}, type=${message.type})`);
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, { frameId }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(`[Clash SW] sendToFrame error (${message.type}):`, chrome.runtime.lastError.message);
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!response) {
        console.error(`[Clash SW] sendToFrame no response (${message.type})`);
        reject(new Error('No response from content script'));
      } else if (!response.success) {
        console.error(`[Clash SW] sendToFrame failed (${message.type}):`, response.error);
        reject(new Error(response.error || 'Content script error'));
      } else {
        console.log(`[Clash SW] sendToFrame success (${message.type})`);
        resolve(response);
      }
    });
  });
}

// --- Programmatic Script Injection ---

// Maps LLM key to the content scripts that should be injected
const LLM_CONTENT_SCRIPTS = {
  chatgpt: ['shared/constants.js', 'content-scripts/adapter-interface.js', 'content-scripts/chatgpt-adapter.js'],
  claude: ['shared/constants.js', 'content-scripts/adapter-interface.js', 'content-scripts/claude-adapter.js'],
  grok: ['shared/constants.js', 'content-scripts/adapter-interface.js', 'content-scripts/grok-adapter.js'],
  gemini: ['shared/constants.js', 'content-scripts/adapter-interface.js', 'content-scripts/gemini-adapter.js'],
  perplexity: ['shared/constants.js', 'content-scripts/adapter-interface.js', 'content-scripts/perplexity-adapter.js'],
};

async function injectContentScripts(tabId, frameId, llmKey) {
  const scripts = LLM_CONTENT_SCRIPTS[llmKey];
  if (!scripts) {
    console.warn(`[Clash SW] No content scripts defined for ${llmKey}`);
    return;
  }
  console.log(`[Clash SW] Programmatically injecting content scripts for ${llmKey} into frame ${frameId}`);
  try {
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      files: scripts,
    });
    console.log(`[Clash SW] Successfully injected scripts for ${llmKey}`);
  } catch (e) {
    console.error(`[Clash SW] Failed to inject scripts for ${llmKey}:`, e.message);
  }
}

// --- Wait for Adapter Ready ---

async function waitForAdapterReady(tabId, frameId, name, maxRetries = 30) {
  console.log(`[Clash SW] waitForAdapterReady: ${name} (frame=${frameId})`);

  // Determine which LLM key this is for programmatic injection
  const llmKey = Object.keys(LLM_CONFIG).find(k => LLM_CONFIG[k].name === name);
  let injected = false;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await sendToFrame(tabId, frameId, { type: 'IS_READY' });
      if (result.ready) {
        console.log(`[Clash SW] ${name} adapter ready after ${i + 1} attempts`);
        return true;
      }
    } catch (e) {
      if (i % 5 === 0) console.log(`[Clash SW] ${name} adapter not ready yet (attempt ${i + 1}/${maxRetries}): ${e.message}`);

      // After 5 failed attempts with "Could not establish connection", try programmatic injection
      if (!injected && i >= 4 && llmKey && e.message.includes('Could not establish connection')) {
        console.log(`[Clash SW] Content script not present for ${name}, attempting programmatic injection...`);
        await injectContentScripts(tabId, frameId, llmKey);
        injected = true;
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`${name} adapter did not become ready in time. Make sure you are logged in.`);
}

// --- Prompt Templates ---
// Turns are numbered sequentially: 1, 2, 3, 4, 5...
// Each mode provides its own set of prompt templates.
// LLM identities are never revealed — generic role terms are used instead.

let turnCounter = 0;

const MODE_PROMPTS = {
  debate: {
    makeInitial(topic, roleName) {
      turnCounter = 1;
      return `You are participating in a structured debate. Your position is: ${roleName}.

The debate topic is: "${topic}"

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line, then present your opening argument. Be concise but thorough (2-3 paragraphs). Address the topic directly and present your strongest points.`;
    },
    makeInitialWithContext(topic, roleName, opponentText) {
      turnCounter = 2;
      return `You are participating in a structured debate. Your position is: ${roleName}.

The debate topic is: "${topic}"

Turn #1 (your opponent's opening argument):
---
${opponentText}
---

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line, then respond to their points while presenting your own opening argument. Be concise (2-3 paragraphs).`;
    },
    makeFollowup(topic, opponentText, roundNum) {
      turnCounter++;
      const prev = turnCounter - 1;
      return `We are in Round ${roundNum} of our debate on: "${topic}"

Turn #${prev} — your opponent argued:
---
${opponentText}
---

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line, then respond to their argument. Address their specific points, present counter-arguments, and strengthen your position. Be concise (2-3 paragraphs).`;
    },
  },

  conversation: {
    makeInitial(topic, roleName) {
      turnCounter = 1;
      return `You are having a thoughtful conversation with another participant about an interesting topic.

The topic is: "${topic}"

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line. Share your initial thoughts on this topic. Be curious, open-minded, and collaborative. Ask a thoughtful question at the end to keep the dialogue going. (2-3 paragraphs)`;
    },
    makeInitialWithContext(topic, roleName, opponentText) {
      turnCounter = 2;
      return `You are having a thoughtful conversation with another participant about an interesting topic.

The topic is: "${topic}"

Turn #1 — the other participant said:
---
${opponentText}
---

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line. Engage with what they said — agree, build on their ideas, and add your own perspective. End with a question or observation to continue the dialogue. (2-3 paragraphs)`;
    },
    makeFollowup(topic, opponentText, roundNum) {
      turnCounter++;
      const prev = turnCounter - 1;
      return `We are in Round ${roundNum} of our conversation about: "${topic}"

Turn #${prev} — the other participant said:
---
${opponentText}
---

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line. Continue the conversation naturally. Build on what was said, offer new angles, share related ideas, and ask questions. Be collaborative and curious. (2-3 paragraphs)`;
    },
  },

  roast: {
    makeInitial(topic, roleName) {
      turnCounter = 1;
      return `You are in a comedic roast battle. This is all in good fun — think Comedy Central Roast style.

The roast topic/theme is: "${topic}"

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line. Open with your best roast material related to this theme. Be creative, witty, and savage but keep it comedic. Use punchlines, callbacks, and comedic timing. (2-3 paragraphs)`;
    },
    makeInitialWithContext(topic, roleName, opponentText) {
      turnCounter = 2;
      return `You are in a comedic roast battle. This is all in good fun — think Comedy Central Roast style.

The roast topic/theme is: "${topic}"

Turn #1 — your opponent roasted you:
---
${opponentText}
---

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line. Fire back! Address their roast, flip their jokes, and hit them with even better material. Be creative, witty, and devastating. (2-3 paragraphs)`;
    },
    makeFollowup(topic, opponentText, roundNum) {
      turnCounter++;
      const prev = turnCounter - 1;
      return `We are in Round ${roundNum} of our roast battle. The theme is: "${topic}"

Turn #${prev} — your opponent roasted you:
---
${opponentText}
---

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line. Clap back hard! Reference their previous jokes, find new angles, and escalate the comedy. Keep it clever and devastating. (2-3 paragraphs)`;
    },
  },

  interview: {
    makeInitial(topic, roleName) {
      turnCounter = 1;
      return `You are a skilled interviewer conducting an in-depth interview with a domain expert.

The interview topic is: "${topic}"

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line. Open the interview: briefly introduce the topic, welcome your guest, and ask your first compelling question. Be professional but engaging. (1-2 paragraphs)`;
    },
    makeInitialWithContext(topic, roleName, opponentText) {
      turnCounter = 2;
      return `You are a knowledgeable expert being interviewed about a topic you know deeply.

The interview topic is: "${topic}"

Turn #1 — The interviewer said:
---
${opponentText}
---

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line. Answer their question thoughtfully and in detail, drawing on your expertise. Share insights, examples, and nuance. (2-3 paragraphs)`;
    },
    makeFollowup(topic, opponentText, roundNum) {
      turnCounter++;
      const prev = turnCounter - 1;
      const isInterviewer = (turnCounter % 2 === 1);
      if (isInterviewer) {
        return `We are in Round ${roundNum} of this interview on: "${topic}"

Turn #${prev} — The expert answered:
---
${opponentText}
---

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line. As the interviewer, react briefly to their answer and ask a follow-up question that digs deeper or explores a new angle. Be insightful. (1-2 paragraphs)`;
      }
      return `We are in Round ${roundNum} of this interview on: "${topic}"

Turn #${prev} — The interviewer asked:
---
${opponentText}
---

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line. As the expert, answer their question with depth and authority. Provide examples, evidence, and unique insights. (2-3 paragraphs)`;
    },
  },

  storytelling: {
    makeInitial(topic, roleName) {
      turnCounter = 1;
      return `You are collaboratively writing a story with another author. You will take turns continuing the narrative.

The story premise is: "${topic}"

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line. Write the opening of the story: set the scene, introduce a character or situation, and establish the tone. End at a moment that invites your co-author to continue. Write in prose, not outline form. (2-3 paragraphs)`;
    },
    makeInitialWithContext(topic, roleName, opponentText) {
      turnCounter = 2;
      return `You are collaboratively writing a story with another author. You take turns continuing the narrative.

The story premise is: "${topic}"

Turn #1 — Your co-author wrote:
---
${opponentText}
---

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line. Continue the story seamlessly from where they left off. Develop the characters, advance the plot, and add a twist or complication. End at a moment that invites the next continuation. (2-3 paragraphs)`;
    },
    makeFollowup(topic, opponentText, roundNum) {
      turnCounter++;
      const prev = turnCounter - 1;
      return `We are on Round ${roundNum} of our collaborative story. The premise was: "${topic}"

Turn #${prev} — Your co-author continued the story:
---
${opponentText}
---

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line. Continue the story from exactly where they left off. Maintain consistency with characters and plot, raise the stakes, and add new elements. End at an exciting moment. (2-3 paragraphs)`;
    },
  },

  philosophical: {
    makeInitial(topic, roleName) {
      turnCounter = 1;
      return `You are engaged in a deep philosophical dialogue. This is a Socratic exchange seeking truth and understanding, not a debate to win.

The philosophical question is: "${topic}"

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line. Present your philosophical perspective on this question. Draw on relevant philosophical traditions, thought experiments, or frameworks. Pose a challenging question back to your interlocutor. (2-3 paragraphs)`;
    },
    makeInitialWithContext(topic, roleName, opponentText) {
      turnCounter = 2;
      return `You are engaged in a deep philosophical dialogue. This is a Socratic exchange seeking truth and understanding.

The philosophical question is: "${topic}"

Turn #1 — Your interlocutor offered this perspective:
---
${opponentText}
---

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line. Engage deeply with their philosophical perspective. Where do you agree? Where do you see gaps? Offer an alternative framework or build on their ideas. Pose a question that pushes the inquiry deeper. (2-3 paragraphs)`;
    },
    makeFollowup(topic, opponentText, roundNum) {
      turnCounter++;
      const prev = turnCounter - 1;
      return `We are in Round ${roundNum} of our philosophical dialogue on: "${topic}"

Turn #${prev} — Your interlocutor reflected:
---
${opponentText}
---

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line. Deepen the philosophical inquiry. Examine assumptions, explore paradoxes, introduce relevant thought experiments, and seek synthesis between your perspectives. (2-3 paragraphs)`;
    },
  },

  truth: {
    makeInitial(topic, roleName) {
      turnCounter = 1;
      return `You are a truth-seeking investigator collaborating with another investigator to find the most accurate, well-supported answer to a question. You are not debating — you are working together to converge on the truth.

The question to investigate is: "${topic}"

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line. Present your initial analysis: state your current position clearly, present your strongest evidence, and identify areas of uncertainty. Be honest about what you don't know. (2-3 paragraphs)`;
    },
    makeInitialWithContext(topic, roleName, opponentText) {
      turnCounter = 2;
      return `You are a truth-seeking investigator collaborating with another investigator to find the most accurate answer to a question. You are not debating — you are working together toward the truth.

The question to investigate is: "${topic}"

Turn #1 — Your fellow investigator presented their initial analysis:
---
${opponentText}
---

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line. Evaluate their analysis honestly: acknowledge points where they are correct, identify any gaps or errors in their reasoning, and add your own evidence and perspective. State where you agree and where you diverge. (2-3 paragraphs)`;
    },
    makeFollowup(topic, opponentText, roundNum, isLastRound) {
      turnCounter++;
      const prev = turnCounter - 1;
      if (isLastRound) {
        return `We are in the FINAL round of our truth-seeking investigation on: "${topic}"

Turn #${prev} — Your fellow investigator said:
---
${opponentText}
---

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line.

Write your FINAL VERDICT. Synthesize everything discussed. State the conclusion you've converged on, note any remaining areas of disagreement, and give your confidence level. Start with "FINAL VERDICT:" after the turn number. Be definitive. (2-3 paragraphs)`;
      }
      return `We are in Round ${roundNum} of our truth-seeking investigation on: "${topic}"

Turn #${prev} — Your fellow investigator said:
---
${opponentText}
---

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line. Continue the investigation: acknowledge where you've changed your mind, present new evidence or angles, and work toward convergence. Be explicit about what you now agree on and what remains unresolved. (2-3 paragraphs)`;
    },
  },

  collaborative: {
    makeInitial(topic, roleName) {
      turnCounter = 1;
      return `You and a colleague are collaborating to produce the best possible output on a task. You should debate ideas, challenge each other's thinking, and refine toward a single unified result.

The task/topic is: "${topic}"

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line. Present your initial approach or draft. Be specific and actionable. Highlight areas where you'd like your colleague's input or pushback. (2-3 paragraphs)`;
    },
    makeInitialWithContext(topic, roleName, opponentText) {
      turnCounter = 2;
      return `You and a colleague are collaborating to produce the best possible output on a task. Debate ideas, challenge thinking, and refine toward a unified result.

The task/topic is: "${topic}"

Turn #1 — Your colleague proposed:
---
${opponentText}
---

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line. Evaluate their approach as a colleague: what's strong, what needs improvement, and what's missing? Offer your own refinements or alternative approaches. Push toward a better combined result. (2-3 paragraphs)`;
    },
    makeFollowup(topic, opponentText, roundNum, isLastRound) {
      turnCounter++;
      const prev = turnCounter - 1;
      if (isLastRound) {
        return `We are in the FINAL round of our collaboration on: "${topic}"

Turn #${prev} — Your colleague said:
---
${opponentText}
---

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line.

Write the FINAL UNIFIED OUTPUT. Synthesize the best ideas from both colleagues into one polished, cohesive result. Start with "FINAL OUTPUT:" after the turn number. This should read as a single authoritative piece, not a summary of the discussion. (2-4 paragraphs)`;
      }
      return `We are in Round ${roundNum} of our collaboration on: "${topic}"

Turn #${prev} — Your colleague said:
---
${opponentText}
---

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line. Build on their feedback: incorporate what works, defend what you believe is right, and compromise where appropriate. Keep refining toward the strongest possible unified output. (2-3 paragraphs)`;
    },
  },

  writers_room: {
    makeInitial(topic, roleName) {
      turnCounter = 1;
      return `You are a talented writer in a writers' room. Your job is to draft a piece of creative content based on a brief, then iterate with your partner until it's polished and ready to publish.

The brief is: "${topic}"

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line. Write your FIRST DRAFT of the requested piece. Match the format and tone implied by the brief (if it asks for a tweet, write a tweet; if it asks for a greentext, write a greentext; if it asks for a short story, write a short story). Just write the piece itself — no meta-commentary.`;
    },
    makeInitialWithContext(topic, roleName, opponentText) {
      turnCounter = 2;
      return `You are a sharp editor in a writers' room. Your colleague just wrote a first draft and you need to critique it and write an improved version.

The original brief was: "${topic}"

Turn #1 — The writer wrote this draft:
---
${opponentText}
---

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line. First, give 2-3 sentences of specific, constructive feedback on what works and what doesn't. Then write your REVISED VERSION of the piece — a complete rewrite incorporating your improvements. Keep the same format/length as the original.`;
    },
    makeFollowup(topic, opponentText, roundNum, isLastRound) {
      turnCounter++;
      const prev = turnCounter - 1;
      const isWriter = (turnCounter % 2 === 1);
      if (isLastRound) {
        return `We are in the FINAL round of our writers' room session. The brief was: "${topic}"

Turn #${prev} — Your partner wrote:
---
${opponentText}
---

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line.

Write the FINAL POLISHED VERSION. Take the best elements from all previous drafts and produce the definitive version. Start with "FINAL VERSION:" after the turn number. This should be publication-ready — no feedback, no commentary, just the finished piece.`;
      }
      if (isWriter) {
        return `We are in Round ${roundNum} of our writers' room session. The brief was: "${topic}"

Turn #${prev} — Your editor gave feedback and rewrote:
---
${opponentText}
---

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line. Consider their feedback and revision. Write your NEXT DRAFT — keep what improved, push back on changes you disagree with, and elevate the piece further. Write the full piece, not just notes.`;
      }
      return `We are in Round ${roundNum} of our writers' room session. The brief was: "${topic}"

Turn #${prev} — The writer submitted a new draft:
---
${opponentText}
---

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line. Give brief, specific feedback (2-3 sentences) then write your REVISED VERSION. Focus on tightening the language, sharpening the impact, and making every word count. Write the full piece.`;
    },
  },

  roleplay: {
    makeInitial(topic, roleName) {
      turnCounter = 1;
      return `You are playing a character in an interactive role-play scenario. Stay fully in character throughout your response.

The scenario is: "${topic}"

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line. Set the scene and begin acting as your character. Establish who you are through dialogue and action. Use a mix of dialogue and brief narration. (2-3 paragraphs)`;
    },
    makeInitialWithContext(topic, roleName, opponentText) {
      turnCounter = 2;
      return `You are playing a character in an interactive role-play scenario. Stay fully in character throughout your response.

The scenario is: "${topic}"

Turn #1 — The other character:
---
${opponentText}
---

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line. React in character to what just happened. Use dialogue and narration to advance the scene naturally. (2-3 paragraphs)`;
    },
    makeFollowup(topic, opponentText, roundNum) {
      turnCounter++;
      const prev = turnCounter - 1;
      return `We are in Round ${roundNum} of our role-play. The scenario: "${topic}"

Turn #${prev} — The other character:
---
${opponentText}
---

This is Turn #${turnCounter}. Begin your response with "${turnCounter}." on its own line. Continue the scene in character. React naturally, advance the story, and keep the drama engaging. (2-3 paragraphs)`;
    },
  },
};

// --- Personality Injection ---

function applyPersonality(promptText, personality) {
  if (!personality || personality === 'none') return promptText;
  // Support both PERSONALITIES keys and free-text personality descriptions
  const preset = PERSONALITIES[personality];
  const instruction = (preset && preset.promptFragment) ? preset.promptFragment : personality;
  return promptText + '\n\nIMPORTANT STYLE INSTRUCTION: ' + instruction + ' Maintain this persona consistently throughout your entire response.';
}

// --- Setting Injection ---

function applySetting(promptText, setting) {
  if (!setting) return promptText;
  return promptText + '\n\nSETTING/CONTEXT: ' + setting;
}

// --- Auto-End Signal ---

const AUTO_END_SIGNAL = '[DISCUSSION COMPLETE]';

function hasAutoEndSignal(text) {
  return text && text.includes(AUTO_END_SIGNAL);
}

function stripAutoEndSignal(text) {
  if (!text) return text;
  return text.replace(/\s*\[DISCUSSION COMPLETE\]\s*/g, '').trim();
}

function applyAutoEnd(promptText, autoEnd) {
  if (!autoEnd) return promptText;
  return promptText + '\n\nIMPORTANT: If you believe the discussion has reached a natural conclusion — all key points have been made, positions are clear, and further rounds would be repetitive — end your response with the exact string [DISCUSSION COMPLETE] on its own line. Only do this when the conversation has genuinely run its course.';
}

// --- Prompt Construction ---

function makeInitialPrompt(topic, roleName, mode, personalityKey, setting, autoEnd) {
  const prompts = MODE_PROMPTS[mode] || MODE_PROMPTS.debate;
  let text = prompts.makeInitial(topic, roleName);
  text = applySetting(text, setting);
  text = applyPersonality(text, personalityKey);
  return applyAutoEnd(text, autoEnd);
}

function makeInitialWithContextPrompt(topic, roleName, opponentText, mode, personalityKey, setting, autoEnd) {
  const prompts = MODE_PROMPTS[mode] || MODE_PROMPTS.debate;
  let text = prompts.makeInitialWithContext(topic, roleName, opponentText);
  text = applySetting(text, setting);
  text = applyPersonality(text, personalityKey);
  return applyAutoEnd(text, autoEnd);
}

function makeFollowupPrompt(topic, opponentText, roundNum, mode, personalityKey, isLastRound, setting, autoEnd) {
  const prompts = MODE_PROMPTS[mode] || MODE_PROMPTS.debate;
  let text;
  if (mode === 'truth' || mode === 'collaborative' || mode === 'writers_room') {
    text = prompts.makeFollowup(topic, opponentText, roundNum, isLastRound);
  } else {
    text = prompts.makeFollowup(topic, opponentText, roundNum);
  }
  text = applySetting(text, setting);
  text = applyPersonality(text, personalityKey);
  return applyAutoEnd(text, autoEnd);
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

    // Wait extra time for model selector UI to render after page is ready
    await new Promise((r) => setTimeout(r, 3000));

    // Try up to 3 times with increasing delays — model selector may render late
    let models = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await sendToFrame(tabId, frameId, { type: 'GET_AVAILABLE_MODELS' });
        models = result.models || [];
        if (models.length > 0) break;
      } catch (e) {
        // Adapter might not be ready yet, retry
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    notifyArena({
      type: MSG.MODELS_AVAILABLE,
      side,
      llmKey,
      models,
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

async function startDebate({ topic, roundLimit, leftLLM, rightLLM, leftModel, rightModel, mode, leftPersonality, rightPersonality, setting, autoEnd }) {
  console.log('[Clash SW] startDebate called with:', { topic, roundLimit, leftLLM, rightLLM, leftModel, rightModel, mode, leftPersonality, rightPersonality, setting, autoEnd });
  try {
    // Always get fresh tab ID to avoid stale state
    const tabId = await getCurrentArenaTabId();
    console.log('[Clash SW] fresh tabId:', tabId, '(previous:', debateState.tabId, ')');

    // Only preserve preloaded frame IDs if SAME tab AND same LLM
    // Frame IDs are only valid within a specific tab
    const sameTab = tabId === debateState.tabId;
    const preloadedLeftFrame = (sameTab && debateState.leftLLM === leftLLM) ? debateState.leftFrameId : null;
    const preloadedRightFrame = (sameTab && debateState.rightLLM === rightLLM) ? debateState.rightFrameId : null;
    console.log('[Clash SW] preloaded frames:', { preloadedLeftFrame, preloadedRightFrame, sameTab });

    debateState = {
      status: 'preparing',
      topic,
      roundLimit: roundLimit || null,
      currentRound: 0,
      leftLLM,
      rightLLM,
      leftFrameId: preloadedLeftFrame,
      rightFrameId: preloadedRightFrame,
      tabId,
      transcript: [],
      mode: mode || 'debate',
      leftPersonality: leftPersonality || 'none',
      rightPersonality: rightPersonality || 'none',
      setting: setting || '',
      autoEnd: autoEnd !== undefined ? autoEnd : true,
      nextSpeaker: 'left',
    };
    await persistState();

    if (!tabId) throw new Error('Arena tab not found');

    // Reuse preloaded frames or discover fresh
    let leftFrameId = debateState.leftFrameId;
    let rightFrameId = debateState.rightFrameId;

    if (leftFrameId === null || rightFrameId === null) {
      // Iframes may still be loading — retry discovery up to 20 times (40s total)
      for (let attempt = 0; attempt < 20; attempt++) {
        await new Promise((r) => setTimeout(r, 2000));
        const discovered = await discoverFrames(tabId, leftLLM, rightLLM);
        leftFrameId = leftFrameId || discovered.leftFrameId;
        rightFrameId = rightFrameId || discovered.rightFrameId;
        if (leftFrameId !== null && rightFrameId !== null) break;
      }
    }

    console.log('[Clash SW] Frame discovery complete:', { leftFrameId, rightFrameId, tabId });

    if (leftFrameId === null) throw new Error(`Could not find ${LLM_CONFIG[leftLLM].name} iframe. Make sure the page has loaded and you are logged in.`);
    if (rightFrameId === null) throw new Error(`Could not find ${LLM_CONFIG[rightLLM].name} iframe. Make sure the page has loaded and you are logged in.`);

    debateState.leftFrameId = leftFrameId;
    debateState.rightFrameId = rightFrameId;
    await persistState();

    // Wait for both adapters to be ready
    const leftName = LLM_CONFIG[leftLLM].name;
    const rightName = LLM_CONFIG[rightLLM].name;

    console.log('[Clash SW] Waiting for adapters:', { leftName, leftFrameId, rightName, rightFrameId });
    await Promise.all([
      waitForAdapterReady(tabId, leftFrameId, leftName),
      waitForAdapterReady(tabId, rightFrameId, rightName),
    ]);
    console.log('[Clash SW] Both adapters ready');

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
    console.error('[Clash SW] startDebate error:', err.message, err.stack);
    debateState.status = 'error';
    await persistState();
    stopKeepAlive();
    notifyArena({ type: MSG.DEBATE_ERROR, error: err.message });
  }
}

async function runDebate() {
  const { tabId, leftFrameId, rightFrameId, topic, roundLimit, leftLLM, rightLLM } = debateState;
  const mode = debateState.mode || 'debate';
  const leftPersonality = debateState.leftPersonality || 'none';
  const rightPersonality = debateState.rightPersonality || 'none';
  const setting = debateState.setting || '';
  const autoEnd = debateState.autoEnd;
  const effectiveLimit = roundLimit || MAX_ROUNDS_SAFETY_CAP;
  const modeConfig = INTERACTION_MODES[mode] || INTERACTION_MODES.debate;
  const leftRole = modeConfig.roles.left;
  const rightRole = modeConfig.roles.right;

  console.log('[Clash SW] runDebate:', { mode, leftLLM, rightLLM, leftRole, rightRole, leftPersonality, rightPersonality, setting, autoEnd, topic, roundLimit, effectiveLimit });
  console.log('[Clash SW] modeConfig:', JSON.stringify(modeConfig));

  try {
    // === Round 1: Opening arguments ===

    // Left LLM goes first
    notifyArena({
      type: MSG.DEBATE_UPDATE,
      round: 1,
      phase: 'left_thinking',
      leftLLM,
      rightLLM,
      roundLimit: effectiveLimit,
    });

    const leftInitialPrompt = makeInitialPrompt(topic, leftRole, mode, leftPersonality, setting, autoEnd);
    console.log('[Clash SW] Sending initial prompt to LEFT:', leftInitialPrompt.substring(0, 200) + '...');
    await sendToFrame(tabId, leftFrameId, {
      type: 'SEND_MESSAGE',
      text: leftInitialPrompt,
    });

    console.log('[Clash SW] Waiting for LEFT response...');
    const leftR1 = await sendToFrame(tabId, leftFrameId, { type: 'WAIT_FOR_RESPONSE' });
    let leftResponse1 = leftR1.response;
    console.log('[Clash SW] LEFT response received:', (leftResponse1 || '').substring(0, 200) + '...');

    // Auto-end check: left R1
    const leftR1HasSignal = autoEnd && hasAutoEndSignal(leftResponse1);
    if (leftR1HasSignal) leftResponse1 = stripAutoEndSignal(leftResponse1);

    debateState.transcript.push({ round: 1, speaker: leftLLM, text: leftResponse1 });
    await persistState();

    if (leftR1HasSignal) {
      debateState.status = 'completed';
      debateState.nextSpeaker = 'right';
      await persistState();
      stopKeepAlive();
      notifyArena({
        type: MSG.DEBATE_COMPLETE,
        transcript: debateState.transcript,
        reason: 'natural_end',
        partialTurn: { round: 1, speaker: leftLLM, text: leftResponse1 },
      });
      return;
    }

    if (debateState.status !== 'debating') return;

    // Right LLM responds (with context from left)
    notifyArena({
      type: MSG.DEBATE_UPDATE,
      round: 1,
      phase: 'right_thinking',
      leftLLM,
      rightLLM,
      leftResponse: leftResponse1,
      roundLimit: effectiveLimit,
    });

    const rightInitialPrompt = makeInitialWithContextPrompt(topic, rightRole, leftResponse1, mode, rightPersonality, setting, autoEnd);
    console.log('[Clash SW] Sending initial+context prompt to RIGHT:', rightInitialPrompt.substring(0, 200) + '...');
    await sendToFrame(tabId, rightFrameId, {
      type: 'SEND_MESSAGE',
      text: rightInitialPrompt,
    });

    console.log('[Clash SW] Waiting for RIGHT response...');
    const rightR1 = await sendToFrame(tabId, rightFrameId, { type: 'WAIT_FOR_RESPONSE' });
    let rightResponse1 = rightR1.response;
    console.log('[Clash SW] RIGHT response received:', (rightResponse1 || '').substring(0, 200) + '...');

    // Auto-end check: right R1
    const rightR1HasSignal = autoEnd && hasAutoEndSignal(rightResponse1);
    if (rightR1HasSignal) rightResponse1 = stripAutoEndSignal(rightResponse1);

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
      roundLimit: effectiveLimit,
    });

    if (rightR1HasSignal) {
      debateState.status = 'completed';
      debateState.nextSpeaker = 'left';
      await persistState();
      stopKeepAlive();
      notifyArena({
        type: MSG.DEBATE_COMPLETE,
        transcript: debateState.transcript,
        reason: 'natural_end',
      });
      return;
    }

    if (debateState.status !== 'debating') return;

    // === Subsequent rounds ===

    let lastLeftResponse = leftResponse1;
    let lastRightResponse = rightResponse1;

    for (let round = 2; debateState.status === 'debating'; round++) {
      if (round > effectiveLimit) {
        break;
      }

      debateState.currentRound = round;
      await persistState();

      const isLastRound = round === effectiveLimit;

      // Left LLM responds
      notifyArena({
        type: MSG.DEBATE_UPDATE,
        round,
        phase: 'left_thinking',
        leftLLM,
        rightLLM,
        roundLimit: effectiveLimit,
      });

      await sendToFrame(tabId, leftFrameId, {
        type: 'SEND_MESSAGE',
        text: makeFollowupPrompt(topic, lastRightResponse, round, mode, leftPersonality, isLastRound, setting, autoEnd),
      });

      const leftR = await sendToFrame(tabId, leftFrameId, { type: 'WAIT_FOR_RESPONSE' });
      lastLeftResponse = leftR.response;

      // Auto-end check: left in loop
      const leftHasSignal = autoEnd && hasAutoEndSignal(lastLeftResponse);
      if (leftHasSignal) lastLeftResponse = stripAutoEndSignal(lastLeftResponse);

      debateState.transcript.push({ round, speaker: leftLLM, text: lastLeftResponse });
      await persistState();

      if (leftHasSignal) {
        debateState.status = 'completed';
        debateState.nextSpeaker = 'right';
        await persistState();
        stopKeepAlive();
        notifyArena({
          type: MSG.DEBATE_COMPLETE,
          transcript: debateState.transcript,
          reason: 'natural_end',
          partialTurn: { round, speaker: leftLLM, text: lastLeftResponse },
        });
        return;
      }

      if (debateState.status !== 'debating') break;

      // Right LLM responds
      notifyArena({
        type: MSG.DEBATE_UPDATE,
        round,
        phase: 'right_thinking',
        leftLLM,
        rightLLM,
        leftResponse: lastLeftResponse,
        roundLimit: effectiveLimit,
      });

      await sendToFrame(tabId, rightFrameId, {
        type: 'SEND_MESSAGE',
        text: makeFollowupPrompt(topic, lastLeftResponse, round, mode, rightPersonality, isLastRound, setting, autoEnd),
      });

      const rightR = await sendToFrame(tabId, rightFrameId, { type: 'WAIT_FOR_RESPONSE' });
      lastRightResponse = rightR.response;

      // Auto-end check: right in loop
      const rightHasSignal = autoEnd && hasAutoEndSignal(lastRightResponse);
      if (rightHasSignal) lastRightResponse = stripAutoEndSignal(lastRightResponse);

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
        roundLimit: effectiveLimit,
      });

      if (rightHasSignal) {
        debateState.status = 'completed';
        debateState.nextSpeaker = 'left';
        await persistState();
        stopKeepAlive();
        notifyArena({
          type: MSG.DEBATE_COMPLETE,
          transcript: debateState.transcript,
          reason: 'natural_end',
        });
        return;
      }
    }

    // Debate finished (round limit or stopped)
    const reason = (debateState.status === 'stopped') ? 'stopped' : 'round_limit';
    debateState.status = 'completed';
    await persistState();
    stopKeepAlive();
    notifyArena({
      type: MSG.DEBATE_COMPLETE,
      transcript: debateState.transcript,
      reason,
    });
  } catch (err) {
    console.error('[Clash SW] runDebate error:', err.message, err.stack);
    debateState.status = 'error';
    await persistState();
    stopKeepAlive();
    notifyArena({ type: MSG.DEBATE_ERROR, error: err.message });
  }
}

// --- Continue Debate ---

async function continueDebate() {
  console.log('[Clash SW] continueDebate called, nextSpeaker:', debateState.nextSpeaker);
  try {
    const { tabId, leftFrameId, rightFrameId, leftLLM, rightLLM } = debateState;

    if (!tabId || !leftFrameId || !rightFrameId) {
      throw new Error('Cannot continue: frame state is missing. Start a new debate.');
    }

    const leftName = LLM_CONFIG[leftLLM].name;
    const rightName = LLM_CONFIG[rightLLM].name;

    // Quick check that adapters are still responsive
    await Promise.all([
      waitForAdapterReady(tabId, leftFrameId, leftName, 5),
      waitForAdapterReady(tabId, rightFrameId, rightName, 5),
    ]);

    debateState.status = 'debating';
    await persistState();
    startKeepAlive();

    await runDebateContinued();
  } catch (err) {
    console.error('[Clash SW] continueDebate error:', err.message, err.stack);
    debateState.status = 'error';
    await persistState();
    stopKeepAlive();
    notifyArena({ type: MSG.DEBATE_ERROR, error: err.message });
  }
}

async function runDebateContinued() {
  const { tabId, leftFrameId, rightFrameId, topic, roundLimit, leftLLM, rightLLM, transcript, nextSpeaker } = debateState;
  const mode = debateState.mode || 'debate';
  const leftPersonality = debateState.leftPersonality || 'none';
  const rightPersonality = debateState.rightPersonality || 'none';
  const setting = debateState.setting || '';
  const autoEnd = debateState.autoEnd;
  const effectiveLimit = roundLimit || MAX_ROUNDS_SAFETY_CAP;

  // Reconstruct last responses from transcript
  let lastLeftResponse = '';
  let lastRightResponse = '';
  for (let i = transcript.length - 1; i >= 0; i--) {
    if (!lastRightResponse && transcript[i].speaker === rightLLM) lastRightResponse = transcript[i].text;
    if (!lastLeftResponse && transcript[i].speaker === leftLLM) lastLeftResponse = transcript[i].text;
    if (lastLeftResponse && lastRightResponse) break;
  }

  const lastEntry = transcript[transcript.length - 1];
  let round = lastEntry ? lastEntry.round : 1;

  try {
    // If right needs to finish a partial round (left spoke, right didn't)
    if (nextSpeaker === 'right') {
      const isLastRound = round === effectiveLimit;

      notifyArena({
        type: MSG.DEBATE_UPDATE,
        round,
        phase: 'right_thinking',
        leftLLM,
        rightLLM,
        leftResponse: lastLeftResponse,
        roundLimit: effectiveLimit,
      });

      await sendToFrame(tabId, rightFrameId, {
        type: 'SEND_MESSAGE',
        text: makeFollowupPrompt(topic, lastLeftResponse, round, mode, rightPersonality, isLastRound, setting, autoEnd),
      });

      const rightR = await sendToFrame(tabId, rightFrameId, { type: 'WAIT_FOR_RESPONSE' });
      lastRightResponse = rightR.response;

      const rightHasSignal = autoEnd && hasAutoEndSignal(lastRightResponse);
      if (rightHasSignal) lastRightResponse = stripAutoEndSignal(lastRightResponse);

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
        roundLimit: effectiveLimit,
      });

      if (rightHasSignal) {
        debateState.status = 'completed';
        debateState.nextSpeaker = 'left';
        await persistState();
        stopKeepAlive();
        notifyArena({ type: MSG.DEBATE_COMPLETE, transcript: debateState.transcript, reason: 'natural_end' });
        return;
      }

      if (debateState.status !== 'debating') {
        const reason = (debateState.status === 'stopped') ? 'stopped' : 'round_limit';
        debateState.status = 'completed';
        await persistState();
        stopKeepAlive();
        notifyArena({ type: MSG.DEBATE_COMPLETE, transcript: debateState.transcript, reason });
        return;
      }

      round++;
    } else {
      // nextSpeaker is 'left', start a new round
      round++;
    }

    // Main round loop (same structure as runDebate)
    for (; debateState.status === 'debating'; round++) {
      if (round > effectiveLimit) break;

      debateState.currentRound = round;
      await persistState();
      const isLastRound = round === effectiveLimit;

      // Left LLM responds
      notifyArena({
        type: MSG.DEBATE_UPDATE,
        round,
        phase: 'left_thinking',
        leftLLM,
        rightLLM,
        roundLimit: effectiveLimit,
      });

      await sendToFrame(tabId, leftFrameId, {
        type: 'SEND_MESSAGE',
        text: makeFollowupPrompt(topic, lastRightResponse, round, mode, leftPersonality, isLastRound, setting, autoEnd),
      });

      const leftR = await sendToFrame(tabId, leftFrameId, { type: 'WAIT_FOR_RESPONSE' });
      lastLeftResponse = leftR.response;

      const leftHasSignal = autoEnd && hasAutoEndSignal(lastLeftResponse);
      if (leftHasSignal) lastLeftResponse = stripAutoEndSignal(lastLeftResponse);

      debateState.transcript.push({ round, speaker: leftLLM, text: lastLeftResponse });
      await persistState();

      if (leftHasSignal) {
        debateState.status = 'completed';
        debateState.nextSpeaker = 'right';
        await persistState();
        stopKeepAlive();
        notifyArena({
          type: MSG.DEBATE_COMPLETE,
          transcript: debateState.transcript,
          reason: 'natural_end',
          partialTurn: { round, speaker: leftLLM, text: lastLeftResponse },
        });
        return;
      }

      if (debateState.status !== 'debating') break;

      // Right LLM responds
      notifyArena({
        type: MSG.DEBATE_UPDATE,
        round,
        phase: 'right_thinking',
        leftLLM,
        rightLLM,
        leftResponse: lastLeftResponse,
        roundLimit: effectiveLimit,
      });

      await sendToFrame(tabId, rightFrameId, {
        type: 'SEND_MESSAGE',
        text: makeFollowupPrompt(topic, lastLeftResponse, round, mode, rightPersonality, isLastRound, setting, autoEnd),
      });

      const rightR = await sendToFrame(tabId, rightFrameId, { type: 'WAIT_FOR_RESPONSE' });
      lastRightResponse = rightR.response;

      const rightHasSignal = autoEnd && hasAutoEndSignal(lastRightResponse);
      if (rightHasSignal) lastRightResponse = stripAutoEndSignal(lastRightResponse);

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
        roundLimit: effectiveLimit,
      });

      if (rightHasSignal) {
        debateState.status = 'completed';
        debateState.nextSpeaker = 'left';
        await persistState();
        stopKeepAlive();
        notifyArena({ type: MSG.DEBATE_COMPLETE, transcript: debateState.transcript, reason: 'natural_end' });
        return;
      }
    }

    // Round limit reached or stopped
    const reason = (debateState.status === 'stopped') ? 'stopped' : 'round_limit';
    debateState.status = 'completed';
    await persistState();
    stopKeepAlive();
    notifyArena({ type: MSG.DEBATE_COMPLETE, transcript: debateState.transcript, reason });
  } catch (err) {
    console.error('[Clash SW] runDebateContinued error:', err.message, err.stack);
    debateState.status = 'error';
    await persistState();
    stopKeepAlive();
    notifyArena({ type: MSG.DEBATE_ERROR, error: err.message });
  }
}

// --- Initialization ---

restoreState();
