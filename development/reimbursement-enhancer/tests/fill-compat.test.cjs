const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('../extension/fill-compat-core.js');
const draft=()=>({reimbursementId:'draft-a',formId:'travel',state:2,activitys:[{behaviors:[{behaviorDetail:[{id:'detail',BSX070306:'103.90',billRelation:[{BSX070802:'real-bill',BSX070804:'103.90'}]}]}]}],totalAmount:'8753.80',receivableInfo:[{actualReceivableCurrency:'720.00'},{actualReceivableCurrency:'8033.80'}],budgetInfo:[{zyje:'8753.80'}],assocDataInfo2:[{no:'advance',amountCurrency:'8600'}],billVOList:[{barcode:'A'},{barcode:'B'}]});
test('fill backup restores checked amounts, allocations, funding and payees but never server workflow flags',()=>{
 const form=draft(),before=structuredClone(form),backup=core.capture(form,'group|user');
 form.activitys=[];form.receivableInfo=[];form.totalAmount='10261';form.budgetInfo=[];form.assocDataInfo2=[];
 form.aiFlag='true';form.approveVos=[{result:'native'}];form.requestMethod='getFullById';form.stateName='server';
 core.restore(form,backup,'group|user');
 for(const key of ['activitys','receivableInfo','totalAmount','budgetInfo','assocDataInfo2'])assert.deepEqual(form[key],before[key]);
 assert.equal(form.aiFlag,'true');assert.deepEqual(form.approveVos,[{result:'native'}]);assert.equal(form.requestMethod,'getFullById');assert.equal(form.stateName,'server');
 assert.equal(backup.data.aiFlag,undefined);assert.equal(backup.data.billVOList,undefined);
});
test('recovery cannot create an AI completion flag and rejects cross-account, draft and ticket changes atomically',()=>{
 const form=draft(),backup=core.capture(form,'group|user');core.restore(form,backup,'group|user');assert.equal(form.aiFlag,undefined);
 for(const change of [f=>f.reimbursementId='other',f=>f.formId='other',f=>f.state=6,f=>f.billVOList.pop()]){
  const current=draft();change(current);const before=structuredClone(current);assert.throws(()=>core.restore(current,backup,'group|user'));assert.deepEqual(current,before);
 }
 assert.throws(()=>core.restore(form,backup,'group|other'));
 form.billVOList.reverse();assert.doesNotThrow(()=>core.restore(form,backup,'group|user'));
});
test('unrecognized backup data cannot overwrite status, invoice inventory or approval result',()=>{
 const form=draft(),backup=core.capture(form,'g|u');Object.assign(backup.data,{state:6,aiFlag:true,billVOList:[],approveVos:[{passed:true}]});
 core.restore(form,backup,'g|u');assert.equal(form.state,2);assert.equal(form.aiFlag,undefined);assert.equal(form.billVOList.length,2);assert.equal(form.approveVos,undefined);
});
test('only saved draft state can be captured, and backup is independent of reactive source edits',()=>{
 for(const state of [0,6,7,12,99])assert.throws(()=>core.capture({...draft(),state},'g|u'));
 const form=draft();form.payAmount=undefined;const snapshot=core.capture(form,'g|u');form.activitys[0].behaviors.length=0;assert.equal(snapshot.data.activitys[0].behaviors.length,1);
});
function bridgeFixture(){
 const listeners={},replies=[],calls=[],form=draft(),document={querySelectorAll:()=>[]},location={origin:'http://wsbx.wbu.edu.cn',hash:'#/reimbursementCreate?formEditId=draft-a'},http={post:async()=>({success:true,data:{}})},native={setupState:{formConfig:{},controlsList:[],onClickBtn:async event=>{calls.push(event);if(event.btnEvent.event==='4')await http.post('/reimburse-service/api/v1/reimbursement/ai-again',{id:'draft-a'})}}};
 const window={ReimbursementFillCompatCore:core,addEventListener:(type,f)=>listeners[type]=f,postMessage:r=>replies.push(r)};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../extension/fill-compat.js','utf8'),{window,document,URL,URLSearchParams,localStorage:{getItem:()=>JSON.stringify({id:'u',groupId:'g'})},location});
 const environment={form:()=>form,http,readDraft:async id=>({success:true,data:{id,state:form.state,reimbursementNo:form.reimbursementNo,totalAmount:form.totalAmount,reimbData:structuredClone(form)}}),readAudit:async()=>({success:true,data:null})};window.ReimbursementFillCompat.bind(environment);window.ReimbursementFillCompat.register(native);
 return {form,native,calls,http,location,document,environment,async send(action,extra={}){await listeners.message({source:window,origin:'http://wsbx.wbu.edu.cn',data:{type:'reimbursement-fill-request',id:action,action,...extra}});return replies.at(-1)}};
}
test('an empty native inventory cannot erase receipts from a positive expense draft',()=>{
 const form=draft();
 assert.match(core.requestIssue(form,{billVOList:[],reimbData:form}),/票据清单/);
 assert.equal(core.requestIssue(form,{billVOList:structuredClone(form.billVOList),reimbData:form}),'');
 assert.equal(core.requestIssue({...form,activitys:[]},{billVOList:[],reimbData:{...form,activitys:[]}}),'');
});
test('multipart receipts require their actual child hierarchy before a native request',()=>{
 const form=draft(),group={barcode:'T-group',dataType:'5',subBillCards:[{barcode:'child-A',dataId:'a'}]};
 const input={billVOList:[{barcode:'T-group',dataType:'5'}],reimbData:form};
 assert.match(core.requestIssue(form,input),/子票/);
 input.billVOList=[group];assert.equal(core.requestIssue(form,input),'');
 assert.equal(input.billVOList[0],group);
});
test('the request guard rejects an empty save before calling the native backend',async()=>{
 const f=bridgeFixture();
 const response=await f.http.post('/reimburse-service/api/v1/reimbursement/save',{id:'draft-a',billVOList:[],reimbData:structuredClone(f.form)});
 assert.equal(response.success,false);assert.equal(response.code,'ENHANCER_TICKETS_NOT_READY');
 assert.equal(f.form.billVOList.length,2);assert.equal(f.form.aiFlag,undefined);
});
test('receipt checks stay within the current draft and respect the optimization setting',async()=>{
 const f=bridgeFixture(),payload={id:'other',billVOList:[],reimbData:structuredClone(f.form)};
 assert.equal((await f.http.post('/reimburse-service/api/v1/reimbursement/commit',payload)).success,true);
 payload.id='draft-a';f.environment.enabled=()=>false;
 assert.equal((await f.http.post('/reimburse-service/api/v1/reimbursement/save',payload)).success,true);
});

test('expense preflight blocks native submission while preserving incomplete draft saves and generation',async()=>{
 const f=bridgeFixture();f.form.formId='c3771358d145490f9e363790c0519fde';
 f.form.activitys=[{activityMetaName:'常规差旅',behaviors:[{behaviorMetaName:'城市间交通费',behaviorDetail:[{BSX070306:1296,BSX0709:[]}]}]}];
 const payload={id:'draft-a',billVOList:structuredClone(f.form.billVOList),reimbData:structuredClone(f.form)},before=structuredClone(payload);
 const result=await f.http.post('/reimburse-service/api/v1/reimbursement/commit',payload);
 assert.equal(result.code,'ENHANCER_EXPENSES_NOT_READY');assert.match(result.message,/未关联有效发票/);assert.deepEqual(payload,before);
 for(const action of ['save','ai','ai-again'])assert.equal((await f.http.post('/reimburse-service/api/v1/reimbursement/'+action,payload)).success,true);
 assert.equal((await f.http.post('/reimburse-service/api/v1/reimbursement/commit',{id:'draft-a'})).code,'ENHANCER_EXPENSES_NOT_READY');
 f.environment.enabled=()=>false;assert.equal((await f.http.post('/reimburse-service/api/v1/reimbursement/commit',payload)).success,true);
});

test('checking a draft distinguishes unsaved page issues from saved backend issues',async()=>{
 const f=bridgeFixture();f.form.formId='c3771358d145490f9e363790c0519fde';
 const saved=structuredClone(f.form);saved.activitys=[];
 f.environment.readDraft=async id=>({success:true,data:{id,state:2,reimbData:saved}});
 f.form.activitys=[{behaviors:[{behaviorMetaName:'改签、退票费',behaviorDetail:[{BSX070306:2}]}]}];
 const result=await f.send('server-status');assert.deepEqual(result.report.detailIssues,[]);assert.equal(result.report.currentDetailIssues[0].code,'invoice-missing');assert.equal(f.calls.length,0);
});

test('report totals count native blank placeholder rows as zero without hiding invalid amounts',()=>{
 const f=draft();f.activitys[0].behaviors[0].behaviorDetail.push({BSX070306:' '},{});
 const response={success:true,data:{id:'draft-a',totalAmount:'103.90',reimbData:f}};
 assert.equal(core.serverReport(response,null).expenseTotal,10390);
 f.activitys[0].behaviors[0].behaviorDetail[1].BSX070306='invalid';assert.equal(core.serverReport(response,null).expenseTotal,null);
});
test('incomplete multipart tickets stop save, submission and both generation endpoints without changing the source',async()=>{
 const f=bridgeFixture(),payload={id:'draft-a',billVOList:[{barcode:'group',dataType:5,subBillCards:[]}],reimbData:structuredClone(f.form)},before=structuredClone(payload);
 for(const action of ['save','commit','ai','ai-again'])assert.equal((await f.http.post('/reimburse-service/api/v1/reimbursement/'+action,payload)).code,'ENHANCER_TICKETS_NOT_READY');
 assert.deepEqual(payload,before);
});
test('compatibility calls only the original regeneration handler with cloned form, never save or submit',async()=>{
 const f=bridgeFixture(),snapshot=core.capture(f.form,'g|u');const result=await f.send('run',{snapshot});assert.equal(result.ok,true);
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].btnEvent.event,'4');assert.notEqual(f.calls[0].form,f.form);assert.equal(f.form.aiFlag,undefined);
 assert.equal((await f.send('submit')).ok,false);assert.equal(f.calls.length,1);
 const status=await f.send('status');assert.equal(status.id,'status');assert.equal(status.draftId,'draft-a');
});
test('concurrent runs, changed invoices and active native dialogs cannot overwrite the checked form',async()=>{
 const f=bridgeFixture(),snapshot=core.capture(f.form,'g|u');let finish;f.native.setupState.onClickBtn=()=>new Promise(r=>finish=r);
 const run=f.send('run',{snapshot});assert.equal((await f.send('run',{snapshot})).ok,false);assert.equal((await f.send('restore',{snapshot})).ok,false);finish();await run;
 f.native.setupState.commitBillVisible=true;assert.equal((await f.send('restore',{snapshot})).ok,false);f.native.setupState.commitBillVisible=false;
 f.form.billVOList.pop();assert.equal((await f.send('run',{snapshot})).ok,false);
});
test('recovery waits for a real server-provided completion flag instead of creating one',async()=>{
 const f=bridgeFixture(),snapshot=core.capture(f.form,'g|u');f.form.totalAmount='10261';
 assert.equal((await f.send('restore',{snapshot})).ok,false);assert.equal(f.form.totalAmount,'10261');assert.equal(f.form.aiFlag,undefined);
 f.form.aiFlag='true';assert.equal((await f.send('restore',{snapshot})).ok,true);assert.equal(f.form.totalAmount,'8753.80');assert.equal(f.form.aiFlag,'true');
});
test('native failure remains a failure even when its backend sets aiFlag to true',async()=>{
 const f=bridgeFixture(),snapshot=core.capture(f.form,'g|u'),post=async()=>({success:false,message:'issueDate 日期不能为空'});f.http.post=post;
 const native=f.native.setupState.onClickBtn;f.native.setupState.onClickBtn=async event=>{await native(event);f.form.aiFlag='true'};
 const response=await f.send('run',{snapshot});assert.equal(response.ok,false);assert.match(response.error,/issueDate/);const status=await f.send('status');assert.equal(status.aiComplete,false);assert.equal(status.fillRecorded,true);assert.equal(status.canGenerate,false);assert.equal(status.generationStatus,'failed');assert.equal(f.http.post,post);assert.equal((await f.send('finish',{snapshot})).ok,false);
});
test('native preflight distinguishes a missing transport-row date from a valid invoice header date',()=>{
 const form=draft(),bill={barcode:'A',issueDate:'20261014',billData:{issueDate:'20261014',details:[{amount:'106.58'}],air:[{transportation:'飞机',taxAmount:'6.40'},{transportation:'飞机',issueDate:'20260723'}]}};
 const before=structuredClone(bill),issues=core.generationIssues(form,[bill]);assert.equal(issues.length,1);assert.equal(issues[0].index,0);assert.deepEqual(bill,before);
 assert.equal(core.generationIssues(form,[{...bill,barcode:'unselected'}]).length,0);bill.billData.air[0].issueDate='20260723';assert.equal(core.generationIssues(form,[bill]).length,0);
});
function workerFixture(){
 let listener,removed,rules;const timers=new Map(),store={},session={},chrome={runtime:{onMessage:{addListener:f=>listener=f}},storage:{local:{get:async defaults=>({...defaults,...store}),set:async data=>Object.assign(store,data)},session:{get:async key=>({[key]:session[key]}),set:async data=>Object.assign(session,data),remove:async key=>{delete session[key]}}},declarativeNetRequest:{updateSessionRules:async r=>{rules=r}},tabs:{onRemoved:{addListener:f=>removed=f}}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../extension/background.js','utf8'),{chrome,ReimbursementFillCompatCore:core,URL,URLSearchParams,crypto:{randomUUID:()=> 'lease-token'},setTimeout:(f)=>{const id=timers.size+1;timers.set(id,f);return id},clearTimeout:id=>timers.delete(id)});
 const sender=id=>({tab:{id},frameId:0,url:'http://wsbx.wbu.edu.cn/workbench-web/#/reimbursementCreate?formEditId=draft-a'});
 let currentUrl=sender(42).url;
 chrome.tabs.get=async id=>({id,url:currentUrl});
 return {store,session,timers,get rules(){return rules},call:(message,tab=42,url,tabUrl)=>{currentUrl=tabUrl||url||sender(tab).url;return new Promise(resolve=>listener(message,{...sender(tab),...(url?{url}: {})},resolve))},remove:removed};
}
test('backup follows the live tab route after SPA navigation while rejecting an old draft',async()=>{
 const f=workerFixture(),snapshot=core.capture(draft(),'g|u');
 const oldDocument='http://wsbx.wbu.edu.cn/workbench-web/#/reimbursementList';
 const currentDraft='http://wsbx.wbu.edu.cn/workbench-web/#/reimbursementCreate?formEditId=draft-a';
 assert.equal((await f.call({type:'fill-backup-save',snapshot},42,oldDocument,currentDraft)).ok,true);
 assert.equal((await f.call({type:'fill-guard-begin',scope:'g|u',id:'draft-a'},42,oldDocument,currentDraft)).ok,true);
 await f.call({type:'fill-guard-end',lease:'lease-token'},42,oldDocument,currentDraft);
 const another='http://wsbx.wbu.edu.cn/workbench-web/#/reimbursementCreate?formEditId=another';
 assert.equal((await f.call({type:'fill-guard-begin',scope:'g|u',id:'draft-a'},42,currentDraft,another)).ok,false);
});
test('native fill exception requires persisted matching backup, stays in its tab and restores the original guard',async()=>{
 const f=workerFixture(),message={type:'fill-guard-begin',scope:'g|u',id:'draft-a'};
 assert.equal((await f.call(message)).ok,false);
 assert.equal((await f.call({type:'fill-backup-save',snapshot:core.capture(draft(),'g|u')})).ok,true);
 const lease=await f.call(message);assert.equal(lease.ok,true);assert.equal(f.rules.addRules.length,0);
 await f.call({type:'configure-guard'},43);assert.equal(f.rules.addRules.length,1);assert.equal(f.rules.addRules[0].id,43);
 assert.equal((await f.call({type:'fill-guard-end',lease:'wrong'})).ok,false);
 await f.call({type:'fill-guard-end',lease:lease.lease});assert.equal(f.rules.addRules.length,1);assert.equal(f.rules.addRules[0].id,42);
 assert.equal(f.timers.size,0);
});
test('backup cannot be silently replaced and a generation exception expires without changing the user setting',async()=>{
 const f=workerFixture(),snapshot=core.capture(draft(),'g|u');await f.call({type:'fill-backup-save',snapshot});
 const changed=structuredClone(snapshot);changed.data.totalAmount='10000';const saved=await f.call({type:'fill-backup-save',snapshot:changed});assert.equal(saved.existing,true);assert.equal(saved.reused,false);
 const old=await f.call({type:'fill-backup-get',scope:'g|u',id:'draft-a'});assert.equal(old.snapshot.data.totalAmount,'8753.80');
 assert.equal((await f.call({type:'fill-guard-begin',scope:'another',id:'draft-a'})).ok,false);
 await f.call({type:'fill-guard-begin',scope:'g|u',id:'draft-a'});f.timers.values().next().value();await new Promise(setImmediate);assert.equal(f.rules.addRules.length,1);assert.equal(f.store.aiGuard,undefined);
 assert.equal((await f.call({type:'fill-backup-get',scope:'g|u',id:'other'})).ok,false);
});
test('persisted tab exception expires or closes on draft navigation even after worker memory is lost',async()=>{
 const f=workerFixture();f.session['fillCompatLease:42']={token:'persisted',id:'draft-a',scope:'g|u',until:Date.now()+10000};
 await f.call({type:'configure-guard'});assert.equal(f.rules.addRules.length,0);
 await f.call({type:'configure-guard'},42,'http://wsbx.wbu.edu.cn/workbench-web/#/reimbursementCreate?formEditId=old-draft');assert.equal(f.rules.addRules.length,1);assert.equal(f.session['fillCompatLease:42'],undefined);
 f.session['fillCompatLease:42']={token:'expired',id:'draft-a',until:Date.now()-1};await f.call({type:'configure-guard'});assert.equal(f.rules.addRules.length,1);
});
test('generation outcome is persisted separately from the server flag and is not overwritten by a reused backup',async()=>{
 const f=workerFixture(),snapshot=core.capture(draft(),'g|u');await f.call({type:'fill-backup-save',snapshot});
 await f.call({type:'fill-backup-mark-result',scope:'g|u',id:'draft-a',success:false,message:'issueDate missing'});
 await f.call({type:'fill-backup-save',snapshot});let result=await f.call({type:'fill-backup-get',scope:'g|u',id:'draft-a'});assert.equal(result.snapshot.generationOutcome.success,false);
 await f.call({type:'fill-backup-mark-result',scope:'g|u',id:'draft-a',success:true});result=await f.call({type:'fill-backup-get',scope:'g|u',id:'draft-a'});assert.equal(result.snapshot.generationOutcome.success,true);
 assert.equal((await f.call({type:'fill-backup-mark-result',scope:'other',id:'draft-a',success:true})).ok,false);
});

function uiFixture(failAt,backend={}){
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<main></main>',{url:'http://wsbx.wbu.edu.cn/workbench-web/#/reimbursementCreate?formEditId=draft-a',runScripts:'outside-only'}),w=dom.window,trace=[],notices=[];
 const snapshot=core.capture(draft(),'g|u');
 w.chrome={runtime:{sendMessage:async message=>{trace.push(message.type);if(message.type===failAt)return {ok:false};if(message.type==='fill-backup-get')return {ok:true};if(message.type==='fill-guard-begin')return {ok:true,lease:'token'};return {ok:true}}}};
 w.postMessage=message=>{
  trace.push(message.action);
  const result={type:'reimbursement-fill-reply',id:message.id,ok:message.action!==failAt,error:'模拟失败',eligible:true,available:true,scope:'g|u',draftId:'draft-a'};
  // Reply correlation id is distinct from the reimbursement identifier.
  if(message.action==='capture')result.snapshot=snapshot;
  if(message.action==='server-status')result.report={draftId:'draft-a',state:2,fillRecorded:false,total:875380,expenseTotal:875380,receiptTotal:875380,printTotal:null,issues:[],...backend};
  queueMicrotask(()=>w.dispatchEvent(new w.MessageEvent('message',{source:w,origin:w.location.origin,data:result})));
 };
 w.eval(fs.readFileSync(__dirname+'/../extension/fill-compat-ui.js','utf8'));
 const node=(tag,text)=>{const n=w.document.createElement(tag);n.textContent=text||'';return n},button=(text,fn)=>{const n=node('button',text);n.onclick=fn;return n};
 const ui=w.ReimbursementFillCompatUI.mount({container:w.document.querySelector('main'),node,button,notify:t=>notices.push(t)});
 return {w,trace,notices,ui,async start(){await ui.load();w.document.querySelector('button').click();for(let i=0;i<8;i++)await new Promise(setImmediate)}};
}
test('failed backup prevents native fill and guard exception',async()=>{
 const f=uiFixture('fill-backup-save');await f.start();assert.equal(f.trace.includes('run'),false);assert.equal(f.trace.includes('fill-guard-begin'),false);assert.match(f.notices[0],/备份保存失败/);f.w.close();
});
test('failed native workflow releases its guard exception and never automatically saves or submits',async()=>{
 const f=uiFixture('run');await f.start();
 assert.ok(f.trace.indexOf('fill-backup-save')<f.trace.indexOf('fill-guard-begin'));assert.ok(f.trace.indexOf('fill-guard-begin')<f.trace.indexOf('run'));assert.ok(f.trace.indexOf('fill-guard-end')>f.trace.indexOf('run'));
 assert.equal(f.trace.some(t=>/submit|commit|^save$/.test(t)),false);f.w.close();
});
test('server-recorded fill never reruns AI or restores and saves after a previous failed generation',async()=>{
 const f=uiFixture(undefined,{fillRecorded:true});await f.start();
 assert.ok(f.trace.includes('server-status'));for(const action of ['capture','run','finish','restore','fill-guard-begin','fill-backup-save'])assert.equal(f.trace.includes(action),false,action);
 assert.match(f.notices[0],/不重复运行 AI/);f.w.close();
});
test('an already submitted backend report produces a read-only result even if the local form is stale and editable',async()=>{
 const f=uiFixture(undefined,{state:9,stateName:'待审批',submitted:true,fillRecorded:true,auditKnown:true,violations:0,warnings:7,printTotal:0,issues:['打印报销单金额与后台总额不一致']});await f.start();
 assert.match(f.w.document.body.textContent,/待审批/);assert.match(f.w.document.body.textContent,/0 条违规，7 条提醒/);assert.match(f.w.document.body.textContent,/打印报销单金额与后台总额不一致/);
 for(const action of ['capture','run','finish','restore','fill-guard-begin'])assert.equal(f.trace.includes(action),false);f.w.close();
});

test('check report renders current and saved detail issues separately with actionable row labels',async()=>{
 const f=uiFixture(undefined,{currentDetailIssues:[{code:'invoice-missing',message:'常规差旅 / 城市间交通费 / 第1行：未关联有效发票'}],detailIssues:[]});
 await f.ui.load();f.w.document.querySelectorAll('button')[3].click();for(let i=0;i<8;i++)await new Promise(setImmediate);
 const text=f.w.document.body.textContent;
 assert.match(text,/当前页面明细预检（含未保存修改）：1 项待核对/);assert.match(text,/后台已保存明细预检：未发现已知问题/);assert.match(text,/城市间交通费 \/ 第1行：未关联有效发票/);assert.equal(f.trace.includes('capture'),false);f.w.close();
});
test('submitted form checks are read-only, and navigating to the list blocks stale-form mutations',async()=>{
 const f=bridgeFixture();f.form.state=9;f.form.aiFlag='true';const original=structuredClone(f.form),result=await f.send('server-status');assert.equal(result.ok,true);assert.equal(result.report.state,9);assert.equal(result.report.fillRecorded,true);assert.equal(result.report.auditKnown,false);assert.deepEqual(f.form,original);assert.equal(f.calls.length,0);
 f.form.state=2;f.location.hash='#/reimbursementList';assert.equal((await f.send('status')).eligible,false);assert.equal((await f.send('capture')).ok,false);assert.equal((await f.send('server-status')).ok,false);
});
test('backend submission blocks generation and recovery even while the local form still looks editable',async()=>{
 const f=bridgeFixture(),snapshot=core.capture(f.form,'g|u'),original=structuredClone(f.form);f.environment.readDraft=async id=>({success:true,data:{id,state:9,totalAmount:f.form.totalAmount,reimbData:{...structuredClone(f.form),aiFlag:'true'}}});
 assert.equal((await f.send('run',{snapshot})).ok,false);assert.equal((await f.send('restore',{snapshot})).ok,false);assert.equal((await f.send('finish',{snapshot})).ok,false);assert.equal(f.calls.length,0);assert.deepEqual(f.form,original);
});
test('edits made during the backend status query stop generation before any overwrite',async()=>{
 const f=bridgeFixture(),snapshot=core.capture(f.form,'g|u');let finish;f.environment.readDraft=()=>new Promise(resolve=>finish=resolve);
 const run=f.send('run',{snapshot});f.form.totalAmount='9000.00';finish({success:true,data:{id:'draft-a',state:2,totalAmount:'8753.80',reimbData:draft()}});
 const response=await run;assert.equal(response.ok,false);assert.match(response.error,/内容已变化/);assert.equal(f.calls.length,0);assert.equal(f.form.totalAmount,'9000.00');
});
test('workflow state keeps generation failure, recorded initialization and submission independent',()=>{
 const f={...draft(),aiFlag:'true'};let result=core.workflowStatus(f,{success:false});assert.equal(result.fillRecorded,true);assert.equal(result.generationStatus,'failed');assert.equal(result.canGenerate,false);assert.equal(result.submitted,false);
 f.state=9;result=core.workflowStatus(f,{success:false});assert.equal(result.submitted,true);assert.equal(result.generationStatus,'failed');assert.equal(core.eligible(f),false);
});
test('post-submission report catches a zero printed voucher without mislabeling warnings as approval',()=>{
 const f=draft();f.aiFlag='true';f.totalAmount='103.90';f.receivableInfo=[{actualReceivableCurrency:'103.90'}];
 const response={success:true,data:{id:'draft-a',state:9,stateName:'待审批',totalAmount:'103.90',reimbData:f}},audit={success:true,data:{violationList:[],warningList:Array(7).fill({})}};
 const result=core.serverReport(response,audit,core.printAmount('合计人民币(大写) 人民币零 (小写) ￥ 0.00'));
 assert.equal(result.total,10390);assert.equal(result.expenseTotal,10390);assert.equal(result.receiptTotal,10390);assert.equal(result.printTotal,0);assert.equal(result.violations,0);assert.equal(result.warnings,7);assert.deepEqual(result.issues,['打印报销单金额与后台总额不一致']);
 assert.equal(core.printAmount('还在加载'),null);assert.equal(core.serverReport(response,{success:true,data:null}).auditKnown,false);assert.equal(core.serverReport(response,audit,null).issues.length,0);
 assert.throws(()=>core.serverReport({success:false,data:null},audit));
});
test('printed total is read only from the report preview with the matching reimbursement number',async()=>{
 const f=bridgeFixture();f.form.state=9;f.form.reimbursementNo='R001';
 const page=text=>({querySelectorAll:s=>s==='.textLayer'?[{textContent:text}]:[]});
 const frame=(src,text)=>({src,contentDocument:page(text)});
 const frames=[frame('http://wsbx.wbu.edu.cn/bill-wallet-web/#/bill/file','R001（小写）￥999.00'),frame('http://wsbx.wbu.edu.cn/bill-wallet-web/pdf/web/viewer.html?file=other','R002（小写）￥999.00')];
 f.document.querySelectorAll=()=>frames;assert.equal((await f.send('server-status')).report.printTotal,null);
 frames.push(frame('http://wsbx.wbu.edu.cn/bill-wallet-web/pdf/web/viewer.html?file=report','报销单号：R001（小写）￥0.00'));
 assert.equal((await f.send('server-status')).report.printTotal,0);assert.equal(f.calls.length,0);
});
test('one-click workflow backs up, completes native fill, restores exact checked amounts and requests save without submitting',async()=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<main></main>',{url:'http://wsbx.wbu.edu.cn/workbench-web/#/reimbursementCreate?formEditId=draft-a',runScripts:'outside-only'}),w=dom.window,form=draft(),trace=[];let saved;
 w.localStorage.setItem('userInfo',JSON.stringify({id:'u',groupId:'g'}));w.ReimbursementFillCompatCore=core;
 w.chrome={runtime:{sendMessage:async message=>{trace.push(message.type);if(message.type==='fill-backup-save'){saved=structuredClone(message.snapshot);return {ok:true}}if(message.type==='fill-backup-get')return {ok:true,snapshot:saved};if(message.type==='fill-guard-begin')return {ok:true,lease:'once'};return {ok:true}}}};
 w.postMessage=data=>queueMicrotask(()=>w.dispatchEvent(new w.MessageEvent('message',{data,source:w,origin:w.location.origin})));
 w.eval(fs.readFileSync(__dirname+'/../extension/fill-compat.js','utf8'));w.eval(fs.readFileSync(__dirname+'/../extension/fill-compat-ui.js','utf8'));
 const http={post:async()=>({success:true,data:{}})};w.ReimbursementFillCompat.bind({form:()=>form,http,readDraft:async id=>({success:true,data:{id,state:form.state,totalAmount:form.totalAmount,reimbData:structuredClone(form)}}),readAudit:async()=>({success:true,data:null})});w.ReimbursementFillCompat.register({setupState:{formConfig:{},controlsList:[],onClickBtn:async event=>{trace.push(event.btnEvent.event);if(event.btnEvent.event==='4'){await http.post('/reimburse-service/api/v1/reimbursement/ai-again',{id:'draft-a'});form.aiFlag='true';form.totalAmount='10261';form.activitys=[]}else if(event.btnEvent.event==='1'){assert.equal(event.form.totalAmount,'8753.80');assert.equal(event.form.aiFlag,'true')}}}});
 const node=(tag,text)=>{const n=w.document.createElement(tag);n.textContent=text||'';return n},button=(text,fn)=>{const n=node('button',text);n.onclick=fn;return n};
 const ui=w.ReimbursementFillCompatUI.mount({container:w.document.querySelector('main'),node,button,notify:()=>{}});await ui.load();
 w.document.querySelectorAll('button')[0].click();for(let i=0;i<8;i++)await new Promise(setImmediate);
 assert.equal(saved.data.totalAmount,'8753.80');assert.ok(trace.includes('4'));assert.ok(trace.includes('1'));assert.ok(trace.includes('fill-guard-end'));
 assert.equal(form.totalAmount,'8753.80');assert.equal(form.aiFlag,'true');assert.equal(form.receivableInfo[1].actualReceivableCurrency,'8033.80');assert.equal(form.activitys[0].behaviors[0].behaviorDetail[0].billRelation[0].BSX070804,'103.90');
 assert.equal(trace.includes('5'),false);assert.equal(trace.includes('6'),false);w.close();
});
