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

  // Intercept location assignments that try to break out
  const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'location');
  // We don't override location entirely as it would break the page,
  // but the window.top override above should be sufficient for most frame-busting code
})();
