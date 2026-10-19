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
