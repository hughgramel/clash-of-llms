import http from 'http';

const MOCK_CHATGPT_HTML = `<!DOCTYPE html>
<html>
<head><title>Mock ChatGPT</title></head>
<body style="background:#212121;color:#fff;font-family:sans-serif;">
  <div id="prompt-textarea" contenteditable="true" data-id="root"
       style="min-height:40px;padding:10px;border:1px solid #555;margin:20px;border-radius:8px;"
       data-placeholder="Message ChatGPT"></div>
  <button data-testid="send-button" style="margin:20px;padding:8px 16px;cursor:pointer;">Send</button>
  <div id="messages" style="padding:20px;"></div>
  <script>
    const sendBtn = document.querySelector('[data-testid="send-button"]');
    const input = document.getElementById('prompt-textarea');
    const messages = document.getElementById('messages');

    sendBtn.addEventListener('click', () => {
      const userText = input.innerText.trim();
      if (!userText) return;
      input.innerText = '';

      // User message
      const userDiv = document.createElement('div');
      userDiv.setAttribute('data-message-author-role', 'user');
      userDiv.style.cssText = 'padding:10px;margin:5px 0;background:#333;border-radius:8px;';
      userDiv.textContent = userText;
      messages.appendChild(userDiv);

      // Simulate streaming response
      const responseDiv = document.createElement('div');
      responseDiv.setAttribute('data-message-author-role', 'assistant');
      responseDiv.style.cssText = 'padding:10px;margin:5px 0;background:#2a2a2a;border-radius:8px;';
      messages.appendChild(responseDiv);

      // Add stop button (streaming indicator)
      const stopBtn = document.createElement('button');
      stopBtn.setAttribute('data-testid', 'stop-button');
      stopBtn.textContent = 'Stop';
      stopBtn.style.cssText = 'margin:10px;padding:4px 8px;';
      document.body.appendChild(stopBtn);

      // Simulate typing response over 1 second
      const mockResponse = 'I strongly argue FOR this position. The evidence clearly supports that ' +
        userText.substring(0, 100) + '. This is substantiated by multiple factors including logical reasoning ' +
        'and empirical evidence. The counterarguments fail to address these core points.';
      let charIndex = 0;
      const typeInterval = setInterval(() => {
        if (charIndex < mockResponse.length) {
          responseDiv.textContent = mockResponse.substring(0, charIndex + 1);
          charIndex++;
        } else {
          clearInterval(typeInterval);
          stopBtn.remove();
        }
      }, 10);
    });
  </script>
</body>
</html>`;

// Claude mock with proper .font-claude-response / .font-claude-response-body structure
const MOCK_CLAUDE_HTML = `<!DOCTYPE html>
<html>
<head><title>Mock Claude</title></head>
<body style="background:#2b2a27;color:#fff;font-family:sans-serif;">
  <fieldset style="border:1px solid #555;margin:20px;border-radius:8px;padding:10px;">
    <div class="ProseMirror" contenteditable="true" translate="no"
         style="min-height:40px;" data-placeholder="Reply to Claude..."></div>
    <button aria-label="Send Message" style="padding:8px 16px;cursor:pointer;margin-top:8px;">Send</button>
  </fieldset>
  <div id="messages" style="padding:20px;"></div>
  <script>
    const sendBtn = document.querySelector('[aria-label="Send Message"]');
    const input = document.querySelector('.ProseMirror');
    const messages = document.getElementById('messages');

    sendBtn.addEventListener('click', () => {
      const userText = input.innerText.trim();
      if (!userText) return;
      input.innerText = '';

      // User message
      const userDiv = document.createElement('div');
      userDiv.style.cssText = 'padding:10px;margin:5px 0;background:#3b3a37;border-radius:8px;';
      userDiv.textContent = userText;
      messages.appendChild(userDiv);

      // Simulate Claude's response DOM structure:
      // div[data-is-streaming] > div.font-claude-response > div.standard-markdown > p.font-claude-response-body
      const responseDiv = document.createElement('div');
      responseDiv.setAttribute('data-is-streaming', 'true');
      responseDiv.style.cssText = 'padding:10px;margin:5px 0;background:#333;border-radius:8px;';

      const fontClaudeResponse = document.createElement('div');
      fontClaudeResponse.className = 'font-claude-response';
      responseDiv.appendChild(fontClaudeResponse);

      const standardMarkdown = document.createElement('div');
      standardMarkdown.className = 'standard-markdown';
      fontClaudeResponse.appendChild(standardMarkdown);

      const responseBody = document.createElement('p');
      responseBody.className = 'font-claude-response-body';
      standardMarkdown.appendChild(responseBody);

      // Also add a whitespace-pre-wrap fallback div for compatibility
      const preWrap = document.createElement('div');
      preWrap.className = 'whitespace-pre-wrap';
      preWrap.style.display = 'none';
      responseDiv.appendChild(preWrap);

      messages.appendChild(responseDiv);

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
          responseDiv.setAttribute('data-is-streaming', 'false');
        }
      }, 10);
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
