(() => {
 'use strict';
 const core=window.ReimbursementMemoryCore;
 const defaults={enabled:true,memory:true,memoryBank:true};let settings=defaults,database={},sequence=0,showSequence=0,currentInput,menu,returnInput,returnUntil=0;
 const requests=new Map();
 function request(action,fieldId,other={}){return new Promise(resolve=>{
  const id='memory-'+(++sequence);const timer=setTimeout(()=>{requests.delete(id);if(['apply','apply-recipient'].includes(action))window.postMessage({type:'reimbursement-memory-request',id:id+'-cancel',action:'cancel',fieldId},location.origin);resolve(null)},5000);
  requests.set(id,{resolve,timer,action,fieldId,key:other.key});window.postMessage({type:'reimbursement-memory-request',id,action,fieldId,...other},location.origin);
 })}
 window.addEventListener('message',event=>{
  if(event.source!==window||event.origin!==location.origin||event.data?.type!=='reimbursement-memory-reply')return;
  const pending=requests.get(event.data.id);if(!pending)return;
  clearTimeout(pending.timer);requests.delete(event.data.id);pending.resolve(event.data);
 });
 async function load(){const data=await chrome.storage.local.get({...defaults,memoryDatabase:{}});settings=data;database=data.memoryDatabase;
  for(const [id,p]of requests)if(['apply','apply-recipient'].includes(p.action)&&(!settings.enabled||(!settings.memoryBank&&['bankAccount','recipient'].includes(p.key)))){window.postMessage({type:'reimbursement-memory-request',id:id+'-cancel',action:'cancel',fieldId:p.fieldId},location.origin);clearTimeout(p.timer);requests.delete(id);p.resolve(null)}
  if(!settings.enabled)close();decorate();
 }
 function permitted(d){let prefix;try{const u=JSON.parse(localStorage.getItem('userInfo')||'null');if(u?.id)prefix=String(u.groupId||'')+'|'+String(u.id)+'|'}catch{}return d&&prefix&&d.scope?.startsWith(prefix)&&settings.enabled&&(!['bankAccount','recipient'].includes(d.key)||settings.memoryBank)}
 async function remember(d){
  if(!core?.clean||!settings.memory||!permitted(d))return false;
  const normalized=core.clean(d.key,d.entry),first=database[core.slot(d)]?.[0];if(!normalized)return false;if(first?.value===normalized.value&&Date.now()-first.at<30000)return true;
  const result=await chrome.runtime.sendMessage({type:'memory-remember',descriptor:d,entry:d.entry}).catch(()=>null);return !!result?.ok;
 }
 function close(){menu?.remove();menu=null}
 async function capture(input){const r=await request('describe',input.dataset.reMemoryId);if(r?.recipient?.entry&&permitted(r.recipient))await remember(r.recipient);else await remember(r?.descriptor)}
 async function show(input,all=false){
  const token=++showSequence;currentInput=input;close();const response=await request('describe',input.dataset.reMemoryId);let d=response?.descriptor,bundle=false;
  if(!core?.recall||token!==showSequence||currentInput!==input||!input.isConnected||!permitted(d))return;
  let entries=core.recall(database,d).filter(e=>d.key==='bankAccount'||e.label.includes(input.value.trim()));
  if(d.key==='bankAccountName'&&permitted(response.recipient)){
   const groups=core.library(database,core.recipientScope(response.recipient.scope)).filter(e=>all||e.name.includes(input.value.trim()));
   if(groups.length){d=response.recipient;entries=groups;bundle=true}
  }
  if(['branchBankName','bankAccount'].includes(d.key)&&permitted(response.recipient)){
   const groups=core.library(database,core.recipientScope(response.recipient.scope)).filter(e=>e.name===response.descriptor?.context.split('|')[0]);
   const rows=d.key==='branchBankName'?groups.map(e=>core.clean(d.key,{value:e.bank.kind==='manual'?e.bank.name:e.bank.id,record:e.bank})):groups.filter(e=>d.context===e.name+'|'+(e.bank.code||(e.bank.kind==='manual'?e.bank.name:e.bank.id))).map(e=>core.clean(d.key,{value:e.account}));
   entries=[...rows.filter(Boolean),...entries].filter((e,i,a)=>a.findIndex(x=>x.value===e.value)===i);
  }
  if(!entries.length)return;
  if(bundle&&window.ReimbursementUI){const picker=window.ReimbursementUI.openRecipientPicker({anchor:input,entries,onClose:close,onValue:async entry=>{close();if(!input.isConnected||input.disabled||input.readOnly||!permitted(d))return;const result=await request('apply-recipient',input.dataset.reMemoryId,{entry,key:d.key,expected:d.value,expectedScope:d.scope,expectedContext:d.context});if(!result?.ok&&input.isConnected)window.ReimbursementUI.notify('未能回填，请重新选择或手动填写。')}});menu={remove:()=>{returnInput=input;returnUntil=Date.now()+300;picker.destroy()},contains:picker.contains};return}
  const host=document.createElement('div'),shadow=host.attachShadow({mode:'open'}),style=document.createElement('style');
  style.textContent=':host{position:fixed;z-index:1100;display:block;font:14px system-ui;color:rgba(0,0,0,.85)}ul{margin:0;padding:4px;background:white;border:1px solid #d9d9d9;border-radius:4px;box-shadow:0 6px 16px #00000014;max-height:240px;overflow:auto;list-style:none}li{padding:8px 10px;cursor:pointer;white-space:pre-wrap;overflow-wrap:anywhere}li:hover,li[aria-selected="true"]{background:#e6f7ff}.notice{background:#fff;padding:10px;border:1px solid #d9d9d9;border-radius:4px}';
  shadow.append(style);const list=document.createElement('ul');list.setAttribute('role','listbox');list.setAttribute('aria-label',bundle?'已保存收款人':d.label);shadow.append(list);
  let active=-1;
  function highlight(index){active=index;[...list.children].forEach((li,i)=>li.setAttribute('aria-selected',String(i===active)))}
  async function choose(index){const entry=entries[index];if(!entry)return;close();const result=await request(bundle?'apply-recipient':'apply',input.dataset.reMemoryId,{entry,key:d.key,expected:d.value,expectedScope:d.scope,expectedContext:d.context});if(!result?.ok&&input.isConnected&&document.activeElement===input){list.remove();const notice=document.createElement('div');notice.className='notice';notice.setAttribute('role','status');notice.textContent='未能回填，请重新选择或手动填写。';shadow.append(notice);document.body.append(host);menu=host}}
  entries.forEach((entry,index)=>{const li=document.createElement('li');li.setAttribute('role','option');li.textContent=entry.label;li.addEventListener('mousedown',e=>e.preventDefault());li.addEventListener('click',()=>choose(index));list.append(li)});
  const box=input.getBoundingClientRect();host.style.left=Math.max(8,Math.min(box.left,innerWidth-Math.min(box.width,420)-8))+'px';host.style.top=Math.min(box.bottom+4,Math.max(8,innerHeight-250))+'px';host.style.width=Math.min(Math.max(box.width,180),420)+'px';document.body.append(host);menu=host;
  input.onReMemoryKey=e=>{if(!menu||!list.isConnected)return;if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();e.stopImmediatePropagation();highlight((active+(e.key==='ArrowDown'?1:-1)+entries.length)%entries.length)}else if(e.key==='Enter'&&active>=0){e.preventDefault();e.stopImmediatePropagation();choose(active)}else if(e.key==='Escape')close()};
 }
 function decorate(){
  for(const input of document.querySelectorAll('[data-re-memory-key="bankAccountName"]')){
   const parent=input.parentElement;if(!parent)continue;
   let arrow=parent.querySelector('[data-re-recipient-arrow]');
   if(!settings.enabled||!settings.memoryBank||input.disabled||input.readOnly){arrow?.remove();parent.classList.remove('re-recipient-picker');continue}
   if(arrow)continue;
   arrow=document.createElement('button');arrow.type='button';arrow.dataset.reRecipientArrow='true';arrow.textContent='⌄';arrow.setAttribute('aria-label','选择已保存收款人');arrow.setAttribute('aria-haspopup','listbox');
   arrow.addEventListener('mousedown',e=>e.preventDefault());arrow.addEventListener('click',()=>{input.focus();show(input,true)});
   parent.classList.add('re-recipient-picker');parent.append(arrow);
  }
 }
 const pickerStyle=document.createElement('style');pickerStyle.textContent='.re-recipient-picker{position:relative!important}.re-recipient-picker input[data-re-memory-key="bankAccountName"]{padding-right:28px!important}[data-re-recipient-arrow]{position:absolute;right:4px;top:50%;transform:translateY(-50%);width:24px;height:24px;padding:0;border:0;background:transparent;color:#8c8c8c;cursor:pointer;font:18px system-ui}[data-re-recipient-arrow]:hover{color:#1890ff}[data-re-recipient-arrow]:focus-visible{outline:2px solid #1890ff}';document.documentElement.append(pickerStyle);
 new MutationObserver(decorate).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['data-re-memory-key','disabled','readonly']});
 document.addEventListener('focusin',e=>{const input=e.target;if(input===returnInput&&Date.now()<returnUntil){returnInput=null;return}if(input?.dataset?.reMemoryId)show(input)});
 document.addEventListener('input',e=>{const input=e.target;if(input?.dataset?.reMemoryId)show(input)});
 document.addEventListener('keydown',e=>{if(e.target?.dataset?.reMemoryId&&e.target.onReMemoryKey)e.target.onReMemoryKey(e)},true);
 document.addEventListener('change',e=>{if(e.target?.dataset?.reMemoryId)capture(e.target)});
 document.addEventListener('focusout',e=>{const input=e.target;if(!input?.dataset?.reMemoryId)return;setTimeout(async()=>{if(menu?.contains?.(document.activeElement))return;if(document.activeElement!==input){if(currentInput===input){currentInput=null;close()}await capture(input)}},160)});
 window.addEventListener('scroll',e=>{if(!menu?.contains?.(e.target))close()},true);window.addEventListener('resize',close);
 chrome.storage.onChanged.addListener(load);load();
 chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(message.type!=='remember-current-form')return;
  request('capture').then(async r=>{let count=0;for(const d of r?.descriptors||[])if(await remember(d))count++;respond({ok:!!r,count})});return true;
 });
})();
