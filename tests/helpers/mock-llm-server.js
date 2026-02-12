import http from 'http';

const MOCK_CHATGPT_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>ChatGPT</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #212121;
      color: #ececec;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 15px;
      line-height: 1.6;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .chat-container {
      flex: 1;
      overflow-y: auto;
      padding: 16px 0;
    }
    .message-row {
      max-width: 768px;
      margin: 0 auto;
      padding: 12px 24px;
    }
    .message-row.user { }
    .message-row.assistant { background: #2f2f2f; border-radius: 12px; margin: 8px auto; }
    .message-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
      font-weight: 600;
      font-size: 14px;
    }
    .avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .avatar.user-avatar { background: #9b59b6; color: #fff; }
    .avatar.gpt-avatar { background: #10a37f; color: #fff; }
    .message-text {
      padding-left: 38px;
      color: #d1d5db;
      line-height: 1.7;
    }
    .input-area {
      border-top: 1px solid #383838;
      padding: 16px 24px;
      background: #212121;
    }
    .input-wrap {
      max-width: 768px;
      margin: 0 auto;
      position: relative;
      background: #303030;
      border: 1px solid #424242;
      border-radius: 16px;
      display: flex;
      align-items: flex-end;
      padding: 8px 12px;
    }
    #prompt-textarea {
      flex: 1;
      min-height: 24px;
      max-height: 200px;
      outline: none;
      color: #ececec;
      font-size: 15px;
      line-height: 1.5;
      padding: 4px 8px;
      overflow-y: auto;
    }
    #prompt-textarea:empty:before {
      content: attr(data-placeholder);
      color: #8e8ea0;
    }
    [data-testid="send-button"] {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: none;
      background: #ececec;
      color: #212121;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-left: 8px;
      font-size: 16px;
    }
    [data-testid="send-button"]:hover { background: #fff; }
    [data-testid="stop-button"] {
      display: block;
      margin: 8px auto;
      padding: 6px 16px;
      background: #424242;
      color: #ececec;
      border: 1px solid #555;
      border-radius: 20px;
      cursor: pointer;
      font-size: 13px;
    }
    .disclaimer {
      text-align: center;
      font-size: 11px;
      color: #8e8ea0;
      padding: 8px;
    }
  </style>
</head>
<body>
  <div class="chat-container" id="messages"></div>
  <div class="input-area">
    <div class="input-wrap">
      <div id="prompt-textarea" contenteditable="true" data-id="root"
           data-placeholder="Message ChatGPT"></div>
      <button data-testid="send-button" aria-label="Send prompt">&#8593;</button>
    </div>
  </div>
  <div class="disclaimer">ChatGPT can make mistakes. Check important info.</div>
  <script>
    const sendBtn = document.querySelector('[data-testid="send-button"]');
    const input = document.getElementById('prompt-textarea');
    const messages = document.getElementById('messages');

    sendBtn.addEventListener('click', () => {
      const userText = input.innerText.trim();
      if (!userText) return;
      input.innerText = '';

      // User message
      const userRow = document.createElement('div');
      userRow.className = 'message-row user';
      userRow.setAttribute('data-message-author-role', 'user');
      userRow.innerHTML =
        '<div class="message-header"><div class="avatar user-avatar">H</div><span>You</span></div>' +
        '<div class="message-text">' + userText.replace(/</g, '&lt;') + '</div>';
      messages.appendChild(userRow);

      // Assistant response
      const assistRow = document.createElement('div');
      assistRow.className = 'message-row assistant';
      assistRow.setAttribute('data-message-author-role', 'assistant');
      assistRow.innerHTML =
        '<div class="message-header"><div class="avatar gpt-avatar">G</div><span>ChatGPT</span></div>' +
        '<div class="message-text"></div>';
      messages.appendChild(assistRow);

      const responseText = assistRow.querySelector('.message-text');

      const stopBtn = document.createElement('button');
      stopBtn.setAttribute('data-testid', 'stop-button');
      stopBtn.textContent = 'Stop generating';
      messages.parentElement.insertBefore(stopBtn, messages.nextSibling);

      const mockResponse = 'I strongly argue FOR this position. The evidence clearly supports that ' +
        userText.substring(0, 100) + '. This is substantiated by multiple factors including logical reasoning ' +
        'and empirical evidence. The counterarguments fail to address these core points.';
      let charIndex = 0;
      const typeInterval = setInterval(() => {
        if (charIndex < mockResponse.length) {
          responseText.textContent = mockResponse.substring(0, charIndex + 1);
          charIndex++;
        } else {
          clearInterval(typeInterval);
          stopBtn.remove();
        }
      }, 10);
      messages.scrollTop = messages.scrollHeight;
    });
  </script>
</body>
</html>`;

const MOCK_CLAUDE_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Claude</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #2b2a27;
      color: #e8e4dd;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 15px;
      line-height: 1.6;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .chat-container {
      flex: 1;
      overflow-y: auto;
      padding: 16px 0;
    }
    .message-row {
      max-width: 768px;
      margin: 0 auto;
      padding: 16px 24px;
    }
    .message-row.user { }
    .message-row.assistant {
      background: #3b3a36;
      border-radius: 12px;
      margin: 8px auto;
    }
    .message-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
      font-weight: 600;
      font-size: 14px;
    }
    .avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .avatar.user-avatar { background: #8b5cf6; color: #fff; }
    .avatar.claude-avatar { background: #d97706; color: #fff; }
    .font-claude-response {
      padding-left: 38px;
      color: #d5d0c8;
      line-height: 1.7;
    }
    .standard-markdown p {
      margin-bottom: 12px;
    }
    .input-area {
      border-top: 1px solid #3f3e3a;
      padding: 16px 24px;
      background: #2b2a27;
    }
    fieldset {
      max-width: 768px;
      margin: 0 auto;
      border: 1px solid #4a4945;
      border-radius: 16px;
      padding: 8px 12px;
      display: flex;
      align-items: flex-end;
      background: #343330;
    }
    .ProseMirror {
      flex: 1;
      min-height: 24px;
      max-height: 200px;
      outline: none;
      color: #e8e4dd;
      font-size: 15px;
      line-height: 1.5;
      padding: 4px 8px;
      overflow-y: auto;
    }
    .ProseMirror:empty:before {
      content: attr(data-placeholder);
      color: #8a8780;
    }
    [aria-label="Send Message"] {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: none;
      background: #d97706;
      color: #fff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-left: 8px;
      font-size: 16px;
    }
    [aria-label="Send Message"]:hover { background: #e68a09; }
    .disclaimer {
      text-align: center;
      font-size: 11px;
      color: #8a8780;
      padding: 8px;
    }
  </style>
</head>
<body>
  <div class="chat-container" id="messages"></div>
  <div class="input-area">
    <fieldset>
      <div class="ProseMirror" contenteditable="true" translate="no"
           data-placeholder="Reply to Claude..."></div>
      <button aria-label="Send Message">&#8593;</button>
    </fieldset>
  </div>
  <div class="disclaimer">Claude can make mistakes. Please double-check responses.</div>
  <script>
    const sendBtn = document.querySelector('[aria-label="Send Message"]');
    const input = document.querySelector('.ProseMirror');
    const messages = document.getElementById('messages');

    sendBtn.addEventListener('click', () => {
      const userText = input.innerText.trim();
      if (!userText) return;
      input.innerText = '';

      // User message
      const userRow = document.createElement('div');
      userRow.className = 'message-row user';
      userRow.innerHTML =
        '<div class="message-header"><div class="avatar user-avatar">H</div><span>You</span></div>' +
        '<div style="padding-left:38px;color:#d5d0c8;">' + userText.replace(/</g, '&lt;') + '</div>';
      messages.appendChild(userRow);

      // Claude response with proper DOM structure
      const assistRow = document.createElement('div');
      assistRow.className = 'message-row assistant';
      assistRow.setAttribute('data-is-streaming', 'true');
      assistRow.innerHTML =
        '<div class="message-header"><div class="avatar claude-avatar">C</div><span>Claude</span></div>' +
        '<div class="font-claude-response"><div class="standard-markdown">' +
        '<p class="font-claude-response-body"></p>' +
        '</div></div>' +
        '<div class="whitespace-pre-wrap" style="display:none;"></div>';
      messages.appendChild(assistRow);

      const responseBody = assistRow.querySelector('.font-claude-response-body');
      const preWrap = assistRow.querySelector('.whitespace-pre-wrap');

      const mockResponse = 'I present a compelling counter-argument AGAINST this position. While ' +
        'the opposing side raises some points, they fail to consider critical nuances. ' +
        'The evidence actually demonstrates the opposite conclusion when examined closely. ' +
        'Furthermore, the logical framework used is flawed in several key respects.';
      let charIndex = 0;
      const typeInterval = setInterval(() => {
        if (charIndex < mockResponse.length) {
          responseBody.textContent = mockResponse.substring(0, charIndex + 1);
          preWrap.textContent = mockResponse.substring(0, charIndex + 1);
          charIndex++;
        } else {
          clearInterval(typeInterval);
          assistRow.setAttribute('data-is-streaming', 'false');
        }
      }, 10);
      messages.scrollTop = messages.scrollHeight;
    });
  </script>
</body>
</html>`;

export function createMockLLMServer(port = 3456) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });

      if (req.url.includes('mock-chatgpt') || req.url.includes('chatgpt')) {
        res.end(MOCK_CHATGPT_HTML);
      } else if (req.url.includes('mock-claude') || req.url.includes('claude')) {
        res.end(MOCK_CLAUDE_HTML);
      } else {
        res.end(`<!DOCTYPE html><html><body style="background:#222;color:#fff;">
          <p>Mock LLM Server - use /mock-chatgpt or /mock-claude</p>
        </body></html>`);
      }
    });

    server.listen(port, () => {
      console.log(`Mock LLM server running on http://localhost:${port}`);
      resolve(server);
    });

    server.on('error', reject);
  });
}
