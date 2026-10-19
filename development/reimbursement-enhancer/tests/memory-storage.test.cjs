const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const memory=require('../extension/memory-core.js');
test('service worker serializes concurrent history writes and clearing',async()=>{
 let listener,data={};
 const chrome={runtime:{onMessage:{addListener:f=>listener=f}},storage:{local:{get:async defaults=>({...defaults,...data}),set:async next=>{await new Promise(setImmediate);Object.assign(data,next)},remove:async key=>delete data[key]}},declarativeNetRequest:{updateSessionRules:async()=>{}},tabs:{onRemoved:{addListener:()=>{}}}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../extension/background.js','utf8'),{chrome,ReimbursementSite:require("../extension/site.js"),ReimbursementMemoryCore:memory});
 const call=(message,sender={tab:{id:1},url:'http://wsbx.wbu.edu.cn/workbench-web/'})=>new Promise(resolve=>listener(message,sender,resolve));
 const descriptor={scope:'teacher|travel',key:'applyReason',context:''};
 await Promise.all([call({type:'memory-remember',descriptor,entry:{value:'first'}}),call({type:'memory-remember',descriptor,entry:{value:'second'}})]);
 assert.equal(memory.recall(data.memoryDatabase,descriptor).length,2);
 const next=call({type:'memory-remember',descriptor,entry:{value:'third'}}),clear=call({type:'memory-clear'},{});await Promise.all([next,clear]);assert.equal(data.memoryDatabase,undefined);
 data.memoryBank=false;await call({type:'memory-remember',descriptor:{...descriptor,key:'bankAccount',context:'person|bank'},entry:{value:'1234567890123456'}});assert.equal(data.memoryDatabase,undefined);
 const bundle={name:'Person',bank:{id:'bank',name:'Full bank',code:'123'},account:'1234567890123456'},recipient={...descriptor,key:'recipient'};
 await call({type:'memory-remember',descriptor:recipient,entry:bundle});assert.equal(data.memoryDatabase,undefined);
 const globalScope=memory.recipientScope(recipient.scope);
 data.memoryBank=true;await call({type:'memory-remember',descriptor:recipient,entry:bundle});assert.equal(memory.library(data.memoryDatabase,globalScope).length,1);
 await call({type:'memory-delete-recipient',scope:globalScope,entry:bundle});assert.equal(memory.library(data.memoryDatabase,globalScope).length,0);
 data.memory=false;
 assert.equal((await call({type:'memory-save-recipient',descriptor:recipient,entry:bundle})).ok,true);
 const edited={...bundle,account:'1234567890999999'};
 assert.equal((await call({type:'memory-save-recipient',descriptor:recipient,entry:edited,previous:bundle})).ok,true);
 assert.equal(memory.recall(data.memoryDatabase,recipient).length,1);assert.equal(memory.recall(data.memoryDatabase,recipient)[0].account,edited.account);
 assert.equal((await call({type:'memory-save-recipient',descriptor:recipient,entry:bundle,previous:bundle})).ok,false);
 data.memoryBank=false;assert.equal((await call({type:'memory-save-recipient',descriptor:recipient,entry:bundle})).ok,false);data.memoryBank=true;data.memory=true;
 await call({type:'memory-remember',descriptor,entry:{value:'current'}});const other={...descriptor,scope:'other|travel'};await call({type:'memory-remember',descriptor:other,entry:{value:'other'}});
 await call({type:'memory-clear-scope',scope:descriptor.scope});assert.equal(memory.recall(data.memoryDatabase,descriptor).length,0);assert.equal(memory.recall(data.memoryDatabase,other).length,1);
});


const basic=require('../extension/basic-core.js');
test('template worker serializes edits, rejects stale writes, and preserves separate recipient data',async()=>{
 let listener,data={memoryDatabase:{keep:['original']}};
 const chrome={runtime:{onMessage:{addListener:f=>listener=f}},storage:{local:{get:async defaults=>({...defaults,...data}),set:async next=>{await new Promise(setImmediate);Object.assign(data,next)}}},tabs:{onRemoved:{addListener:()=>{}}}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../extension/background.js','utf8'),{chrome,ReimbursementSite:require("../extension/site.js"),ReimbursementBasicCore:basic});
 const call=message=>new Promise(resolve=>listener(message,{tab:{id:1},url:'http://wsbx.wbu.edu.cn/workbench-web/'},resolve)),scope='school|teacher|'+basic.formId,first={id:'one',name:'one',values:{applyReason:{value:'reason',label:'reason'}}},second={...first,id:'two',name:'two'};
 await Promise.all([first,second].map(entry=>call({type:'basic-template-save',scope,entry})));assert.equal(data.basicTemplateDatabase[scope].length,2);assert.deepEqual(data.memoryDatabase,{keep:['original']});
 const edited={...first,name:'edited'};assert.equal((await call({type:'basic-template-save',scope,entry:edited,previous:first})).ok,true);assert.equal((await call({type:'basic-template-save',scope,entry:first,previous:first})).ok,false);assert.equal((await call({type:'basic-template-delete',scope,entry:first})).ok,false);assert.equal((await call({type:'basic-template-delete',scope,entry:edited})).ok,true);assert.equal(data.basicTemplateDatabase[scope].length,1);
});
test('manual bank recipients save and edit through the worker without affecting separate financial fields',async()=>{
 let listener,data={memoryDatabase:{},unrelatedTotal:'9996.48'};
 const chrome={runtime:{onMessage:{addListener:f=>listener=f}},storage:{local:{get:async defaults=>({...defaults,...data}),set:async n=>Object.assign(data,n)}},tabs:{onRemoved:{addListener:()=>{}}}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../extension/background.js','utf8'),{chrome,ReimbursementSite:require("../extension/site.js"),ReimbursementMemoryCore:memory});
 const call=m=>new Promise(r=>listener(m,{tab:{id:1},url:'http://wsbx.wbu.edu.cn/workbench-web/'},r)),descriptor={scope:'school|teacher|@recipients',key:'recipient',context:''},entry={name:'Synthetic',bank:{kind:'manual',name:'交通银行武汉分行',code:''},account:'1234567890123456'};
 assert.equal((await call({type:'memory-save-recipient',descriptor,entry})).ok,true);assert.deepEqual(memory.library(data.memoryDatabase,descriptor.scope)[0].bank,entry.bank);
 const edited={...entry,bank:{...entry.bank,name:'另一家手填支行'}};assert.equal((await call({type:'memory-save-recipient',descriptor,entry:edited,previous:entry})).ok,true);assert.equal(memory.library(data.memoryDatabase,descriptor.scope).length,1);assert.equal(data.unrelatedTotal,'9996.48');
 data.memoryBank=false;assert.equal((await call({type:'memory-save-recipient',descriptor,entry})).ok,false);
});
