/* Local synthetic backend for the actual shipped information-management component.
 * All records remain in this page's memory; no requests go to the university.
 */
(() => {
 const memory=window.ReimbursementMemoryCore,basic=window.ReimbursementBasicCore;
 const user={groupId:'preview-school',id:'preview-teacher'},scope=user.groupId+'|'+user.id+'|'+basic.formId,userScope=user.groupId+'|'+user.id+'|@recipients';
 localStorage.setItem('userInfo',JSON.stringify(user));
 const banks=[{id:'demo-bank-1',name:'示例银行武汉支行',code:'000000000001'},{id:'demo-bank-2',name:'示例银行洪山支行',code:'000000000002'}];
 const descriptor={scope:userScope,key:'recipient',context:''};
 const store={memoryDatabase:memory.saveRecipient({},descriptor,{name:'示例教师',bank:banks[0],account:'0000000000000001'}),basicTemplateDatabase:basic.save({},scope,{id:'demo-template',name:'常规差旅',values:{SSQK:{value:'不包食宿',label:'不包食宿'},applyReason:{value:'参加学术交流活动',label:'参加学术交流活动'}}})};
 const changes=[],runtime=[];
 function notify(){for(const fn of changes)fn({},'local')}
 const fakeChrome={storage:{local:{async get(defaults){return structuredClone({...defaults,...store})},async set(next){Object.assign(store,structuredClone(next));notify()}},onChanged:{addListener(fn){changes.push(fn)}}},runtime:{getManifest:()=>({version:'0.13.0'}),onMessage:{addListener(fn){runtime.push(fn)}},async sendMessage(message){
   let next=null;
   if(message.type==='memory-save-recipient'){next=memory.saveRecipient(store.memoryDatabase,message.descriptor,message.entry,message.previous);if(next)store.memoryDatabase=next}
   else if(message.type==='memory-remember'){next=memory.remember(store.memoryDatabase,message.descriptor,message.entry);if(next)store.memoryDatabase=next}
   else if(message.type==='memory-delete-recipient'){next=memory.forgetRecipient(store.memoryDatabase,message.scope,message.entry);store.memoryDatabase=next}
   else if(message.type==='memory-clear-recipients'){next=memory.clearRecipients(store.memoryDatabase,message.scope);store.memoryDatabase=next}
   else if(message.type==='basic-template-save'){next=basic.save(store.basicTemplateDatabase,message.scope,message.entry,message.previous);if(next)store.basicTemplateDatabase=next}
   else if(message.type==='basic-template-delete'){next=basic.remove(store.basicTemplateDatabase,message.scope,message.entry);if(next)store.basicTemplateDatabase=next}
   else return new Promise(resolve=>{for(const listener of runtime){const async=listener(message,{},resolve);if(async)return}resolve({ok:false})});
   if(next)notify();return {ok:!!next};
 }}};
 window.chrome=fakeChrome;
 const choices={jjkm:[{value:'30211',label:'差旅费'}],zclx:[{value:'demo-nonresearch',label:'非科研支出'}],zbtx:[{value:'demo-normal',label:'普通指标'}]};
 const formOpen=()=>document.body?.dataset.fixtureView!=='list';
 const snapshot=()=>JSON.stringify([document.querySelector('#reason')?.value,document.querySelector('#meal')?.value]);
 window.addEventListener('message',event=>{
  if(event.source!==window||!['reimbursement-memory-request','reimbursement-basic-request'].includes(event.data?.type))return;
  const m=event.data;let reply={ok:false};
  if(m.action==='identify')reply={ok:true,userScope,scope:formOpen()?scope:null};
  else if(m.action==='search-banks')reply={ok:true,banks:banks.filter(b=>!m.term||b.name.includes(m.term)||b.code===m.term),hasMore:false};
  else if(m.action==='validate-recipient'){const entry=memory.clean('recipient',m.entry);reply={ok:!!entry,entry}}
  else if(m.action==='describe'&&m.fieldId==='demo-recipient-field'){
   const input=document.querySelector('#recipient-demo'),entry=input&&memory.clean('recipient',{name:input.value,bank:banks[0],account:'0000000000000001'});
   if(entry)reply={ok:true,descriptor:{scope,key:'bankAccountName',label:'账户名称',context:'',value:input.value},recipient:{scope,key:'recipient',context:'',value:entry.value,entry}};
  }
  else if(m.action==='apply-recipient'&&m.fieldId==='demo-recipient-field'){
   const input=document.querySelector('#recipient-demo'),current=input&&memory.clean('recipient',{name:input.value,bank:banks[0],account:'0000000000000001'}),entry=memory.clean('recipient',m.entry);
   if(input&&!input.disabled&&entry&&current?.value===m.expected&&m.expectedScope===scope){input.value=entry.name;const bank=document.querySelector('#recipient-demo-bank');if(bank)bank.textContent=entry.bank.name;reply={ok:true};}
  }
  else if(m.action==='basic-describe')reply=formOpen()?{ok:true,scope,snapshot:snapshot(),fields:Object.entries(basic.fields).map(([key,d])=>({key,...d,current:key==='applyReason'?{value:document.querySelector('#reason').value,label:document.querySelector('#reason').value}:key==='SSQK'?{value:document.querySelector('#meal').value,label:document.querySelector('#meal').value}:undefined}))}:{ok:false};
  else if(m.action==='basic-options')reply={ok:true,choices:(choices[m.key]||[]).filter(c=>!m.term||c.label.includes(m.term)),hasMore:false};
  else if(m.action==='basic-apply'){
   if(formOpen()&&m.expected===snapshot()&&!new URLSearchParams(location.search).has('readonly')){
    let count=0;for(const [key,value]of Object.entries(m.entry.values||{})){const n=document.querySelector(key==='applyReason'?'#reason':key==='SSQK'?'#meal':'#none');if(n&&(m.overwrite||!n.value)){n.value=value.value;count++}}reply={ok:true,count};
   }
  }
  window.postMessage({type:'reimbursement-memory-reply',id:m.id,...reply},location.origin);
 });
 document.addEventListener('DOMContentLoaded',()=>{
  document.querySelector('#manager-toggle')?.remove(); // The shipped manager supplies its real trigger.
  const menuToggle=document.querySelector('.ant-layout-sider-trigger');
  function menu(open){document.body.dataset.navExpanded=String(open);menuToggle?.setAttribute('aria-expanded',String(open));menuToggle?.setAttribute('aria-label',open?'收起系统导航':'展开系统导航')}
  menuToggle?.addEventListener('click',()=>menu(document.body.dataset.navExpanded!=='true'));
  document.querySelector('.ant-layout-sider')?.addEventListener('keydown',e=>{if(e.key==='Escape'){menu(false);menuToggle?.focus()}});
  for(const link of document.querySelectorAll('[data-fixture-route]'))link.addEventListener('click',event=>{
   event.preventDefault();const view=link.dataset.fixtureRoute;document.body.dataset.fixtureView=view;
   menu(false);
   document.querySelector('#form-view').hidden=view==='list';document.querySelector('#list-view').hidden=view!=='list';
   window.dispatchEvent(new Event('hashchange'));
  });
 });
})();
