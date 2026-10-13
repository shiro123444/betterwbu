(() => {
  const defaults = { enabled: true, totals: true, aiGuard: true };
  let current = defaults;
  async function publish() {
    current = await chrome.storage.local.get(defaults);
    window.postMessage({ type: 'reimbursement-enhancer-settings', settings: current }, location.origin);
    chrome.runtime.sendMessage({ type: 'configure-guard' }).catch(() => {});
    buttons();
  }
  const changed = new Map();
  function buttons() {
    for (const button of document.querySelectorAll('button')) {
      const text = button.textContent.replace(/\s/g, '');
      if (!['重新生成', 'AI填报', '智能填报'].includes(text)) continue;
      if (current.enabled && current.aiGuard) {
        if (!changed.has(button)) changed.set(button, { disabled: button.disabled, aria: button.getAttribute('aria-disabled') });
        button.disabled = true; button.setAttribute('aria-disabled', 'true');
      } else if (changed.has(button)) {
        const before = changed.get(button); button.disabled = before.disabled;
        if (before.aria === null) button.removeAttribute('aria-disabled'); else button.setAttribute('aria-disabled', before.aria);
        changed.delete(button);
      }
    }
    for (const button of changed.keys()) if (!button.isConnected) changed.delete(button);
  }
  chrome.storage.onChanged.addListener(publish);
  publish();
  document.addEventListener('DOMContentLoaded', publish, { once: true });
  setInterval(buttons, 500);
})();
