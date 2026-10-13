(() => {
  'use strict';
  let queued = false, pane, footer;
  const resize = new ResizeObserver(schedule);
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; update(); });
  }
  function clear(node) {
    for (const key of ['--re-footer-left', '--re-footer-width', '--re-footer-height']) node?.style.removeProperty(key);
    node?.removeAttribute('data-re-footer-layout');
  }
  function update() {
    const nextPane = document.querySelector('.content-box>.layout-content');
    const nextFooter = [...document.querySelectorAll('.reimbursementCreate .button-box')].find(n => n.isConnected && n.getClientRects().length);
    if (pane !== nextPane || footer !== nextFooter) {
      resize.disconnect(); clear(footer); clear(pane);
      pane = nextPane; footer = nextFooter;
      if (pane) resize.observe(pane);
      if (footer) resize.observe(footer);
    }
    if (!pane || !footer) return;
    if (document.documentElement.dataset.reVisual !== 'true') { clear(footer); clear(pane); return; }
    const rect = pane.getBoundingClientRect();
    const left = Math.round(rect.left + 7), width = Math.max(0, Math.round(rect.width - 21));
    const set = (node, key, value) => { if (node.style.getPropertyValue(key) !== value) node.style.setProperty(key, value); };
    set(footer, '--re-footer-left', left + 'px');
    set(footer, '--re-footer-width', width + 'px');
    footer.dataset.reFooterLayout = 'true';
    set(pane, '--re-footer-height', Math.ceil(footer.getBoundingClientRect().height + 28) + 'px');
  }
  function start() {
    new MutationObserver(schedule).observe(document.documentElement, {childList:true, subtree:true});
    new MutationObserver(schedule).observe(document.documentElement, {attributes:true, attributeFilter:['data-re-visual','data-re-manager-open']});
    window.addEventListener('resize', schedule); window.addEventListener('hashchange', schedule);
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true}); else start();
})();
