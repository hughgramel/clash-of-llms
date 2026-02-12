// Gemini adapter for gemini.google.com
// Selectors verified from live DOM: 2026-02

(() => {
  const SELECTORS = {
    input: [
      '.ql-editor[contenteditable="true"]',
      'rich-textarea div[contenteditable="true"]',
      'div[contenteditable="true"][aria-label*="prompt" i]',
      'div[contenteditable="true"][role="textbox"]',
    ],
    sendButton: [
      'button[aria-label*="Send" i]',
      'button.send-button',
      'button[mattooltip*="Send" i]',
      'button[data-test-id="send-button"]',
    ],
    stopButton: [
      'button[aria-label*="Stop" i]',
      'button[mattooltip*="Stop" i]',
    ],
    // Response structure: message-content > div.markdown.markdown-main-panel > p[data-path-to-node]
    responseMessages: [
      'message-content .markdown',
      'message-content',
      'div[id*="model-response-message-content"]',
      'structured-content-container .markdown',
    ],
    streamingIndicator: [
      'structured-content-container.processing-state-visible',
      'div[class*="loading"]',
      'mat-progress-bar',
      'div[class*="thinking"]',
    ],
  };

  window.__clashAdapter = {
    name: 'gemini',

    // Track response count before each send to detect new responses
    _responseCountBeforeSend: 0,

    async isReady() {
      return findFirst(SELECTORS.input) !== null;
    },

    async sendMessage(text) {
      // Record response count before sending
      const existing = document.querySelectorAll(SELECTORS.responseMessages.join(', '));
      this._responseCountBeforeSend = existing.length;

      const input = findFirst(SELECTORS.input);
      if (!input) throw new Error('Gemini input field not found');

      // Focus and clear
      input.focus();
      await delay(200);

      // Handle contenteditable
      if (input.isContentEditable || input.getAttribute('contenteditable') === 'true') {
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
        await delay(100);

        await clipboardPaste(input, text);
      } else {
        await simulateTyping(input, text);
      }

      await delay(500);

      const sendBtn = findFirst(SELECTORS.sendButton);
      if (sendBtn && !sendBtn.disabled) {
        sendBtn.click();
      } else {
        input.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true,
        }));
      }

      await delay(500);
    },

    async getLatestResponse() {
      const messages = document.querySelectorAll(
        SELECTORS.responseMessages.join(', ')
      );
      if (messages.length === 0) return null;
      return messages[messages.length - 1].innerText.trim();
    },

    async isStreaming() {
      const stopBtn = findFirst(SELECTORS.stopButton);
      if (stopBtn && stopBtn.offsetParent !== null) return true;
      return findFirst(SELECTORS.streamingIndicator) !== null;
    },

    async waitForResponseComplete() {
      const prevCount = this._responseCountBeforeSend || 0;

      // Wait for streaming to start OR a new response to appear (max 15s)
      for (let i = 0; i < 75; i++) {
        if (await this.isStreaming()) break;
        const msgs = document.querySelectorAll(SELECTORS.responseMessages.join(', '));
        if (msgs.length > prevCount) break;
        await delay(200);
      }
      // Wait for streaming to end (max 120s)
      for (let i = 0; i < 600; i++) {
        if (!(await this.isStreaming())) {
          const msgs = document.querySelectorAll(SELECTORS.responseMessages.join(', '));
          if (msgs.length > prevCount) break;
        }
        await delay(200);
      }
      await waitForStable(2000, 10000);
    },
  };
})();
