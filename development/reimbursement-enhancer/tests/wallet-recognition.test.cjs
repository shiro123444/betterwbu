const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('../extension/wallet-recognition-core.js');
const upload={id:'task-a',barcode:'T-a',fileName:'测试行程单.pdf',billType:'unident',createTs:'invalid'};
test('recognition delay is explicit and disappearing tasks never imply success',()=>{
 const t=core.create();assert.equal(t.observe([upload],'folder-a',0)[0].phase,'processing');assert.equal(t.observe([upload],'folder-a',120000)[0].phase,'delayed');const r=t.observe([],'folder-a',125000)[0];assert.equal(r.phase,'unconfirmed');assert.equal(r.present,false);assert.match(r.reason,/未返回/);assert.equal(t.clearTerminal().length,0);
});
test('only a matching native invoice can complete recognition or mark a repeat',()=>{
 const t=core.create();t.observe([upload],'a',0);assert.equal(t.observe([{id:'other',ticketCode:'1-033'}],'a',10)[0].phase,'unconfirmed');assert.equal(t.observe([{subBillCards:[{id:'bill',parentBarcode:'T-a',ticketCode:'1-033'}]}],'a',20)[0].phase,'recognized');assert.equal(t.observe([{id:'bill',parentBarcode:'T-a',ticketCode:'1-033',isHasRepeat:'1'}],'a',30)[0].phase,'duplicate');
});
test('filters and pagination cannot turn a hidden pending task into a successful result',()=>{
 const t=core.create();t.observe([upload],'page1',0);assert.equal(t.observe([],'page2',100).length,0);assert.equal(t.observe([upload],'page1',200)[0].phase,'processing');assert.equal(t.clearTerminal().length,1);
});
test('query cadence, errors and task limits are bounded',()=>{
 const t=core.create({limit:2});t.observe([upload],'a',0);assert.equal(t.needsQuery(0),true);t.queried(0);assert.equal(t.needsQuery(29999),false);assert.equal(t.needsQuery(30000,false),false);assert.equal(t.needsQuery(30000),true);assert.match(t.failed('查询失败')[0].reason,/查询失败/);assert.equal(t.snapshot()[0].phase,'processing');assert.equal(t.observe([upload,{...upload,id:'b',barcode:'T-b'},{...upload,id:'c',barcode:'T-c'}],'a',1).length,2);
});
test('a failed query that wipes native rows does not imply that the pending task ended',()=>{
 const t=core.create();t.observe([upload],'a',0);t.failed('查询失败');let r=t.observe([],'a',130000)[0];assert.equal(r.present,true);assert.equal(r.phase,'delayed');t.queried(140000);assert.match(t.observe([],'a',140001)[0].reason,/查询失败/);t.succeeded();r=t.observe([],'a',140002)[0];assert.equal(r.phase,'unconfirmed');assert.equal(r.present,false);
});
function fixture(hash='#/bill/file'){
 let now=0,calls=0;const pending=[],posted=[],events={},timers=new Map();let serial=0;
 const native={$el:{isConnected:true},sourceData:[{...upload}],condition:{folderId:'a'},page:{currentPage:1},checkedValues:[],allUploadFiles:[],uploadFileList:[],spinning:false,loading:false,$children:[],$nextTick:async()=>{},getInfo(){this.spinning=true;this.$http({url:'/bill-wallet/bill/manage/findBillFolderCardList.json',method:'post',data:{condition:this.condition,page:this.page}}).then(r=>{this.spinning=false;this.sourceData=[...r.data.unIdentInstanceVOList,...r.data.billCardList]}).catch(()=>{this.spinning=false;this.sourceData=[]})}};
 const http=config=>{calls++;assert.equal(config.url,'/bill-wallet/bill/manage/findBillFolderCardList.json');return new Promise((resolve,reject)=>pending.push({resolve,reject,config}))};Object.setPrototypeOf(native,Object.defineProperty({},'$http',{get:()=>http}));
 const window={ReimbursementRecognitionCore:core,addEventListener:(k,f)=>events[k]=f,postMessage:d=>posted.push(d)};const location={hash,origin:'http://test'},document={documentElement:{},visibilityState:'visible',querySelector:()=>({__vue__:native})};
 class Clock extends Date{static now(){return now}}
 vm.runInNewContext(fs.readFileSync(__dirname+'/../extension/wallet-recognition.js','utf8'),{window,location,document,Date:Clock,MutationObserver:class{observe(){}},setInterval(){return 1},clearInterval(){},setTimeout:f=>{timers.set(++serial,f);return serial},clearTimeout:id=>timers.delete(id)});
 return {native,location,document,window,events,posted,pending,timers,api:window.ReimbursementRecognitionMonitor,get calls(){return calls},setTime:n=>now=n,reply(rows=[]){pending.shift().resolve({success:true,data:{unIdentInstanceVOList:[],billCardList:rows}})}};
}
test('adapter awaits the actual read request even when native getInfo returns undefined',async()=>{
 const f=fixture(),p=f.api.refresh(true);assert.equal(f.calls,1);assert.equal(Object.hasOwn(f.native,'$http'),false);f.reply([{id:'invoice-a',parentBarcode:'T-a',ticketCode:'1-033'}]);await p;assert.equal(f.posted.at(-1).rows[0].phase,'recognized');assert.equal(f.posted.at(-1).canRefresh,true);assert.equal(f.timers.size,0);
});
test('selected rows, active uploads, editing, hidden pages and picker routes never get polled',async()=>{
 for(const mode of ['selection','upload','queued-upload','edit','hidden','picker','disabled']){const f=fixture(mode==='picker'?'#/bill/list':'#/bill/file');if(mode==='selection')f.native.checkedValues=['saved-choice'];if(mode==='upload')f.native.allUploadFiles=[{active:true}];if(mode==='queued-upload')f.native.allUploadFiles=[{active:false,success:false,error:''}];if(mode==='edit')f.native.isEdit=true;if(mode==='hidden')f.document.visibilityState='hidden';if(mode==='disabled')f.events.message({source:f.window,origin:'http://test',data:{type:'reimbursement-wallet-settings',enabled:false}});await f.api.refresh(true);assert.equal(f.calls,0,mode);assert.deepEqual(f.native.checkedValues,mode==='selection'?['saved-choice']:[])}
});
test('an empty successful reply is unconfirmed; network failure is reported and retryable',async()=>{
 const f=fixture(),p=f.api.refresh(true);f.reply();await p;assert.equal(f.posted.at(-1).rows[0].phase,'unconfirmed');const g=fixture(),q=g.api.refresh(true);g.pending.shift().reject(Error('network'));await q;assert.match(g.posted.at(-1).rows[0].reason,/查询失败/);assert.equal(g.posted.at(-1).canRefresh,true);
});
test('responses arriving after navigation cannot show an old result in the new route',async()=>{
 const f=fixture(),p=f.api.refresh(true);f.location.hash='#/bill/detail';f.events.hashchange();f.reply([{id:'invoice-a',parentBarcode:'T-a',ticketCode:'1-033'}]);await p;assert.equal(f.posted.at(-1).rows.length,0);
});
test('a stalled list query has a finite timeout and never reports success',async()=>{
 const f=fixture(),p=f.api.refresh(true);[...f.timers.values()][0]();await p;assert.match(f.posted.at(-1).rows[0].reason,/查询失败/);assert.notEqual(f.posted.at(-1).rows[0].phase,'recognized');f.reply();await new Promise(setImmediate);
});
test('API-derived defaults do not discard the pending task or mask an empty reply',async()=>{
 const f=fixture(),p=f.api.refresh(true);Object.assign(f.native.condition,{isShowAll:'1',origin:0,bizFlag:'0'});f.native.page.totalRecord=0;f.reply();await p;assert.equal(f.posted.at(-1).rows[0].phase,'unconfirmed');
});
test('concurrent clicks and unexpected native requests cannot execute another operation',async()=>{
 const f=fixture(),p=f.api.refresh(true);await f.api.refresh(true);assert.equal(f.calls,1);f.reply();await p;const g=fixture();g.native.getInfo=function(){return this.$http({url:'/bill-wallet/bill/manage/delete.json',method:'post'})};await g.api.refresh(true);assert.equal(g.calls,0);assert.equal(Object.hasOwn(g.native,'$http'),false);assert.match(g.posted.at(-1).rows[0].reason,/查询失败/);
});
