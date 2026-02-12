document.getElementById('open-arena-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('arena/arena.html') });
  window.close();
});
