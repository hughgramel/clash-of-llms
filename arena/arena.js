// Arena UI logic and service worker communication

// --- Elements ---

const landing = document.getElementById('landing');
const debateView = document.getElementById('debate-view');
const leftSelect = document.getElementById('left-select');
const rightSelect = document.getElementById('right-select');
const leftIframe = document.getElementById('left-iframe');
const rightIframe = document.getElementById('right-iframe');
const leftLabel = document.getElementById('left-label');
const rightLabel = document.getElementById('right-label');
const leftStatus = document.getElementById('left-status');
const rightStatus = document.getElementById('right-status');
const headerLeftName = document.getElementById('header-left-name');
const headerRightName = document.getElementById('header-right-name');
const topicInput = document.getElementById('topic-input');
const roundLimitInput = document.getElementById('round-limit');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const exportBtn = document.getElementById('export-btn');
const retryBtn = document.getElementById('retry-btn');
const newDebateBtn = document.getElementById('new-debate-btn');
const statusText = document.getElementById('status-text');
const roundCounter = document.getElementById('round-counter');
const statusPill = document.getElementById('status-pill');
const toggleTranscript = document.getElementById('toggle-transcript');
const transcriptPanel = document.getElementById('transcript-panel');
const transcriptContent = document.getElementById('transcript-content');
const configureModelsCheck = document.getElementById('configure-models-check');
const configureBar = document.getElementById('configure-bar');
const configureStartBtn = document.getElementById('configure-start-btn');
const modeCardsContainer = document.getElementById('mode-cards');
const leftPersonalityInput = document.getElementById('left-personality-input');
const rightPersonalityInput = document.getElementById('right-personality-input');
const startBtnText = document.getElementById('start-btn-text');
const settingInput = document.getElementById('setting-input');

// --- Mode & Personality State ---

let currentMode = 'debate';

// --- Debate Data (for PDF export) ---

let debateData = {
  topic: '',
  leftLLM: '',
  rightLLM: '',
  roundLimit: null,
  startTime: null,
  mode: 'debate',
  turns: [],
};

// --- Textarea Auto-Expand ---

topicInput.addEventListener('input', () => {
  topicInput.style.height = 'auto';
  topicInput.style.height = Math.min(topicInput.scrollHeight, 240) + 'px';
});

topicInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    startBtn.click();
  }
});

// --- Pane Labels ---

function updatePaneLabels() {
  const leftConfig = LLM_CONFIG[leftSelect.value];
  const rightConfig = LLM_CONFIG[rightSelect.value];
  if (leftConfig) {
    leftLabel.textContent = leftConfig.name;
    headerLeftName.textContent = leftConfig.name;
  }
  if (rightConfig) {
    rightLabel.textContent = rightConfig.name;
    headerRightName.textContent = rightConfig.name;
  }
}

leftSelect.addEventListener('change', () => {
  updatePaneLabels();
  if (document.body.classList.contains('debate-active')) loadIframes();
});
rightSelect.addEventListener('change', () => {
  updatePaneLabels();
  if (document.body.classList.contains('debate-active')) loadIframes();
});
updatePaneLabels();

// --- Mode Cards ---

function renderModeCards() {
  modeCardsContainer.innerHTML = '';
  for (const [key, mode] of Object.entries(INTERACTION_MODES)) {
    const btn = document.createElement('button');
    btn.className = 'mode-card' + (key === currentMode ? ' active' : '');
    btn.dataset.mode = key;
    btn.innerHTML = '<span class="mode-card-icon">' + mode.icon + '</span>'
      + '<span class="mode-card-label">' + mode.label + '</span>'
      + '<span class="mode-card-desc">' + mode.description + '</span>';
    btn.addEventListener('click', () => {
      currentMode = key;
      modeCardsContainer.querySelectorAll('.mode-card').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      topicInput.placeholder = mode.topicPlaceholder;
      startBtnText.textContent = mode.buttonLabel;
    });
    modeCardsContainer.appendChild(btn);
  }
}

renderModeCards();

// --- Transitions ---

function transitionToDebate() {
  // Load iframes now (not before) so LLM sites don't load on the landing page
  loadIframes();
  updatePaneLabels();
  document.body.classList.add('debate-active');
}

function transitionToLanding() {
  document.body.classList.remove('debate-active');
  leftIframe.src = 'about:blank';
  rightIframe.src = 'about:blank';
  topicInput.value = '';
  topicInput.style.height = '';
  roundLimitInput.value = '';
  stopBtn.style.display = '';
  newDebateBtn.style.display = 'none';
  exportBtn.disabled = true;
  configureBar.classList.add('hidden');
  leftPersonalityInput.value = '';
  rightPersonalityInput.value = '';
  settingInput.value = '';

  // Reset mode to default
  currentMode = 'debate';
  renderModeCards();
  topicInput.placeholder = INTERACTION_MODES.debate.topicPlaceholder;
  startBtnText.textContent = INTERACTION_MODES.debate.buttonLabel;

  // Iframes stay at about:blank — they'll reload when the next debate starts
}

// --- Iframe Loading ---

function loadIframe(iframe, llmKey) {
  const config = LLM_CONFIG[llmKey];
  if (config) {
    iframe.src = config.url;
  }
}

function loadIframes() {
  loadIframe(leftIframe, leftSelect.value);
  loadIframe(rightIframe, rightSelect.value);
}

// --- Divider Drag Resize ---

const divider = document.getElementById('divider');
const leftPane = document.getElementById('left-pane');
const rightPane = document.getElementById('right-pane');
let isDragging = false;

divider.addEventListener('mousedown', () => {
  isDragging = true;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  leftIframe.style.pointerEvents = 'none';
  rightIframe.style.pointerEvents = 'none';
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const arena = document.getElementById('arena');
  const rect = arena.getBoundingClientRect();
  const pct = ((e.clientX - rect.left) / rect.width) * 100;
  const clamped = Math.max(20, Math.min(80, pct));
  leftPane.style.flex = `0 0 ${clamped}%`;
  rightPane.style.flex = `0 0 ${100 - clamped}%`;
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    leftIframe.style.pointerEvents = '';
    rightIframe.style.pointerEvents = '';
  }
});

// --- Transcript Panel Toggle ---

const toggleTranscriptLabel = toggleTranscript.querySelector('span');

toggleTranscript.addEventListener('click', () => {
  const isCollapsed = transcriptPanel.classList.contains('collapsed');
  transcriptPanel.classList.toggle('collapsed', !isCollapsed);
  transcriptPanel.classList.toggle('expanded', isCollapsed);
  if (toggleTranscriptLabel) {
    toggleTranscriptLabel.textContent = isCollapsed ? 'Hide Transcript' : 'Show Transcript';
  }
});

// --- Service Worker Communication ---

let port = null;

function connectToServiceWorker() {
  port = chrome.runtime.connect({ name: 'arena' });

  port.onMessage.addListener((msg) => {
    console.log('[Clash Arena] received from SW:', msg.type, msg);
    switch (msg.type) {
      case MSG.DEBATE_UPDATE:
        handleDebateUpdate(msg);
        break;
      case MSG.DEBATE_COMPLETE:
        handleDebateComplete(msg);
        break;
      case MSG.DEBATE_ERROR:
        console.error('[Clash Arena] DEBATE_ERROR:', msg.error);
        handleDebateError(msg);
        break;
    }
  });

  port.onDisconnect.addListener(() => {
    setTimeout(connectToServiceWorker, 1000);
  });
}

connectToServiceWorker();

// Iframes are NOT loaded on the landing page — they load when the debate starts

// --- Start Debate ---

function beginDebate() {
  const topic = debateData.topic;
  const roundLimit = debateData.roundLimit;

  statusText.textContent = 'Starting...';
  statusPill.className = 'status-pill debating';
  roundCounter.textContent = roundLimit ? `/ ${roundLimit}` : '';
  transcriptContent.innerHTML = '';
  transcriptTurnNum = 0;
  exportBtn.disabled = true;
  stopBtn.style.display = '';
  retryBtn.style.display = 'none';
  newDebateBtn.style.display = 'none';
  configureBar.classList.add('hidden');

  const startMsg = {
    type: MSG.START_DEBATE,
    topic,
    roundLimit,
    leftLLM: debateData.leftLLM,
    rightLLM: debateData.rightLLM,
    mode: debateData.mode,
    leftPersonality: leftPersonalityInput.value.trim() || '',
    rightPersonality: rightPersonalityInput.value.trim() || '',
    setting: settingInput.value.trim() || '',
  };
  console.log('[Clash Arena] beginDebate sending:', JSON.stringify(startMsg, null, 2));
  port.postMessage(startMsg);
}

startBtn.addEventListener('click', () => {
  const topic = topicInput.value.trim();
  if (!topic) {
    topicInput.classList.add('error');
    topicInput.focus();
    setTimeout(() => topicInput.classList.remove('error'), 1500);
    return;
  }

  const roundLimit = parseInt(roundLimitInput.value) || null;

  debateData = {
    topic,
    leftLLM: leftSelect.value,
    rightLLM: rightSelect.value,
    roundLimit,
    startTime: new Date(),
    mode: currentMode,
    turns: [],
  };

  transitionToDebate();

  if (configureModelsCheck.checked) {
    // Show configure bar — user sets models manually, then clicks Start
    configureBar.classList.remove('hidden');
  } else {
    // Start debate immediately
    beginDebate();
  }
});

configureStartBtn.addEventListener('click', () => {
  beginDebate();
});

retryBtn.addEventListener('click', () => {
  retryBtn.style.display = 'none';
  newDebateBtn.style.display = 'none';
  // Reload iframes fresh and retry
  loadIframes();
  beginDebate();
});

// --- Stop Debate ---

stopBtn.addEventListener('click', () => {
  port.postMessage({ type: MSG.STOP_DEBATE });
  statusText.textContent = 'Stopped';
  statusPill.className = 'status-pill';
  leftStatus.textContent = '';
  leftStatus.className = 'pane-status';
  rightStatus.textContent = '';
  rightStatus.className = 'pane-status';
  stopBtn.style.display = 'none';
  newDebateBtn.style.display = '';
  if (debateData.turns.length > 0) {
    exportBtn.disabled = false;
  }
});

// --- New Debate ---

newDebateBtn.addEventListener('click', () => {
  transitionToLanding();
});

// --- Handle Debate Updates ---

function handleDebateUpdate(msg) {
  const { round, phase, leftResponse, rightResponse } = msg;

  statusText.textContent = `Round ${round}`;
  statusPill.className = 'status-pill debating';
  roundCounter.textContent = msg.roundLimit ? `/ ${msg.roundLimit}` : '';

  if (phase === 'left_thinking') {
    leftStatus.textContent = 'Thinking';
    leftStatus.className = 'pane-status thinking';
    rightStatus.textContent = '';
    rightStatus.className = 'pane-status';
  } else if (phase === 'right_thinking') {
    leftStatus.textContent = '';
    leftStatus.className = 'pane-status';
    rightStatus.textContent = 'Thinking';
    rightStatus.className = 'pane-status thinking';
  } else if (phase === 'complete') {
    leftStatus.textContent = '';
    leftStatus.className = 'pane-status';
    rightStatus.textContent = '';
    rightStatus.className = 'pane-status';

    const modeConfig = INTERACTION_MODES[debateData.mode] || INTERACTION_MODES.debate;
    const leftTurnNum = debateData.turns.length + 1;
    debateData.turns.push({
      turn: leftTurnNum,
      round,
      speaker: msg.leftLLM,
      position: modeConfig.roles.left,
      text: leftResponse || '',
    });
    debateData.turns.push({
      turn: leftTurnNum + 1,
      round,
      speaker: msg.rightLLM,
      position: modeConfig.roles.right,
      text: rightResponse || '',
    });

    appendTranscriptRound(round, msg.leftLLM, leftResponse, msg.rightLLM, rightResponse);
  }
}

function handleDebateComplete(msg) {
  statusText.textContent = 'Complete';
  statusPill.className = 'status-pill complete';
  leftStatus.textContent = '';
  leftStatus.className = 'pane-status';
  rightStatus.textContent = '';
  rightStatus.className = 'pane-status';
  exportBtn.disabled = false;
  stopBtn.style.display = 'none';
  retryBtn.style.display = 'none';
  newDebateBtn.style.display = '';
}

function handleDebateError(msg) {
  statusText.textContent = `Error: ${msg.error}`;
  statusPill.className = 'status-pill';
  leftStatus.textContent = '';
  leftStatus.className = 'pane-status';
  rightStatus.textContent = '';
  rightStatus.className = 'pane-status';
  stopBtn.style.display = 'none';
  retryBtn.style.display = '';
  newDebateBtn.style.display = '';
  if (debateData.turns.length > 0) {
    exportBtn.disabled = false;
  }
}

// --- Transcript Rendering ---

let transcriptTurnNum = 0;

function appendTranscriptRound(round, leftLLM, leftText, rightLLM, rightText) {
  const roundDiv = document.createElement('div');
  roundDiv.className = 'transcript-round';

  const leftName = LLM_CONFIG[leftLLM]?.name || leftLLM;
  const rightName = LLM_CONFIG[rightLLM]?.name || rightLLM;
  const modeConfig = INTERACTION_MODES[debateData.mode] || INTERACTION_MODES.debate;

  const leftTurn = ++transcriptTurnNum;
  const rightTurn = ++transcriptTurnNum;

  roundDiv.innerHTML = `
    <div class="transcript-round-header">Round ${round}</div>
    <div class="transcript-entry">
      <div class="transcript-speaker">Turn #${leftTurn} — ${leftName} (${modeConfig.roles.left})</div>
      <div class="transcript-text">${escapeHtml(leftText || '...')}</div>
    </div>
    <div class="transcript-entry">
      <div class="transcript-speaker">Turn #${rightTurn} — ${rightName} (${modeConfig.roles.right})</div>
      <div class="transcript-text">${escapeHtml(rightText || '...')}</div>
    </div>
  `;

  transcriptContent.appendChild(roundDiv);
  transcriptContent.scrollTop = transcriptContent.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// --- Export to PDF ---

exportBtn.addEventListener('click', exportToPDF);

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m
    ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
    : [136, 136, 136];
}

function exportToPDF() {
  if (debateData.turns.length === 0) return;

  // Disable button during generation
  exportBtn.disabled = true;
  const origHTML = exportBtn.innerHTML;
  exportBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
    Saving...
  `;

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const ml = 50, mr = 50, mt = 50, mb = 50;
    const contentW = pageW - ml - mr;
    let y = mt;

    function checkPage(needed) {
      if (y + needed > pageH - mb) {
        doc.addPage();
        y = mt;
      }
    }

    // --- Config ---
    const leftConfig = LLM_CONFIG[debateData.leftLLM] || {};
    const rightConfig = LLM_CONFIG[debateData.rightLLM] || {};
    const totalRounds = debateData.turns.length > 0
      ? debateData.turns[debateData.turns.length - 1].round
      : 0;
    const dateStr = debateData.startTime
      ? debateData.startTime.toLocaleDateString('en-US', {
          year: 'numeric', month: 'long', day: 'numeric',
        })
      : new Date().toLocaleDateString('en-US', {
          year: 'numeric', month: 'long', day: 'numeric',
        });

    // --- Header ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(156, 163, 175);
    const modeLabel = (INTERACTION_MODES[debateData.mode] || INTERACTION_MODES.debate).label;
    doc.text('CLASH OF LLMS \u2014 ' + modeLabel.toUpperCase() + ' TRANSCRIPT', pageW / 2, y, { align: 'center' });
    y += 30;

    doc.setFontSize(20);
    doc.setTextColor(17, 24, 39);
    const topicLines = doc.splitTextToSize(
      '\u201C' + debateData.topic + '\u201D',
      contentW - 40,
    );
    doc.text(topicLines, pageW / 2, y, { align: 'center' });
    y += topicLines.length * 26 + 20;

    // Matchup
    const leftName = leftConfig.name || debateData.leftLLM;
    const rightName = rightConfig.name || debateData.rightLLM;
    const [lr, lg, lb] = hexToRgb(leftConfig.color || '#888');
    const [rr, rg, rb] = hexToRgb(rightConfig.color || '#888');

    const pdfModeConfig = INTERACTION_MODES[debateData.mode] || INTERACTION_MODES.debate;
    const matchupY = y;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(55, 65, 81);
    doc.setFillColor(lr, lg, lb);
    doc.circle(pageW / 2 - 120, matchupY - 4, 6, 'F');
    doc.text(leftName, pageW / 2 - 108, matchupY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(156, 163, 175);
    doc.text(pdfModeConfig.roles.left, pageW / 2 - 108, matchupY + 13);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(209, 213, 219);
    doc.text('VS', pageW / 2, matchupY + 4, { align: 'center' });

    doc.setFontSize(13);
    doc.setTextColor(55, 65, 81);
    doc.setFillColor(rr, rg, rb);
    doc.circle(pageW / 2 + 50, matchupY - 4, 6, 'F');
    doc.text(rightName, pageW / 2 + 62, matchupY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(156, 163, 175);
    doc.text(pdfModeConfig.roles.right, pageW / 2 + 62, matchupY + 13);

    y = matchupY + 32;

    // Date & stats
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(156, 163, 175);
    const statsText = dateStr + ' \u2014 ' + totalRounds + ' round'
      + (totalRounds !== 1 ? 's' : '') + ', ' + debateData.turns.length + ' turns';
    doc.text(statsText, pageW / 2, y, { align: 'center' });
    y += 24;

    // Divider
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(1.5);
    doc.line(ml, y, pageW - mr, y);
    y += 28;

    // --- Turns ---
    let currentRound = 0;

    for (const turn of debateData.turns) {
      // Round header
      if (turn.round !== currentRound) {
        currentRound = turn.round;
        checkPage(40);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(156, 163, 175);
        doc.text('ROUND ' + turn.round, ml, y);
        y += 22;
      }

      const config = LLM_CONFIG[turn.speaker] || {};
      const speakerName = config.name || turn.speaker;
      const [cr, cg, cb] = hexToRgb(config.color || '#888888');

      // Ensure header + a few body lines fit
      checkPage(60);

      // Colored accent circle
      doc.setFillColor(cr, cg, cb);
      doc.circle(ml + 6, y - 4, 5, 'F');

      // Speaker line
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(55, 65, 81);
      const headerText = 'Turn #' + turn.turn + ' \u2014 ' + speakerName;
      doc.text(headerText, ml + 20, y);

      // Position label
      const headerW = doc.getTextWidth(headerText);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(156, 163, 175);
      doc.text(turn.position, ml + 20 + headerW + 8, y);
      y += 18;

      // Body text
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(55, 65, 81);
      const bodyLines = doc.splitTextToSize(turn.text, contentW - 24);

      for (const line of bodyLines) {
        checkPage(14);
        doc.text(line, ml + 20, y);
        y += 14;
      }

      y += 12;

      // Separator
      doc.setDrawColor(240, 240, 240);
      doc.setLineWidth(0.5);
      doc.line(ml, y, pageW - mr, y);
      y += 16;
    }

    // --- Footer ---
    checkPage(40);
    y += 8;
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.5);
    doc.line(ml, y, pageW - mr, y);
    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(156, 163, 175);
    doc.text('Generated by Clash of LLMs', pageW / 2, y, { align: 'center' });

    // --- Download ---
    const safeFilename = debateData.topic
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .substring(0, 60)
      || 'debate';

    doc.save(safeFilename + '.pdf');
  } catch (err) {
    console.error('PDF export failed:', err);
  } finally {
    exportBtn.disabled = false;
    exportBtn.innerHTML = origHTML;
  }
}
