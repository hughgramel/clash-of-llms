// Grok adapter for grok.com
// Selectors verified from live DOM: 2026-02

(() => {
  const SELECTORS = {
    // Grok uses tiptap ProseMirror contenteditable
    input: [
      'div.tiptap.ProseMirror[contenteditable="true"]',
      'div[class*="ProseMirror"][contenteditable="true"]',
      'div[contenteditable="true"][class*="tiptap"]',
      'textarea[placeholder*="Ask"]',
      'textarea',
    ],
    sendButton: [
      'button[aria-label="Send"]',
      'button[aria-label*="Send" i]',
      'button[type="submit"]',
    ],
    stopButton: [
      'button[aria-label="Stop"]',
      'button[aria-label*="Stop" i]',
    ],
    // Response structure: div.message-bubble > ... > div.response-content-markdown > p
    responseMessages: [
      'div.message-bubble .response-content-markdown',
      'div.message-bubble div[class*="markdown"]',
      'div[class*="message-bubble"]',
    ],
    streamingIndicator: [
      'div[class*="typing"]',
      'div[class*="loading"]',
      'div[class*="streaming"]',
    ],
  };

  window.__clashAdapter = {
    name: 'grok',

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
      if (!input) throw new Error('Grok input field not found');

      // Focus and clear
      input.focus();
      await delay(200);

      // Handle tiptap ProseMirror contenteditable
      if (input.isContentEditable || input.getAttribute('contenteditable') === 'true') {
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
        await delay(100);

        // Use clipboard paste for reliable multi-line insertion in tiptap
        await clipboardPaste(input, text);
      } else {
        // Fallback for textarea/input
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
        input.dispatchEvent(new KeyboardEvent('keyup', {
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
