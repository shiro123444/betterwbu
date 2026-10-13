(() => {
 'use strict';
 const instance=Symbol.for('reimbursement-enhancer.actions');if(document[instance])return;document[instance]=true;
 const paths={plus:'M12 5v14M5 12h14',trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',copy:'M9 9h12v12H9zM5 15H3V3h12v2',save:'M5 3h12l4 4v14H3V3h2M7 3v6h10V3M7 21v-8h10v8',send:'m3 3 18 9-18 9 4-9-4-9Zm4 9h14',train:'M6 3h12v14H6zM6 10h12M9 6h6M8 20l2-3M16 20l-2-3M8 14h1M15 14h1',meal:'M4 3v6c0 3 6 3 6 0V3M7 3v18M19 3c-4 2-4 9 0 9V3Zm0 9v9',bus:'M5 3h14v16H5zM5 11h14M8 6h8M8 15h1M15 15h1M7 19v2M17 19v2',bed:'M3 18V8M3 14h18v7M3 18h18M5 8h6v6H5zM11 11h8a2 2 0 0 1 2 2v1',dots:'M5 12h.01M12 12h.01M19 12h.01',chart:'M5 20V12M12 20V4M19 20V8',shield:'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Zm-4 9 3 3 5-6',car:'m4 9 2-5h12l2 5M3 9h18v9H3zM5 18v3M19 18v3M6 13h2M16 13h2',receipt:'M5 3h14v18l-3-2-4 2-4-2-3 2V3ZM8 7h8M8 11h8M8 15h5'};
 function svg(kind){const n=document.createElementNS('http://www.w3.org/2000/svg','svg');n.setAttribute('viewBox','0 0 24 24');n.setAttribute('fill','none');n.setAttribute('stroke','currentColor');n.setAttribute('stroke-width','1.8');n.setAttribute('stroke-linecap','round');n.setAttribute('stroke-linejoin','round');n.setAttribute('aria-hidden','true');n.dataset.reActionIcon='true';const p=document.createElementNS(n.namespaceURI,'path');p.setAttribute('d',paths[kind]||paths.plus);n.append(p);return n}
 Object.assign(paths,{search:'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 5 5',refresh:'M20 7V3M20 7h-4M20 7a9 9 0 1 0 1 9',reset:'M4 8V4M4 8h4M4 8a8 8 0 1 1-1 8',edit:'m4 16 12-12 4 4-12 12H4v-4Zm9-9 4 4',close:'M6 6l12 12M18 6 6 18',upload:'M12 16V3M7 8l5-5 5 5M3 15v6h18v-6'});
 const records=new Map(),categories=new Map(),hiddenExports=new Map(),managerIcons=new Map();let settings={enabled:true,visual:true},queued=false;
 const observedShadows=new WeakSet();
 function schedule(){if(!queued){queued=true;requestAnimationFrame(()=>{queued=false;update()})}}
 function title(n){const h=n.closest('.collapse-box')?.querySelector('.ant-collapse-header');return [...h?.childNodes||[]].find(x=>x.nodeType===3&&x.textContent.trim())?.textContent.trim()||''}
 function label(icon,section,n){
  if(icon==='delete')return {text:'删除选中',tip:'删除已勾选的行',kind:'trash',style:'secondary'};
  if(icon==='copy')return {text:'复制末行',tip:'复制表格的最后一行，不是已勾选的行',kind:'copy',style:'secondary'};
  if(icon!=='plus-circle')return null;
  if(n.closest('.table-level2-box'))return {text:'添加分类',tip:'选择要添加的费用分类',kind:'plus',style:'secondary'};
  const text=section.includes('费用明细')?'添加活动':section.includes('收付款')?'添加收款人':section.includes('预算')?'添加预算':section.includes('事前')?'添加事前单':section.includes('冲销')?'添加冲销':section.includes('合同')?'添加合同':section.includes('公务卡')?'添加消费记录':'添加明细';
  return {text,tip:text,kind:'plus',style:'primary'};
 }
 function actionChildren(n,key){return [...n.children].filter(x=>x.dataset?.[key]==='true')}
 function decorate(n,info,kind='icon'){
  let old=records.get(n),signature=JSON.stringify(info);
  if(!old){
   const icons=actionChildren(n,'reActionIcon'),labels=actionChildren(n,'reActionLabel');
   old={attrs:new Map(['role','tabindex','aria-label','title','data-re-action','data-re-action-kind'].map(k=>[k,n.getAttribute(k)])),icon:icons[0]||svg(info.kind),label:labels[0]||document.createElement('span'),iconKind:info.kind};
   old.label.dataset.reActionLabel='true';for(const node of [...icons.slice(1),...labels.slice(1)])node.remove();records.set(n,old);
  }
  if(old.signature===signature&&old.label.parentNode===n&&old.icon.parentNode===n)return;
  if(old.iconKind!==info.kind){old.icon.remove();old.icon=svg(info.kind);old.iconKind=info.kind}
  if(old.icon.parentNode!==n)n.append(old.icon);if(old.label.parentNode!==n)n.append(old.label);
  if(old.label.textContent!==info.text)old.label.textContent=info.text;
  old.signature=signature;n.dataset.reAction=info.style;n.dataset.reActionKind=kind;n.title=info.tip;n.setAttribute('aria-label',info.text);if(kind==='icon'){n.setAttribute('role','button');n.setAttribute('tabindex','0')}
 }
 function restoreAction(n,r){r.icon.remove();r.label.remove();for(const [k,v]of r.attrs){if(v===null)n.removeAttribute(k);else n.setAttribute(k,v)}}
 function categoryKind(name){return /住宿/.test(name)?'bed':/城市间|高铁|火车|机票/.test(name)?'train':/用餐|伙食/.test(name)?'meal':/市内|公交/.test(name)?'bus':/保险/.test(name)?'shield':/车辆|燃油|过路/.test(name)?'car':/总览/.test(name)?'chart':'receipt'}
 function restore(){for(const [n,r]of records)restoreAction(n,r);records.clear();for(const [n,r]of categories){r.icon.remove();n.removeAttribute('data-re-category-icon')}categories.clear();for(const [n,v]of hiddenExports){if(v===null)n.removeAttribute('data-re-hidden-export');else n.setAttribute('data-re-hidden-export',v)}hiddenExports.clear();for(const [n,icon]of managerIcons)icon.remove();managerIcons.clear()}
 function update(){
  if(!settings.enabled||!settings.visual){restore();return}
  for(const [n,r]of records)if(!n.isConnected){restoreAction(n,r);records.delete(n)}
  for(const [n,r]of categories)if(!n.isConnected){r.icon.remove();n.removeAttribute('data-re-category-icon');categories.delete(n)};
  for(const [n,icon]of managerIcons)if(!n.isConnected){icon.remove();managerIcons.delete(n)};
  for(const host of document.querySelectorAll('[data-re-manager]')){const shadow=host.shadowRoot;if(shadow&&!observedShadows.has(shadow)){observedShadows.add(shadow);new MutationObserver(schedule).observe(shadow,{childList:true,subtree:true})}for(const n of shadow?.querySelectorAll('[data-re-button-kind]')||[]){if(managerIcons.get(n)?.isConnected)continue;const icon=svg(n.dataset.reButtonKind);n.prepend(icon);managerIcons.set(n,icon)}}
  for(const n of document.querySelectorAll('.reimbursementCreate .btn>.anticon-cloud-download.icon')){if(!hiddenExports.has(n))hiddenExports.set(n,n.getAttribute('data-re-hidden-export'));n.dataset.reHiddenExport='true'}
  for(const n of document.querySelectorAll('.reimbursementCreate .btn>.anticon.icon')){const info=label(n.dataset.reNativeIcon||n.getAttribute('aria-label'),title(n),n);if(!info)continue;if(!n.dataset.reNativeIcon)n.dataset.reNativeIcon=n.getAttribute('aria-label');decorate(n,info)}
  for(const n of document.querySelectorAll('button.ant-btn')){
   const text=[...n.querySelectorAll('span:not(.anticon)')].filter(x=>!x.dataset.reActionLabel).map(x=>x.textContent.trim()).join('').replace(/\s/g,'');
   if(['新增明细','新增行为明细'].includes(text))decorate(n,{text:'添加明细',tip:'在当前费用分类下添加一行',kind:'plus',style:'primary'},'button');
   else if(['暂存','提交'].includes(text))decorate(n,{text,tip:text==='暂存'?'保存当前草稿':'提交当前报销单',kind:text==='暂存'?'save':'send',style:text==='暂存'?'secondary':'primary'},'button');
   else {const kind=/^(新增|新建|添加)/.test(text)?'plus':/^(查询|搜索)$/.test(text)?'search':text==='刷新'?'refresh':text==='重置'?'reset':text==='保存'?'save':text==='取消'?'close':text==='编辑'?'edit':text==='删除'?'trash':/^上传/.test(text)?'upload':null;if(kind)decorate(n,{text,tip:n.getAttribute('title')||text,kind,style:n.classList.contains('ant-btn-primary')?'primary':'secondary'},'button')}
  }
  for(const n of document.querySelectorAll('.table-level2-box .behaviors-div')){
   const name=n.nextElementSibling?.querySelector('.behaviorName')?.textContent.trim()||'',kind=categoryKind(name),before=categories.get(n);if(before?.kind===kind&&before.icon.isConnected)continue;if(before)before.icon.remove();const icon=svg(kind);n.append(icon);n.dataset.reCategoryIcon='true';categories.set(n,{icon,kind});
  }
 }
 document.addEventListener('keydown',e=>{const n=e.target;if(!settings.enabled||!settings.visual||n.dataset?.reActionKind!=='icon'||n.getAttribute('aria-disabled')==='true'||n.getAttribute('disabled')!==null||!['Enter',' '].includes(e.key))return;e.preventDefault();n.click()});
 async function configure(){try{settings=await chrome.storage.local.get({enabled:true,visual:true});update()}catch{}}
 function start(){new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true});configure()}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();chrome.storage.onChanged.addListener(configure);
})();
