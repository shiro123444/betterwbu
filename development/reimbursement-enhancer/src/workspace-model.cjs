'use strict';

// Observe the existing form. Never move, clone or replace native fields/iframes.
function createWorkspaceModel(document) {
  const headings = new Map(), rows = new Map(), subscribers = new Set(), rootKeys = new WeakMap();
  let serial = 0, enabled = true, currentRoot = null, signature = '', state = {sections:[], rows:[]};
  const own = '[data-bw-owned]';
  function text(node) {
    return [...(node?.childNodes || [])].filter(n => n.nodeType === 3 || n.hasAttribute?.('data-bw-native-title')).map(n => n.textContent).join('').trim();
  }
  function host(parent, className) {
    const node = document.createElement('div'); node.className = className;
    node.dataset.bwOwned = 'true'; parent.prepend(node); return node;
  }
  function cleanHeader(record) {
    record.host.remove(); record.header.removeAttribute('data-bw-heading');
    record.section.removeAttribute('data-bw-section');
    if (!record.originalId) record.section.removeAttribute('id');
    for (const span of record.titleNodes) if(span.parentNode)span.replaceWith(...span.childNodes);
    for(const [key,before]of record.attrs){if(before===null)record.header.removeAttribute(key);else record.header.setAttribute(key,before)}
  }
  function concealNativeTitle(record){
    for(const node of [...record.header.childNodes])if(node.nodeType===3&&node.textContent.trim()){
      const span=document.createElement('span');span.dataset.bwNativeTitle='true';span.setAttribute('aria-hidden','true');node.replaceWith(span);span.append(node);record.titleNodes.push(span);
    }
  }
  function cleanRow(record) {
    record.host.remove();
    for (const n of record.controls) n.removeAttribute('data-bw-native-control');
    record.cell.removeAttribute('data-bw-row-controls');
  }
  function disabled(node) {
    return !node?.isConnected || node.disabled || node.getAttribute('aria-disabled') === 'true' ||
      node.hasAttribute('disabled') || !!node.closest('.ant-btn-disabled,.anticon-disabled');
  }
  function invoke(node) { if (disabled(node)) return false; node.click(); return true; }
  function scan() {
    const root = document.querySelector('.layout-content .reimbursementCreate') || document.querySelector('.reimbursementCreate');
    const active = enabled && document.documentElement.dataset.reVisual === 'true' && !!root?.isConnected;
    document.documentElement.dataset.bwUi = String(enabled && document.documentElement.dataset.reVisual === 'true');
    if (currentRoot && currentRoot !== root) currentRoot.removeAttribute('data-bw-workspace');
    currentRoot = root;
    root?.toggleAttribute('data-bw-workspace', active);
    for (const [section, r] of headings) if (!active || !section.isConnected || !root.contains(section) || !r.header.isConnected || !r.host.isConnected) { cleanHeader(r); headings.delete(section); }
    for (const [cell, r] of rows) if (!active || !cell.isConnected || !root.contains(cell) || !r.detail.isConnected || !r.host.isConnected) { cleanRow(r); rows.delete(cell); }
    const sections = [], rowModels = [];
    if (active) {
      for (const section of root.querySelectorAll('.collapse-box')) {
        if (section.parentElement?.closest('.collapse-box')) continue;
        const header = section.querySelector(':scope > .ant-collapse-item > .ant-collapse-header');
        if (!header) continue;
        let r = headings.get(section);
        if (!r) {
          const originalId = section.getAttribute('id');
          const id = originalId || 'bw-section-' + (++serial);
          const title = text(header) || header.querySelector('p')?.textContent.trim();
          if (!title) continue;
          r = {section, header, originalId, id, title, portalId:++serial, titleNodes:[], attrs:new Map(['role','tabindex'].map(k=>[k,header.getAttribute(k)])), host:host(header, 'bw-heading-host')};
          header.setAttribute('role','presentation');header.setAttribute('tabindex','-1');
          section.id = id; section.dataset.bwSection = 'true'; header.dataset.bwHeading = 'true'; headings.set(section, r);
        }
        const nativeText = text(header); if (nativeText) r.title = nativeText;
        concealNativeTitle(r);
        const content = section.querySelector(':scope > .ant-collapse-item > .ant-collapse-content');
        const expanded = header.getAttribute('aria-expanded') !== 'false' && (!content || !content.classList.contains('ant-collapse-content-inactive'));
        const extra = header.querySelector('.ant-collapse-extra');
        const amount = extra?.querySelector('.behaviorNum')?.textContent.trim() || '';
        sections.push({...r, expanded, amount});
      }
      for (const detail of root.querySelectorAll('.behavior-detail-btn')) {
        const cell = detail.closest('td') || detail.parentElement;
        if (!cell || detail.closest(own)) continue;
        let r = rows.get(cell);
        if (!r) {
          const controls = [...cell.querySelectorAll('.anticon-plus-circle,.anticon-copy,.anticon-delete')].filter(n=>!n.closest(own));
          r = {id:'bw-row-'+(++serial), cell, detail, controls:[detail,...controls], host:host(cell,'bw-row-host'), menu:controls.map(n=>({node:n,label:n.classList.contains('anticon-plus-circle')?'新增一行':n.classList.contains('anticon-copy')?'复制此行':'删除此行'}))};
          for (const n of r.controls) n.dataset.bwNativeControl = 'true';
          cell.dataset.bwRowControls = 'true'; rows.set(cell,r);
        }
        rowModels.push({...r, disabled:disabled(detail), menu:r.menu.map(m=>({...m,disabled:disabled(m.node)}))});
      }
    }
    const next = {root:active?root:null, sections, rows:rowModels};
    if(root&&!rootKeys.has(root))rootKeys.set(root,++serial);
    const nextSignature = JSON.stringify([active,rootKeys.get(root), sections.map(s=>[s.id,s.portalId,s.title,s.expanded,s.amount]), rowModels.map(r=>[r.id,r.disabled,r.menu.map(m=>m.disabled)])]);
    if (signature !== nextSignature) { signature=nextSignature; state=next; for(const fn of subscribers)fn(); }
    return state;
  }
  return {
    scan, invoke, disabled,
    snapshot:()=>state,
    subscribe(fn){subscribers.add(fn);return()=>subscribers.delete(fn)},
    enable(value){enabled=!!value;scan()},
    destroy(){enabled=false;scan();document.documentElement.removeAttribute('data-bw-ui');subscribers.clear()},
  };
}
module.exports = {createWorkspaceModel};
