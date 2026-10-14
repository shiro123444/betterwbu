import React, {useLayoutEffect} from 'react';
import {createRoot} from 'react-dom/client';

function SidebarButton({record, collapsed, target, disabled}) {
  useLayoutEffect(()=>{
    record.sider.dataset.bwSidebarReady='true';
    return()=>record.sider.removeAttribute('data-bw-sidebar-ready');
  },[record]);
  const label=collapsed?'展开侧栏':'收起侧栏';
  return <button type="button" className="bw-button bw-icon-button bw-sidebar-toggle"
    aria-label={label} title={label} aria-expanded={!collapsed} aria-controls={record.sider.id}
    disabled={disabled} onClick={event=>{
      event.preventDefault();event.stopPropagation();
      if(target?.isConnected&&!target.hasAttribute('disabled')&&target.getAttribute('aria-disabled')!=='true')target.click();
    }}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>
      <path d={collapsed?'m13 9 3 3-3 3':'m16 9-3 3 3 3'}/>
    </svg>
  </button>;
}

// This adapter only forwards to the school's existing click handlers.
// Menu state and routing remain owned by the original Vue application.
export function createSidebarToggle(document) {
  let record, frame, stopped=false, enabled=false, serial=0;
  function clear(){
    if(!record)return;
    record.react.unmount();record.host.remove();
    record.sider.removeAttribute('data-bw-sidebar-ready');
    for(const [node,before] of record.originals){if(before===null)node.removeAttribute('data-bw-sidebar-native');else node.setAttribute('data-bw-sidebar-native',before)}
    for(const [node,before] of record.titles){if(before===null)node.removeAttribute('title');else node.setAttribute('title',before)}
    if(!record.originalId)record.sider.removeAttribute('id');
    record=null;
  }
  function scan(){
    frame=null;if(stopped)return;
    const sider=document.querySelector('.ant-layout-sider');
    const parent=sider?.querySelector('.ant-layout-sider-children');
    const originals=sider?[...sider.querySelectorAll('.menuBox>.shrinkIcon,.menuBox>.shrinkIcon2,.ant-layout-sider-trigger')]:[];
    if(!enabled||!parent||!originals.length){clear();return}
    if(record&&(record.sider!==sider||record.host.parentElement!==parent))clear();
    if(!record){
      const host=document.createElement('div');host.dataset.bwOwned='true';host.className='bw-sidebar-toggle-host';parent.prepend(host);
      const originalId=sider.id;if(!originalId){let id;do{id='bw-school-sidebar-'+(++serial)}while(document.getElementById(id));sider.id=id}
      record={sider,host,originalId,react:createRoot(host),originals:new Map(),titles:new Map()};
    }
    for(const node of originals){if(!record.originals.has(node))record.originals.set(node,node.getAttribute('data-bw-sidebar-native'));node.dataset.bwSidebarNative='true'}
    const collapsed=sider.classList.contains('ant-layout-sider-collapsed');
    for(const node of sider.querySelectorAll('.ant-menu-submenu-title,.ant-menu-item a')){
      if(!record.titles.has(node))record.titles.set(node,node.getAttribute('title'));
      const before=record.titles.get(node),title=collapsed?(before||node.textContent.trim()):before;
      if(title===null)node.removeAttribute('title');else if(node.getAttribute('title')!==title)node.setAttribute('title',title);
    }
    const target=originals.find(n=>n.matches(collapsed?'.shrinkIcon2':'.shrinkIcon'))||originals.find(n=>n.matches('.ant-layout-sider-trigger'));
    record.react.render(<SidebarButton record={record} collapsed={collapsed} target={target}
      disabled={!target||target.hasAttribute('disabled')||target.getAttribute('aria-disabled')==='true'}/>);
  }
  function schedule(){if(!frame&&!stopped)frame=requestAnimationFrame(scan)}
  const observer=new MutationObserver(records=>{if(records.some(r=>!r.target.closest?.('[data-bw-owned]')))schedule()});
  return {
    start(){observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','disabled','aria-disabled']});schedule()},
    enable(value){enabled=!!value;schedule()},
    destroy(){stopped=true;observer.disconnect();if(frame)cancelAnimationFrame(frame);clear()},
  };
}
