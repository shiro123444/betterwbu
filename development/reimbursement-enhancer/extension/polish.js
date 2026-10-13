(() => {
 'use strict';
 const defaults={enabled:true,visual:true,motion:true,loader:true,wallet:true};let settings=defaults;
 const changed=new Map();
 const transfers=new Map();
 const captions=new Map();
 const isWallet=location.pathname.startsWith('/bill-wallet-web/');
 async function configure(){settings=await chrome.storage.local.get(defaults);const root=document.documentElement;if(!root)return;
  for(const key of ['visual','motion','loader'])root.dataset['re'+key[0].toUpperCase()+key.slice(1)]=String(settings.enabled&&settings[key]);
  root.dataset.reWallet=String(settings.enabled&&settings.wallet&&isWallet);update();
 }
 function track(node,key,value){let entry=changed.get(node);if(!entry){entry=new Map();changed.set(node,entry)}if(!entry.has(key))entry.set(key,node.getAttribute(key));node.setAttribute(key,value)}
 function restore(){for(const [node,attrs]of changed){for(const [key,value]of attrs){if(value===null)node.removeAttribute(key);else node.setAttribute(key,value)}}changed.clear()}
 function transferButton(node){return [node.textContent,node.getAttribute('title'),node.getAttribute('aria-label'),...([...node.querySelectorAll('[title],[aria-label]')].map(n=>n.getAttribute('title')||n.getAttribute('aria-label')))].some(s=>/^(?:(?:批量|Excel|excel|EXCEL|文件|数据|表格|明细|清单))?(?:导入|导出)|^下载(?:导入)?模板$/.test(String(s||'').replace(/\s/g,'')))}
 function hideTransfers(){
  for(const [node,before]of transfers)if(!settings.enabled||!node.isConnected||!transferButton(node)){if(before===null)node.removeAttribute('data-re-transfer-hidden');else node.setAttribute('data-re-transfer-hidden',before);transfers.delete(node)}
  if(!settings.enabled)return;
  for(const node of document.querySelectorAll('button,.ant-btn,a[role="button"],[role="menuitem"]'))if(transferButton(node)){if(!transfers.has(node))transfers.set(node,node.getAttribute('data-re-transfer-hidden'));node.setAttribute('data-re-transfer-hidden','true')}
 }
 function update(){
  hideTransfers();
  const short={'报销单总金额：':'合计：','实际应收总金额：':'实际应收：','汇总核准含税金额（本币）':'核准金额（元）','汇总核准含税金额（本币） ':'核准金额（元）','新增行为明细':'新增明细'};
  for(const [n,before]of captions)if(!settings.enabled||!settings.visual||!n.isConnected){if(n.isConnected&&n.textContent===before.next){n.textContent=before.text;if(before.title===null)n.removeAttribute('title');else n.setAttribute('title',before.title)}captions.delete(n)}
  if(settings.enabled&&settings.visual)for(const n of document.querySelectorAll('.reimbursementCreate .behaviorName,.reimbursementCreate .ant-table-thead th,.reimbursementCreate .ant-table-thead th span,.reimbursementCreate .table-level2-box button>span')){
   if(n.children.length)continue;const text=n.textContent.trim(),compact=text.replace(/\s/g,''),next=short[compact]||(/^汇总核准含税金额[（(]本币[）)]$/.test(compact)?'核准金额（元）':null);if(next&&text!==next){if(!captions.has(n))captions.set(n,{text:n.textContent,next,title:n.getAttribute('title')});n.title=text;n.textContent=next}
  }
  if(!isWallet)return;
  if(!settings.enabled||!settings.wallet){restore();return}
  for(const img of document.querySelectorAll('.file-list img')){if(!img.complete)track(img,'loading','lazy');track(img,'decoding','async')}
  for(const name of document.querySelectorAll('.file-name'))track(name,'title',name.textContent.trim());
  for(const money of document.querySelectorAll('.money'))track(money,'data-re-negative',String(/[-−]\s*\d/.test(money.textContent)));
  for(const card of document.querySelectorAll('.file-item-col.pointer')){
   if(!card.hasAttribute('tabindex'))track(card,'tabindex','0');if(!card.hasAttribute('role'))track(card,'role','button');
   const label=card.querySelector('.file-name')?.textContent.trim();if(label&&!card.hasAttribute('aria-label'))track(card,'aria-label',label);
  }
  for(const node of changed.keys())if(!node.isConnected)changed.delete(node);
 }
 document.addEventListener('keydown',e=>{if(!settings.enabled||!settings.wallet||!e.target.matches('.file-item-col.pointer'))return;if(e.key==='Enter'||e.key===' '){e.preventDefault();e.target.click()}});
 let queued=false;const observer=new MutationObserver(()=>{if(!queued){queued=true;requestAnimationFrame(()=>{queued=false;update()})}});
 function start(){observer.observe(document.documentElement,{childList:true,characterData:true,subtree:true});configure()}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
 chrome.storage.onChanged.addListener(configure);
})();
