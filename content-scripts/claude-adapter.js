// Claude adapter for claude.ai
// Selectors verified from live DOM: 2026-02

(() => {
  const SELECTORS = {
    // Claude uses ProseMirror contenteditable inside data-chat-input-container
    input: [
      'div[data-chat-input-container] [contenteditable="true"]',
      'div[data-chat-input-container] .ProseMirror',
      'fieldset .ProseMirror[contenteditable="true"]',
      'fieldset div[contenteditable="true"]',
      'div.ProseMirror[contenteditable="true"]',
      'div[contenteditable="true"][translate="no"]',
    ],
    sendButton: [
      'div[data-chat-input-container] button[aria-label="Send Message"]',
      'div[data-chat-input-container] button[aria-label*="Send" i]',
      'fieldset button[aria-label="Send Message"]',
      'button[aria-label="Send Message"]',
      'button[aria-label*="Send message" i]',
    ],
    stopButton: [
      'button[aria-label="Stop Response"]',
      'button[aria-label*="Stop" i]',
    ],
    modelSelectorButton: [
      'button[data-testid="model-selector-dropdown"]',
      'button[aria-haspopup="menu"][aria-label*="model" i]',
    ],
    modelDropdownOption: [
      '[data-radix-popper-content-wrapper] [role="option"]',
      '[data-radix-popper-content-wrapper] [role="menuitemradio"]',
      '[data-radix-popper-content-wrapper] button[role="menuitem"]',
      '[role="listbox"] [role="option"]',
    ],
    // Response structure: div[data-is-streaming] > ... > .font-claude-response > .standard-markdown > p.font-claude-response-body
    streamingIndicator: [
      'div[data-is-streaming="true"]',
    ],
  };

  window.__clashAdapter = {
    name: 'claude',

    // Track response count before each send to detect new responses
    _responseCountBeforeSend: 0,

    _countStreamingDivs() {
      return document.querySelectorAll('div[data-is-streaming]').length;
    },

    async isReady() {
      return findFirst(SELECTORS.input) !== null;
    },

    async sendMessage(text) {
      // Record the number of response containers before we send
      this._responseCountBeforeSend = this._countStreamingDivs();

      const input = findFirst(SELECTORS.input);
      if (!input) throw new Error('Claude input field not found');

      // Focus the element
      input.focus();
      await delay(300);

      // ProseMirror contenteditable
      if (input.isContentEditable || input.getAttribute('contenteditable') === 'true') {
        // Select all and delete existing content
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
        await delay(100);

        // Insert text via execCommand (proper ProseMirror interaction)
        document.execCommand('insertText', false, text);
        await delay(200);

        // Fire input event so React/framework picks up the change
        input.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: text,
        }));
      } else {
        await simulateTyping(input, text);
      }

      await delay(500);

      // Click send button
      const sendBtn = findFirst(SELECTORS.sendButton);
      if (sendBtn && !sendBtn.disabled) {
        sendBtn.click();
      } else {
        // Fallback: Enter key
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
      // Get all response containers (div[data-is-streaming]) and use the last one
      const streamingDivs = document.querySelectorAll('div[data-is-streaming]');
      if (streamingDivs.length > 0) {
        const lastContainer = streamingDivs[streamingDivs.length - 1];

        // Look for .font-claude-response blocks within this container
        const responseBlocks = lastContainer.querySelectorAll('.font-claude-response');
        if (responseBlocks.length > 0) {
          const text = Array.from(responseBlocks)
            .map(block => block.innerText.trim())
            .filter(Boolean)
            .join('\n\n');
          if (text) return text;
        }

        // Fallback: try other content selectors within this container
        const altContent = lastContainer.querySelector('.standard-markdown, .whitespace-pre-wrap');
        if (altContent) {
          const text = altContent.innerText.trim();
          if (text) return text;
        }

        // Last resort: full container text
        const fullText = lastContainer.innerText.trim();
        if (fullText) return fullText;
      }

      // Final fallback for older DOM structures
      const allResponses = document.querySelectorAll(
        '.font-claude-response, .whitespace-pre-wrap'
      );
      if (allResponses.length === 0) return null;
      return allResponses[allResponses.length - 1].innerText.trim();
    },

    async isStreaming() {
      return findFirst(SELECTORS.streamingIndicator) !== null;
    },

    async waitForResponseComplete() {
      const prevCount = this._responseCountBeforeSend || 0;

      // Phase 1: Wait for a NEW response container to appear (max 30s)
      // A new response = div[data-is-streaming] count increases
      let newResponseDetected = false;
      for (let i = 0; i < 150; i++) {
        const currentCount = this._countStreamingDivs();
        if (currentCount > prevCount) {
          newResponseDetected = true;
          break;
        }
        // Also check if streaming started (data-is-streaming="true")
        if (await this.isStreaming()) {
          newResponseDetected = true;
          break;
        }
        await delay(200);
      }

      if (!newResponseDetected) {
        // Give a generous wait in case the DOM structure is unexpected
        await delay(5000);
        return;
      }

      // Phase 2: Wait for streaming to end on the response (max 120s)
      // We wait for data-is-streaming="true" to disappear
      for (let i = 0; i < 600; i++) {
        if (!(await this.isStreaming())) {
          // Double-check: make sure the response actually has content
          const currentCount = this._countStreamingDivs();
          if (currentCount > prevCount) break;
        }
        await delay(200);
      }

      // Phase 3: Stabilize - wait for DOM to stop changing
      await waitForStable(2000, 10000);
    },

    async getAvailableModels() {
      try {
        const btn = findFirst(SELECTORS.modelSelectorButton);
        if (!btn) return [];

        const currentModel = btn.innerText.trim();

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
          models.push({
            id,
            name,
            selected: name === currentModel,
          });
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
        console.error('[Clash] Claude getAvailableModels error:', e);
        return [];
      }
    },

    async selectModel(modelId) {
      const btn = findFirst(SELECTORS.modelSelectorButton);
      if (!btn) throw new Error('Claude model selector button not found');

      // Check if already on the right model
      if (btn.innerText.trim() === modelId) return;

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
        throw new Error(`Claude model "${modelId}" not found in dropdown`);
      }

      await delay(500);
    },
  };
})();
