// Perplexity adapter for perplexity.ai
// Selectors last verified: 2025-01

(() => {
  const SELECTORS = {
    input: [
      'textarea[placeholder*="Ask" i]',
      'textarea[placeholder*="anything" i]',
      'textarea',
      'div[contenteditable="true"][role="textbox"]',
    ],
    sendButton: [
      'button[aria-label="Submit"]',
      'button[aria-label*="Send" i]',
      'button[type="submit"]',
      'button[class*="submit" i]',
    ],
    stopButton: [
      'button[aria-label="Stop"]',
      'button[aria-label*="Stop" i]',
    ],
    responseMessages: [
      'div[class*="prose"]',
      'div[class*="answer"]',
      'div[class*="response"]',
      'div[class*="markdown"]',
    ],
    streamingIndicator: [
      'div[class*="loading"]',
      'div[class*="streaming"]',
      'div[class*="typing"]',
    ],
  };

  window.__clashAdapter = {
    name: 'perplexity',

    async isReady() {
      return findFirst(SELECTORS.input) !== null;
    },

    async sendMessage(text) {
      const input = findFirst(SELECTORS.input);
      if (!input) throw new Error('Perplexity input field not found');

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
