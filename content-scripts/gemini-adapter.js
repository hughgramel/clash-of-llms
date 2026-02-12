// Gemini adapter for gemini.google.com
// Selectors last verified: 2025-01

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
    responseMessages: [
      'message-content',
      'model-response .markdown',
      'div[class*="response-container"] .markdown',
      'div[class*="model-response"]',
    ],
    streamingIndicator: [
      'div[class*="loading"]',
      'mat-progress-bar',
      'div[class*="thinking"]',
    ],
  };

  window.__clashAdapter = {
    name: 'gemini',

    async isReady() {
      return findFirst(SELECTORS.input) !== null;
    },

    async sendMessage(text) {
      const input = findFirst(SELECTORS.input);
      if (!input) throw new Error('Gemini input field not found');

      await simulateTyping(input, text);
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
      for (let i = 0; i < 75; i++) {
        if (await this.isStreaming()) break;
        await delay(200);
      }
      for (let i = 0; i < 600; i++) {
        if (!(await this.isStreaming())) break;
        await delay(200);
      }
      await waitForStable(2000, 10000);
    },
  };
})();
