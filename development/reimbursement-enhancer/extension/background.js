const defaults = { enabled: true, totals: true, aiGuard: true };
if(typeof importScripts==='function')importScripts('memory-core.js');
if(typeof importScripts==='function')importScripts('basic-core.js');
let memoryQueue=Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if(['basic-template-save','basic-template-delete'].includes(message.type)&&sender.tab?.id&&/^https?:\/\/wsbx\.wbu\.edu\.cn\/workbench-web\//.test(sender.url||'')){
    memoryQueue=memoryQueue.catch(()=>{}).then(async()=>{
      const data=await chrome.storage.local.get({basicTemplateDatabase:{}});
      const next=message.type==='basic-template-save'?ReimbursementBasicCore.save(data.basicTemplateDatabase,message.scope,message.entry,message.previous):ReimbursementBasicCore.remove(data.basicTemplateDatabase,message.scope,message.entry);
      if(!next)return false;await chrome.storage.local.set({basicTemplateDatabase:next});return true;
    });memoryQueue.then(ok=>respond({ok})).catch(()=>respond({ok:false}));return true;
  }
  if(message.type==='memory-save-recipient'&&sender.tab?.id&&/^https?:\/\/wsbx\.wbu\.edu\.cn\/workbench-web\//.test(sender.url||'')){
    memoryQueue=memoryQueue.catch(()=>{}).then(async()=>{
      const data=await chrome.storage.local.get({memoryBank:true,memoryDatabase:{}});
      if(!data.memoryBank)return false;
      const next=ReimbursementMemoryCore.saveRecipient(data.memoryDatabase,message.descriptor,message.entry,message.previous);
      if(!next)return false;
      await chrome.storage.local.set({memoryDatabase:next});return true;
    });memoryQueue.then(ok=>respond({ok})).catch(()=>respond({ok:false}));return true;
  }
  if(['memory-delete-recipient','memory-clear-recipients'].includes(message.type)&&sender.tab?.id&&/^https?:\/\/wsbx\.wbu\.edu\.cn\/workbench-web\//.test(sender.url||'')){
    memoryQueue=memoryQueue.catch(()=>{}).then(async()=>{
      if(ReimbursementMemoryCore.recipientScope(message.scope)!==message.scope)return false;
      if(message.type==='memory-delete-recipient'&&!ReimbursementMemoryCore.clean('recipient',message.entry))return false;
      const data=await chrome.storage.local.get({memoryDatabase:{}}),next=message.type==='memory-delete-recipient'?ReimbursementMemoryCore.forgetRecipient(data.memoryDatabase,message.scope,message.entry):ReimbursementMemoryCore.clearRecipients(data.memoryDatabase,message.scope);
      await chrome.storage.local.set({memoryDatabase:next});return true;
    });memoryQueue.then(ok=>respond({ok})).catch(()=>respond({ok:false}));return true;
  }
  if(['memory-delete','memory-clear-scope'].includes(message.type)&&sender.tab?.id&&/^https?:\/\/wsbx\.wbu\.edu\.cn\/workbench-web\//.test(sender.url||'')){
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
  if(message.type==='memory-remember'&&sender.tab?.id&&/^https?:\/\/wsbx\.wbu\.edu\.cn\/workbench-web\//.test(sender.url||'')){
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
  if (message.type !== 'configure-guard' || !sender.tab?.id || !/^https?:\/\/wsbx\.wbu\.edu\.cn\//.test(sender.url || '')) return;
  chrome.storage.local.get(defaults).then(settings => {
    const id = sender.tab.id;
    return chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id], addRules: settings.enabled && settings.aiGuard ? [{
      id, priority: 1, action: { type: 'block' }, condition: {
        regexFilter: '^https?://wsbx\\.wbu\\.edu\\.cn/reimburse-service/api/v1/reimbursement/ai(?:-again)?(?:\\?|$)',
        resourceTypes: ['xmlhttprequest'], tabIds: [id]
      }
    }] : [] });
  }).then(() => respond({ ok: true })).catch(() => respond({ ok: false }));
  return true;
});
chrome.tabs.onRemoved.addListener(id => chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id] }).catch(() => {}));
