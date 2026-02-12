// Runs at document_start to prevent frame-busting scripts
// Must execute before the page's own JavaScript

(function () {
  if (window.top === window.self) return; // Not in an iframe, skip

  try {
    // Override window.top to return window.self
    Object.defineProperty(window, 'top', {
      get: function () { return window.self; },
      configurable: false,
    });
  } catch (e) {
    // Some browsers may not allow redefining window.top
  }

  try {
    // Override window.parent to return window.self
    // Prevents checks like `if (window.parent !== window)`
    Object.defineProperty(window, 'parent', {
      get: function () { return window.self; },
      configurable: false,
    });
  } catch (e) {}

  try {
    // Override window.frameElement to return null
    // Prevents checks like `if (window.frameElement)`
    Object.defineProperty(window, 'frameElement', {
      get: function () { return null; },
      configurable: false,
    });
  } catch (e) {}
})();
