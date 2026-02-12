// Shared adapter utilities and message router
// Each site-specific adapter registers itself on window.__clashAdapter

function waitForElement(selector, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);

    const observer = new MutationObserver((mutations, obs) => {
      const el = document.querySelector(selector);
      if (el) {
        obs.disconnect();
        resolve(el);
      }
    });

    const root = document.body || document.documentElement;
    observer.observe(root, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for: ${selector}`));
    }, timeout);
  });
}

function waitForStable(stableMs = 1500, timeoutMs = 30000) {
  return new Promise((resolve) => {
    let lastChange = Date.now();
    let checkCount = 0;
    const maxChecks = timeoutMs / 200;

    const target = document.body || document.documentElement;
    const observer = new MutationObserver(() => {
      lastChange = Date.now();
    });

    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    const check = () => {
      checkCount++;
      if (Date.now() - lastChange > stableMs || checkCount >= maxChecks) {
        observer.disconnect();
        resolve();
      } else {
        setTimeout(check, 200);
      }
    };

    setTimeout(check, stableMs);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findFirst(selectorList) {
  for (const sel of selectorList) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

async function simulateTyping(element, text) {
  element.focus();

  if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
    // Standard form element
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    )?.set || Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set;

    if (nativeSetter) {
      nativeSetter.call(element, text);
    } else {
      element.value = text;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (element.getAttribute('contenteditable') === 'true' ||
             element.isContentEditable) {
    // ContentEditable / ProseMirror
    element.focus();
    await delay(100);

    // Use execCommand which works with ProseMirror's internal state
    // First select all existing content and delete it
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    await delay(50);

    // Insert the new text
    document.execCommand('insertText', false, text);

    // Fire events so the framework picks up the change
    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: text,
    }));
  }

  await delay(100);
}

// --- Message Listener ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const adapter = window.__clashAdapter;

  if (!adapter) {
    sendResponse({ success: false, error: 'Adapter not loaded yet' });
    return true;
  }

  (async () => {
    try {
      switch (message.type) {
        case 'PING':
          sendResponse({ success: true, adapter: adapter.name });
          break;

        case 'IS_READY': {
          const ready = await adapter.isReady();
          sendResponse({ success: true, ready });
          break;
        }

        case 'SEND_MESSAGE':
          await adapter.sendMessage(message.text);
          sendResponse({ success: true });
          break;

        case 'GET_LATEST_RESPONSE': {
          const response = await adapter.getLatestResponse();
          sendResponse({ success: true, response });
          break;
        }

        case 'IS_STREAMING': {
          const streaming = await adapter.isStreaming();
          sendResponse({ success: true, streaming });
          break;
        }

        case 'WAIT_FOR_RESPONSE': {
          await adapter.waitForResponseComplete();
          const response = await adapter.getLatestResponse();
          sendResponse({ success: true, response });
          break;
        }

        case 'GET_AVAILABLE_MODELS': {
          if (typeof adapter.getAvailableModels !== 'function') {
            sendResponse({ success: true, models: [] });
            break;
          }
          const models = await adapter.getAvailableModels();
          sendResponse({ success: true, models });
          break;
        }

        case 'SELECT_MODEL': {
          if (typeof adapter.selectModel !== 'function') {
            sendResponse({ success: true, skipped: true });
            break;
          }
          await adapter.selectModel(message.modelId);
          sendResponse({ success: true });
          break;
        }

        default:
          sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
      }
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
  })();

  return true; // Keep channel open for async response
});
