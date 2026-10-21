const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('AI guard blocks only two generation endpoints and can be disabled',async()=>{
 let listener,rules,settings={enabled:true,aiGuard:true};
 const chrome={runtime:{onMessage:{addListener:f=>listener=f}},storage:{local:{get:async()=>settings}},declarativeNetRequest:{updateSessionRules:async r=>{rules=r}},tabs:{onRemoved:{addListener:()=>{}}}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../extension/background.js','utf8'),{chrome,ReimbursementSite:require("../extension/site.js")});
 const call=()=>new Promise(resolve=>listener({type:'configure-guard'},{tab:{id:42},url:'http://wsbx.wbu.edu.cn/workbench-web/'},resolve));
 assert.equal((await call()).ok,true);assert.equal(rules.addRules.length,1);
 const regex=new RegExp(rules.addRules[0].condition.regexFilter);
 for(const p of ['ai','ai-again','ai?x=1'])assert.equal(regex.test('http://wsbx.wbu.edu.cn/reimburse-service/api/v1/reimbursement/'+p),true);
 for(const p of ['save','commit','getAuditResult','ai-other'])assert.equal(regex.test('http://wsbx.wbu.edu.cn/reimburse-service/api/v1/reimbursement/'+p),false);
 assert.equal(regex.test('http://elsewhere.example/reimburse-service/api/v1/reimbursement/ai'),false);
 settings={enabled:true,aiGuard:false};await call();assert.equal(rules.addRules.length,0);
});
test('old content scripts stop worker reconciliation after extension reload invalidates their context',async()=>{
 let calls=0,next=0;const timers=new Map(),listeners={};const document={querySelectorAll:()=>[],addEventListener:(k,f)=>listeners[k]=f};const chrome={storage:{local:{get:async d=>d},onChanged:{addListener(){}}},runtime:{sendMessage(){calls++;throw Error('Extension context invalidated.')}}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../extension/control.js','utf8'),{document,chrome,window:{postMessage(){}},location:{origin:'http://wsbx.wbu.edu.cn'},setInterval(fn){timers.set(++next,fn);return next},clearInterval(id){timers.delete(id)}});
 await new Promise(setImmediate);assert.equal(calls,1);assert.equal(timers.size,0);await listeners.DOMContentLoaded();assert.equal(calls,1);
});
