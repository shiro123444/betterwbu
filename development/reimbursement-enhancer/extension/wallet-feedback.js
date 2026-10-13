(() => {
  'use strict';
  let enabled = true, status, button, beforeDisabled, beforeLabel, phase = 'idle', timer, previewOperation;
  const wallet = location.pathname.startsWith('/bill-wallet-web/');
  function resetButton(count) {
    if (button?.isConnected) {
      button.removeAttribute('aria-busy'); button.removeAttribute('data-re-confirming');
      if (beforeLabel == null) button.removeAttribute('aria-label'); else button.setAttribute('aria-label',beforeLabel);
      button.disabled = beforeDisabled || count === 0;
    }
    button = null;
  }
  function hide() { clearTimeout(timer); if (status) status.hidden = true; }
  function show(text, host, failed = false) {
    if (!host) return;
    if (!status) { status = document.createElement('div'); status.setAttribute('role','status'); status.setAttribute('aria-live','polite'); }
    status.className = 're-wallet-status' + (wallet ? ' re-wallet-status--picker' : '') + (failed ? ' re-wallet-status--error' : '');
    if (status.parentNode !== host.parentNode) host.before(status);
    if (wallet) { const footer=host.closest('.file-fixed'); status.style.bottom=(footer ? Math.ceil(footer.getBoundingClientRect().height)+22 : 72)+'px'; }
    status.textContent = text; status.hidden = false;
    clearTimeout(timer);
    if (!failed) timer = setTimeout(() => { if (status?.isConnected && !status.hidden) status.textContent = phase === 'confirming' ? '系统仍在添加票据，请稍候…' : '系统仍在更新票据预览，请稍候…'; },15000);
  }
  function previewHost() { return document.querySelector('iframe.iframe-box1'); }
  window.addEventListener('message', e => {
    if (!enabled || e.origin !== location.origin) return;
    const frames = wallet ? [] : [...document.querySelectorAll('iframe.iframe-box,iframe.iframe-box1')];
    const frame = frames.find(f => f.contentWindow === e.source);
    if (wallet ? e.source !== window : !frame) return;
    let data; try { data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
    if (data?.type === 'reimbursement-wallet-state') {
      if (wallet && data.phase === 'confirming') {
        button = [...document.querySelectorAll('button.ant-btn')].find(b => b.textContent.replace(/\s/g,'') === '确定');
        if (button) { beforeDisabled=button.disabled;beforeLabel=button.getAttribute('aria-label');button.disabled=true;button.setAttribute('aria-busy','true');button.setAttribute('aria-label','正在添加票据');button.dataset.reConfirming='true'; }
        phase='confirming';show('正在添加所选 '+data.count+' 张票据…',button);
      } else if (wallet && data.phase === 'error') {
        phase='error';resetButton(data.count);show('添加失败，请重试。已选票据保留。',status || document.querySelector('.file-fixed'),true);
      } else if (wallet && data.phase === 'picker-idle') {
        resetButton(data.count);if(phase!=='error'){hide();phase='idle'}
      } else if (wallet && data.phase === 'idle') { resetButton(data.count);hide();phase='idle'; }
      else if (!wallet && data.phase === 'rendering' && frame.classList.contains('iframe-box')) {
        previewOperation=undefined;phase='rendering';show('票据已添加，正在更新预览…',previewHost());
      } else if (!wallet && data.phase === 'preview-start' && frame.classList.contains('iframe-box1')) {
        previewOperation=data.operation;phase='rendering';show(data.count ? '正在更新 '+data.count+' 张票据的预览…' : '正在更新票据预览…',previewHost());
      } else if (!wallet && data.phase === 'ready' && frame.classList.contains('iframe-box1') && phase==='rendering' && previewOperation!=null && data.operation===previewOperation) {
        hide();phase='idle';previewOperation=undefined;
      } else if (!wallet && ['error','idle'].includes(data.phase) && frame.classList.contains('iframe-box')) { hide();phase='idle';previewOperation=undefined; }
    }
    if (!wallet && frame?.classList.contains('iframe-box') && data?.action==='bill') { previewOperation=undefined;phase='rendering';show('票据已添加，正在更新预览…',previewHost()); }
    if (!wallet && frame?.classList.contains('iframe-box') && data?.action==='back') { hide();phase='idle';previewOperation=undefined; }
    // Native billHeight/showIframe messages may describe the previous list.
    // Only the bridge's matching ready event completes this preview update.
  });
  async function configure() {
    const s = await chrome.storage.local.get({enabled:true,wallet:true,loader:true});
    enabled = s.enabled && s.loader && s.wallet;
    if (wallet) window.postMessage({type:'reimbursement-wallet-settings',enabled:s.enabled && s.wallet},location.origin);
    if (!enabled) { resetButton(1);hide(); }
  }
  configure();chrome.storage.onChanged.addListener(configure);
})();
