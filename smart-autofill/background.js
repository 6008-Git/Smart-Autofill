// Content scripts ask the extension to open its own settings page. No profile data is messaged.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.action !== "open-options") return;
  chrome.runtime.openOptionsPage().then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
  return true;
});
