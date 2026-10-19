import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';

function Entry({collapsed,open}) {
  const [expanded,setExpanded]=useState(false);
  return <>
    <button type="button" className="bw-fill-menu-title" role="menuitem" title="填报助手"
      aria-label="填报助手" aria-expanded={collapsed?undefined:expanded} aria-haspopup={collapsed?'dialog':'menu'}
      onClick={event=>{event.stopPropagation();collapsed?open('all',event.currentTarget):setExpanded(value=>!value)}}>
      <span className="bw-fill-menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M8 10l2 2 5-5M9 16h6"/></svg></span>
      <span className="bw-fill-menu-label">填报助手</span>
      <svg className="bw-fill-menu-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d={expanded?'m6 15 6-6 6 6':'m6 9 6 6 6-6'}/></svg>
    </button>
    {!collapsed&&expanded&&<ul className="bw-fill-submenu" role="menu" aria-label="填报助手功能">
      {[['inspect','状态与预检'],['sync','同步与恢复']].map(([mode,label])=><li role="none" key={mode}><button type="button" role="menuitem" onClick={event=>open(mode,event.currentTarget)}>{label}</button></li>)}
    </ul>}
  </>;
}

// The entry is independent of the information manager and financial form.
// Opening it only loads status; mutations still require the existing buttons.
export function createFillReview(document) {
  let record,frame,enabled=false,stopped=false,controller,opened=false;
  const win=document.defaultView;
  function open(mode,anchor) {
    if(!win.ReimbursementFillCompatUI||!win.ReimbursementUI)return;
    const node=(tag,text,className)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(className)n.className=className;return n};
    const content=node('div',null,'bw-fill-review');content.dataset.bwOwned='true';
    content.append(node('p',mode==='sync'?'备份、同步和恢复当前草稿。正式提交仍由你操作。':'查看当前单据的填报状态、金额和明细问题。','bw-fill-intro'));
    const notice=node('p',null,'bw-fill-notice');notice.setAttribute('role','status');
    const button=(text,action)=>{const b=node('button',text,'bw-button');b.type='button';b.addEventListener('click',action);return b};
    const ui=win.ReimbursementFillCompatUI.mount({container:content,node,button,mode,notify:text=>{notice.textContent=text}});
    content.append(notice);opened=true;
    controller=win.ReimbursementUI.openDetail(mode==='sync'?'同步与恢复':'状态与预检',content,anchor,{onClose:()=>{opened=false}});
    Promise.resolve(ui.load(false)).then(()=>{if(mode!=='sync'&&content.isConnected)return ui.check()}).catch(error=>{notice.textContent=error.message});
  }
  function clear(){if(opened)controller?.close();if(record){record.react.unmount();record.host.remove();record=null}}
  function scan(){
    frame=null;if(stopped)return;
    const sider=document.querySelector('.ant-layout-sider');
    const menu=sider?.querySelector('.ant-menu-root,.menuBox>.ant-menu,.ant-layout-sider-children>.ant-menu');
    if(!enabled||!menu){clear();return}
    if(record&&record.menu!==menu)clear();
    for(const orphan of menu.querySelectorAll(':scope > .bw-fill-menu'))if(orphan!==record?.host)orphan.remove();
    if(!record){const host=document.createElement(menu.tagName==='UL'?'li':'div');host.dataset.bwOwned='true';host.className='bw-fill-menu';host.setAttribute('role','none');record={menu,host,react:createRoot(host),collapsed:null}}
    const native=[...menu.children].filter(n=>n!==record.host&&!n.hasAttribute('data-bw-owned'));
    if(record.host.parentElement!==menu||[...menu.children].indexOf(record.host)!==Math.min(2,native.length))menu.insertBefore(record.host,native[2]||null);
    const collapsed=sider.classList.contains('ant-layout-sider-collapsed');
    if(record.collapsed!==collapsed){record.collapsed=collapsed;record.react.render(<Entry collapsed={collapsed} open={open}/>)}
  }
  const schedule=()=>{if(!frame&&!stopped)frame=win.requestAnimationFrame(scan)};
  const observer=new win.MutationObserver(records=>{if(records.some(r=>!r.target.closest?.('[data-bw-owned]')))schedule()});
  return {start(){observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});schedule()},enable(value){enabled=!!value;schedule()},destroy(){stopped=true;observer.disconnect();if(frame)win.cancelAnimationFrame(frame);clear()}};
}
