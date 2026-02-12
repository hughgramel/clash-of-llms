// ChatGPT adapter for chatgpt.com
// Selectors verified from live DOM: 2026-02

(() => {
  const SELECTORS = {
    // ChatGPT now uses ProseMirror - the contenteditable is inside a div with class containing "prosemirror-parent"
    input: [
      '#prompt-textarea',
      'div[class*="prosemirror-parent"] .ProseMirror',
      'div[class*="prosemirror-parent"] [contenteditable="true"]',
      'div[data-composer-surface] [contenteditable="true"]',
      'form [contenteditable="true"]',
      'div[contenteditable="true"][data-placeholder]',
    ],
    sendButton: [
      'button[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
      'form button[aria-label*="Send" i]',
      'button[class*="send"]',
    ],
    stopButton: [
      'button[data-testid="stop-button"]',
      'button[aria-label="Stop generating"]',
      'button[aria-label*="Stop" i]',
    ],
    responseMessages: [
      'div[data-message-author-role="assistant"]',
      'div.agent-turn .markdown',
      'article[data-testid*="conversation"] div[class*="markdown"]',
    ],
    modelSelectorButton: [
      'button[data-testid="model-switcher-dropdown-button"]',
      'button[aria-label*="Model selector" i]',
      'button[aria-label*="model" i][aria-haspopup="menu"]',
    ],
    modelDropdownOption: [
      '[role="menuitemradio"]',
      '[role="option"]',
      '[data-testid*="model-switcher"] [role="menuitem"]',
    ],
  };

  window.__clashAdapter = {
    name: 'chatgpt',

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
      if (!input) throw new Error('ChatGPT input field not found');

      // Focus and clear
      input.focus();
      await delay(200);

      // For ProseMirror contenteditable: use execCommand
      if (input.isContentEditable || input.getAttribute('contenteditable') === 'true') {
        // Select all existing content and delete
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
        await delay(100);

        // Insert the text
        document.execCommand('insertText', false, text);
        await delay(100);

        // Fire input event for React to pick up the change
        input.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: text,
        }));
      } else {
        // Fallback for textarea/input
        await simulateTyping(input, text);
      }

      await delay(500);

      // Try clicking send button
      const sendBtn = findFirst(SELECTORS.sendButton);
      if (sendBtn && !sendBtn.disabled) {
        sendBtn.click();
      } else {
        // Fallback: press Enter
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
      return stopBtn !== null && stopBtn.offsetParent !== null;
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
          // Make sure we have a new response before exiting
          const msgs = document.querySelectorAll(SELECTORS.responseMessages.join(', '));
          if (msgs.length > prevCount) break;
        }
        await delay(200);
      }
      // Extra stabilization
      await waitForStable(2000, 10000);
    },

    async getAvailableModels() {
      try {
        const btn = findFirst(SELECTORS.modelSelectorButton);
        if (!btn) return [];

        // Read current model from aria-label (e.g., "Model selector, current model is 5.2")
        const ariaLabel = btn.getAttribute('aria-label') || '';
        const currentMatch = ariaLabel.match(/current model is (.+)/i);
        const currentModel = currentMatch ? currentMatch[1].trim() : btn.innerText.trim();

        // Open the dropdown
        btn.click();
        await delay(600);

        // Scrape all model options
        const options = document.querySelectorAll(
          SELECTORS.modelDropdownOption.join(', ')
        );
        const models = [];
        const seen = new Set();
        for (const opt of options) {
          const name = opt.innerText.trim();
          if (!name || seen.has(name)) continue;
          seen.add(name);
          const id = opt.getAttribute('data-testid')
                  || opt.getAttribute('data-value')
                  || name;
          const isSelected = opt.getAttribute('aria-checked') === 'true'
                          || name === currentModel;
          models.push({ id, name, selected: isSelected });
        }

        // Close the dropdown
        btn.click();
        await delay(300);
        document.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Escape', code: 'Escape', bubbles: true,
        }));
        await delay(200);

        return models;
      } catch (e) {
        console.error('[Clash] ChatGPT getAvailableModels error:', e);
        return [];
      }
    },

    async selectModel(modelId) {
      const btn = findFirst(SELECTORS.modelSelectorButton);
      if (!btn) throw new Error('ChatGPT model selector button not found');

      // Check if already on the right model
      const ariaLabel = btn.getAttribute('aria-label') || '';
      if (ariaLabel.includes(modelId) || btn.innerText.trim() === modelId) return;

      btn.click();
      await delay(600);

      // Find and click the matching option
      const options = document.querySelectorAll(
        SELECTORS.modelDropdownOption.join(', ')
      );
      let found = false;
      for (const opt of options) {
        const optId = opt.getAttribute('data-testid')
                    || opt.getAttribute('data-value')
                    || opt.innerText.trim();
        if (optId === modelId || opt.innerText.trim() === modelId) {
          opt.click();
          found = true;
          break;
        }
      }

      if (!found) {
        document.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Escape', code: 'Escape', bubbles: true,
        }));
        throw new Error(`ChatGPT model "${modelId}" not found in dropdown`);
      }

      await delay(500);
    },
  };
})();
