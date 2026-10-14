'use strict';

// Observe the existing form. Never move, clone or replace native fields/iframes.
function createWorkspaceModel(document) {
  const headings = new Map(), rows = new Map(), subscribers = new Set(), rootKeys = new WeakMap();
  let serial = 0, enabled = true, currentRoot = null, signature = '', state = {sections:[], rows:[]};
  const own = '[data-bw-owned]';
  const rowActions = '.behavior-detail-btn,.anticon-plus-circle,.anticon-copy,.anticon-delete';
  function titleParts(header) {
    return [...(header?.childNodes || [])].filter(n => {
      if(n.nodeType === 3)return !!n.textContent.trim();
      if(n.nodeType !== 1 || n.matches(own+',.ant-collapse-extra,.ant-collapse-arrow'))return false;
      return !!n.textContent.trim() && !n.matches('button,a,input,select,textarea') &&
        !n.querySelector('button,a,input,select,textarea,.ant-collapse-extra');
    });
  }
  function text(node) {
    return titleParts(node).map(n => n.textContent).join('').trim();
  }
  function host(parent, className) {
    const node = document.createElement('div'); node.className = className;
    node.dataset.bwOwned = 'true'; parent.prepend(node); return node;
  }
  function cleanHeader(record) {
    record.host.remove(); record.header.removeAttribute('data-bw-heading');record.header.removeAttribute('data-bw-ready');
    record.section.removeAttribute('data-bw-section');
    if (!record.originalId) record.section.removeAttribute('id');
    for (const span of record.titleNodes) if(span.parentNode)span.replaceWith(...span.childNodes);
    for(const [node,attrs]of record.titleElements)for(const [key,value]of attrs){if(value===null)node.removeAttribute(key);else node.setAttribute(key,value)}
    for(const [key,before]of record.attrs){if(before===null)record.header.removeAttribute(key);else record.header.setAttribute(key,before)}
  }
  function concealNativeTitle(record){
    for(const node of titleParts(record.header)){
      if(node.nodeType===3){
        const span=document.createElement('span');span.dataset.bwNativeTitle='true';node.replaceWith(span);span.append(node);record.titleNodes.push(span);
      }else if(!node.hasAttribute('data-bw-native-title')){
        record.titleElements.set(node,new Map(['data-bw-native-title','aria-hidden'].map(k=>[k,node.getAttribute(k)])));
        node.dataset.bwNativeTitle='true';
      }
      if(record.header.dataset.bwReady==='true')record.header.querySelectorAll(':scope > [data-bw-native-title]').forEach(n=>n.setAttribute('aria-hidden','true'));
    }
  }
  function cleanRow(record) {
    record.host.remove();
    for (const n of record.controls) n.removeAttribute('data-bw-native-control');
    record.cell.removeAttribute('data-bw-row-controls');
    record.cell.removeAttribute('data-bw-row-ready');
  }
  function disabled(node) {
    return !node?.isConnected || node.disabled || node.getAttribute('aria-disabled') === 'true' ||
      node.hasAttribute('disabled') || !!node.closest('[disabled],[aria-disabled="true"],.ant-btn-disabled,.anticon-disabled');
  }
  function actionTarget(node,cell){
    const button=node.closest('button,a[role="button"]');
    return button && cell.contains(button) && button.querySelectorAll(rowActions).length===1 ? button : node;
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
          r = {section, header, originalId, id, title, portalId:++serial, titleNodes:[], titleElements:new Map(), attrs:new Map(['role','tabindex'].map(k=>[k,header.getAttribute(k)])), host:host(header, 'bw-heading-host')};
          header.removeAttribute('data-bw-ready');
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
        const controls = [...cell.querySelectorAll('.anticon-plus-circle,.anticon-copy,.anticon-delete')].filter(n=>!n.closest(own));
        const detailTarget=actionTarget(detail,cell), targets=controls.map(n=>actionTarget(n,cell));
        if(r && (r.detail!==detailTarget || targets.length!==r.menu.length || targets.some((n,i)=>n!==r.menu[i].node))){cleanRow(r);rows.delete(cell);r=null}
        if (!r) {
          r = {id:'bw-row-'+(++serial), cell, detail:detailTarget, controls:[detailTarget,...targets], host:host(cell,'bw-row-host'), menu:controls.map((n,i)=>({node:targets[i],label:n.classList.contains('anticon-plus-circle')?'新增一行':n.classList.contains('anticon-copy')?'复制此行':'删除此行'}))};
          cell.removeAttribute('data-bw-row-ready');
          for (const n of r.controls) n.dataset.bwNativeControl = 'true';
          cell.dataset.bwRowControls = 'true'; rows.set(cell,r);
        }
        rowModels.push({...r, disabled:disabled(r.detail), menu:r.menu.map(m=>({...m,disabled:disabled(m.node)}))});
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
    presentHeader(record){record.header.setAttribute('role','presentation');record.header.setAttribute('tabindex','-1');record.header.dataset.bwReady='true';record.header.querySelectorAll(':scope > [data-bw-native-title]').forEach(n=>n.setAttribute('aria-hidden','true'))},
    snapshot:()=>state,
    subscribe(fn){subscribers.add(fn);return()=>subscribers.delete(fn)},
    enable(value){enabled=!!value;scan()},
    destroy(){enabled=false;scan();document.documentElement.removeAttribute('data-bw-ui');subscribers.clear()},
  };
}
module.exports = {createWorkspaceModel};
