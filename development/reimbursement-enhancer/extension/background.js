const defaults = { enabled: true, totals: true, aiGuard: true };
if(typeof importScripts==='function')importScripts('site.js');
if(typeof importScripts==='function')importScripts('memory-core.js');
if(typeof importScripts==='function')importScripts('basic-core.js');
if(typeof importScripts==='function')importScripts('fill-compat-core.js');
let memoryQueue=Promise.resolve();
const fillLeases=new Map();
const leaseKey=id=>'fillCompatLease:'+id;
async function storedLease(id){if(chrome.storage.session){const saved=await chrome.storage.session.get(leaseKey(id));return saved[leaseKey(id)]}return fillLeases.get(id)}
async function clearLease(id){const lease=fillLeases.get(id);if(lease)clearTimeout(lease.timer);fillLeases.delete(id);if(chrome.storage.session)await chrome.storage.session.remove(leaseKey(id))}
const workbench=sender=>sender.tab?.id&&ReimbursementSite.workbench(sender.url||'');
function draftMatches(sender,id){try{const hash=new URL(sender.url).hash;return hash.startsWith('#/reimbursementCreate?')&&new URLSearchParams(hash.split('?')[1]).get('formEditId')===id}catch{return false}}
async function configureGuard(id,url){
 const settings=await chrome.storage.local.get(defaults);let lease=await storedLease(id);
 if(lease&&(lease.until<=Date.now()||(url&&!draftMatches({url},lease.id)))){await clearLease(id);lease=null}
 return chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:[id],addRules:settings.enabled&&settings.aiGuard&&!(lease&&lease.until>Date.now())?[{
  id,priority:1,action:{type:'block'},condition:{regexFilter:ReimbursementSite.aiRequestPattern,resourceTypes:['xmlhttprequest'],tabIds:[id]}
 }]:[]});
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if(['fill-backup-save','fill-backup-get','fill-backup-mark-result','fill-guard-begin','fill-guard-end'].includes(message.type)){
    if(!workbench(sender)||(sender.frameId!=null&&sender.frameId!==0)){respond({ok:false});return}
    memoryQueue=memoryQueue.catch(()=>{}).then(async()=>{
      const tabId=sender.tab.id;
      if(message.type==='fill-guard-end'){
        const lease=await storedLease(tabId);if(!lease){await configureGuard(tabId);return {ok:true}}if(lease.token!==message.lease)return {ok:false};
        await clearLease(tabId);await configureGuard(tabId);return {ok:true};
      }
      // MessageSender.url can retain the document's initial hash in this SPA.
      // Read the live tab URL; never accept a route supplied in the message.
      const currentTab=await chrome.tabs.get(tabId);
      const currentSender={...sender,url:currentTab.url};
      if(!workbench(currentSender))return {ok:false};
      const snapshot=message.snapshot,scope=snapshot?.scope||message.scope,id=snapshot?.id||message.id;
      if(typeof scope!=='string'||!scope||scope.length>250||typeof id!=='string'||!draftMatches(currentSender,id))return {ok:false};
      const key=JSON.stringify([scope,id]),data=await chrome.storage.local.get({fillCompatBackups:{}}),backups=data.fillCompatBackups;
      if(message.type==='fill-backup-get')return {ok:true,snapshot:backups[key]||null};
      if(message.type==='fill-backup-mark-result'){
        if(!backups[key]||typeof message.success!=='boolean')return {ok:false};
        await chrome.storage.local.set({fillCompatBackups:{...backups,[key]:{...backups[key],generationOutcome:{success:message.success,message:String(message.message||'').slice(0,2000)}}}});return {ok:true};
      }
      if(message.type==='fill-backup-save'){
        if(!ReimbursementFillCompatCore.validate(snapshot)||JSON.stringify(snapshot).length>3000000)return {ok:false};
        if(backups[key])return {ok:true,existing:true,reused:JSON.stringify(backups[key].data)===JSON.stringify(snapshot.data)&&backups[key].tickets===snapshot.tickets};
        await chrome.storage.local.set({fillCompatBackups:{...backups,[key]:snapshot}});return {ok:true};
      }
      const existing=await storedLease(tabId);if(!backups[key]||(existing&&existing.until>Date.now()))return {ok:false};
      const token=crypto.randomUUID(),lease={token,id,scope,until:Date.now()+180000};fillLeases.set(tabId,lease);
      lease.timer=setTimeout(()=>{if(fillLeases.get(tabId)===lease)clearLease(tabId).then(()=>configureGuard(tabId)).catch(()=>{})},180000);
      try{if(chrome.storage.session)await chrome.storage.session.set({[leaseKey(tabId)]:{token,id,scope,until:lease.until}});await configureGuard(tabId,currentSender.url);return {ok:true,lease:token}}catch(error){await clearLease(tabId);throw error}
    });memoryQueue.then(respond).catch(()=>respond({ok:false}));return true;
  }
  if(['basic-template-save','basic-template-delete'].includes(message.type)&&workbench(sender)){
    memoryQueue=memoryQueue.catch(()=>{}).then(async()=>{
      const data=await chrome.storage.local.get({basicTemplateDatabase:{}});
      const next=message.type==='basic-template-save'?ReimbursementBasicCore.save(data.basicTemplateDatabase,message.scope,message.entry,message.previous):ReimbursementBasicCore.remove(data.basicTemplateDatabase,message.scope,message.entry);
      if(!next)return false;await chrome.storage.local.set({basicTemplateDatabase:next});return true;
    });memoryQueue.then(ok=>respond({ok})).catch(()=>respond({ok:false}));return true;
  }
  if(message.type==='memory-save-recipient'&&workbench(sender)){
    memoryQueue=memoryQueue.catch(()=>{}).then(async()=>{
      const data=await chrome.storage.local.get({memoryBank:true,memoryDatabase:{}});
      if(!data.memoryBank)return false;
      const next=ReimbursementMemoryCore.saveRecipient(data.memoryDatabase,message.descriptor,message.entry,message.previous);
      if(!next)return false;
      await chrome.storage.local.set({memoryDatabase:next});return true;
    });memoryQueue.then(ok=>respond({ok})).catch(()=>respond({ok:false}));return true;
  }
  if(['memory-delete-recipient','memory-clear-recipients'].includes(message.type)&&workbench(sender)){
    memoryQueue=memoryQueue.catch(()=>{}).then(async()=>{
      if(ReimbursementMemoryCore.recipientScope(message.scope)!==message.scope)return false;
      if(message.type==='memory-delete-recipient'&&!ReimbursementMemoryCore.clean('recipient',message.entry))return false;
      const data=await chrome.storage.local.get({memoryDatabase:{}}),next=message.type==='memory-delete-recipient'?ReimbursementMemoryCore.forgetRecipient(data.memoryDatabase,message.scope,message.entry):ReimbursementMemoryCore.clearRecipients(data.memoryDatabase,message.scope);
      await chrome.storage.local.set({memoryDatabase:next});return true;
    });memoryQueue.then(ok=>respond({ok})).catch(()=>respond({ok:false}));return true;
  }
  if(['memory-delete','memory-clear-scope'].includes(message.type)&&workbench(sender)){
    memoryQueue=memoryQueue.catch(()=>{}).then(async()=>{
      const data=await chrome.storage.local.get({memoryDatabase:{}});let next;
      if(message.type==='memory-delete'){
        if(!ReimbursementMemoryCore.slot(message.descriptor)||!ReimbursementMemoryCore.clean(message.descriptor?.key,message.entry))return false;
        next=ReimbursementMemoryCore.forget(data.memoryDatabase,message.descriptor,message.entry);
      }else{
        if(typeof message.scope!=='string'||!message.scope||message.scope.length>250)return false;
        next={...data.memoryDatabase};for(const key of Object.keys(next)){try{if(JSON.parse(key)[0]===message.scope)delete next[key]}catch{}}
      }
      await chrome.storage.local.set({memoryDatabase:next});return true;
    });memoryQueue.then(ok=>respond({ok})).catch(()=>respond({ok:false}));return true;
  }
  if(message.type==='memory-clear'&&!sender.tab){
    memoryQueue=memoryQueue.catch(()=>{}).then(()=>chrome.storage.local.remove('memoryDatabase'));
    memoryQueue.then(()=>respond({ok:true})).catch(()=>respond({ok:false}));return true;
  }
  if(message.type==='memory-remember'&&workbench(sender)){
    memoryQueue=memoryQueue.catch(()=>{}).then(async()=>{
      const data=await chrome.storage.local.get({enabled:true,memory:true,memoryBank:true,memoryDatabase:{}});
      if(!data.enabled||!data.memory||(!data.memoryBank&&['bankAccount','recipient'].includes(message.descriptor?.key)))return false;
      if(!ReimbursementMemoryCore.slot(message.descriptor)||!ReimbursementMemoryCore.clean(message.descriptor?.key,message.entry))return false;
      const descriptor=message.descriptor.key==='recipient'?{...message.descriptor,scope:ReimbursementMemoryCore.recipientScope(message.descriptor.scope)}:message.descriptor;
      const next=ReimbursementMemoryCore.remember(data.memoryDatabase,descriptor,message.entry);
      await chrome.storage.local.set({memoryDatabase:next});return true;
    });
    memoryQueue.then(ok=>respond({ok})).catch(()=>respond({ok:false}));return true;
  }
  if (message.type !== 'configure-guard' || !workbench(sender)) return;
  configureGuard(sender.tab.id,sender.url).then(() => respond({ ok: true })).catch(() => respond({ ok: false }));
  return true;
});
chrome.tabs.onRemoved.addListener(id => {clearLease(id).catch(()=>{});chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id] }).catch(() => {})});
