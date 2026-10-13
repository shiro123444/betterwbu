/* Read-only presentation: native audit data and report actions remain intact. */
(() => {
 'use strict';
 const records=new Map();let queued=false;
 function attr(record,node,key,value){if(!node)return;if(!record.attrs.some(a=>a.node===node&&a.key===key))record.attrs.push({node,key,before:node.getAttribute(key)});if(node.getAttribute(key)!==value)node.setAttribute(key,value)}
 function remove(record){record.empty?.remove();for(const a of record.attrs){if(a.before===null)a.node.removeAttribute(a.key);else a.node.setAttribute(a.key,a.before)}}
 function make(tag,cls,text){const n=document.createElement(tag);n.className=cls;if(text)n.textContent=text;return n}
 function update(){
  const enabled=document.documentElement.dataset.reVisual==='true';
  for(const [root,r]of records)if(!enabled||!root.isConnected){remove(r);records.delete(root)}
  if(!enabled)return;
  for(const root of document.querySelectorAll('.reimbursementCreate .bill-audit')){
   const panel=root.querySelector('.activeAuditDiv .audit-result');if(!panel)continue;
   const tabs=[...panel.querySelectorAll('[role="tab"]')],warnings=tabs.find(n=>n.textContent.trim()==='违规/提示'),approval=tabs.find(n=>n.textContent.trim()==='审批详情');
   const content=panel.querySelector('.ant-tabs-content');
   if(!warnings||!approval||!content)continue;
   let r=records.get(root);
   if(r&&(r.panel!==panel||r.warnings!==warnings)){remove(r);records.delete(root);r=null}
   if(!r){r={attrs:[],panel,warnings};records.set(root,r);attr(r,root,'data-re-audit-layout','true');attr(r,root.closest('.reimbursementCreate'),'data-re-detail-layout','true');attr(r,root.closest('.layout-content'),'data-re-report-page','true');
    attr(r,panel,'data-re-audit-progress','true');
   }
   const panes=[...content.children].filter(n=>n.getAttribute('role')==='tabpanel'||n.classList.contains('ant-tabs-tabpane'));
   const state=root.closest('.layout-content')?.querySelector('.top-desc>.state');
   attr(r,state,'data-re-audit-failed',String(/不通过|驳回|退回/.test(state?.textContent||'')));
   const cells=[...panel.querySelectorAll('.cell-item.maodianGBCDiv')];
   let errors=false;for(const cell of cells){const reminder=/^违规提醒\s*[【\[]|^仅提示\s*[【\[]/.test(cell.textContent.trim());attr(r,cell,'data-re-audit-warnings',String(reminder));if(!reminder)errors=true}
   // Native borders are on the row wrapper, not the hidden text node.
   for(const wrapper of panel.querySelectorAll('.col-list')){const items=[...wrapper.querySelectorAll('.cell-item.maodianGBCDiv')];attr(r,wrapper,'data-re-audit-warnings',String(items.length>0&&items.every(n=>n.getAttribute('data-re-audit-warnings')==='true')))}
   attr(r,warnings,'data-re-audit-warnings',String(!errors));attr(r,panes[tabs.indexOf(warnings)],'data-re-audit-warnings',String(!errors));
   // Only switch a read-only display tab. Never confirm warnings, annotate or submit.
   // Default once per result state; subsequent native tab choices belong to the user.
   if(r.errors!==errors){r.errors=errors;const target=errors?warnings:approval;if(target.getAttribute('aria-selected')!=='true')target.click()}
   const timeline=panel.querySelector('.ant-tabs-tabpane-active .timeline-content');
   if(timeline&&!timeline.children.length&&!panel.querySelector('.ant-spin-spinning')){if(!r.empty){r.empty=make('p','re-audit-empty','暂无审批记录');timeline.after(r.empty)}}else{r.empty?.remove();r.empty=null}
  }
 }
 function schedule(){if(!queued){queued=true;requestAnimationFrame(()=>{queued=false;update()})}}
 function start(){new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['data-re-visual','class','style','aria-selected']});schedule()}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();window.addEventListener('hashchange',schedule);
})();
