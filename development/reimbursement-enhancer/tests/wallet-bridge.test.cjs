const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const flush=()=>new Promise(setImmediate);
function fixture({ownNonconfigurable=false,ownWritable=false,syncFailure=false}={}){
 const messages=[],requests=[],events={},timers=[],element={isConnected:true,getClientRects:()=>[{}]};let resolve,reject,renders=0;
 const http=function(config){requests.push(config);if(syncFailure)throw Error('sync HTTP failure');return new Promise((res,rej)=>{resolve=res;reject=rej})};
 const proto={};Object.defineProperty(proto,'$http',{get:()=>http,configurable:false});
 const picker=Object.assign(Object.create(proto),{$el:element,checkedValues:['a'],$children:[],$forceUpdate(){renders++},onSubmit(){return this.$http({url:'/bill-wallet/bill/manage/confirmSelectBills2.json',method:'post',data:{billDatas:['a']}}).then(r=>{if(r.success){this.checkedValues=[];this.sent=r.data}},()=>{this.failed=true})}});
 if(ownNonconfigurable)Object.defineProperty(picker,'$http',{get:()=>http,configurable:false});
 if(ownWritable)Object.defineProperty(picker,'$http',{value:http,configurable:true,writable:true,enumerable:true});
 const before=Object.getOwnPropertyDescriptor(picker,'$http');
 const window={parent:{postMessage:data=>messages.push(data)},postMessage:data=>messages.push(data),addEventListener:(k,f)=>events[k]=f};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../extension/wallet-bridge.js','utf8'),{window,document:{documentElement:{},querySelector:()=>({__vue__:picker})},location:{origin:'http://wsbx.wbu.edu.cn',hash:'#/bill/list'},MutationObserver:class{observe(){}},ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:f=>f(),setTimeout:f=>timers.push(f)});
 return {picker,messages,requests,before,http,proto,get renders(){return renders},resolve:r=>resolve(r),reject:e=>reject(e),timers,disable:()=>events.message({source:window,origin:'http://wsbx.wbu.edu.cn',data:{type:'reimbursement-wallet-settings',enabled:false}})};
}
test('native null-receiver confirmation works with inherited readonly HTTP and preserves payload/result',async()=>{
 const f=fixture();assert.equal(f.renders,1);
 // Exact call style used by the site's compiled Vue 2 button listener.
 f.picker.onSubmit.apply(null,[]);f.picker.onSubmit.apply(null,[]);assert.equal(f.requests.length,1);assert.equal(f.requests[0].data.billDatas[0],'a');
 assert.equal(Object.hasOwn(f.picker,'$http'),false);assert.equal(f.picker.$http,f.http);assert.equal(Object.getOwnPropertyDescriptor(f.proto,'$http').set,undefined);
 const response={success:true,data:[{barcode:'a'}]};f.resolve(response);await flush();assert.equal(f.picker.sent,response.data);assert.ok(f.messages.some(m=>m.phase==='confirming'));assert.ok(f.messages.some(m=>m.phase==='rendering'));
 f.timers.forEach(fn=>fn());assert.ok(f.messages.some(m=>m.phase==='picker-idle'&&m.count===0));
});
test('network failure clears the guard and allows native retry via null receiver',async()=>{
 const f=fixture();f.picker.onSubmit.call(null);f.reject(Error('network'));await flush();assert.equal(f.picker.failed,true);assert.ok(f.messages.some(m=>m.phase==='error'));f.picker.onSubmit.call(null);assert.equal(f.requests.length,2);
});
test('disabled enhancement retains the component receiver and native behavior without loading messages',()=>{
 const f=fixture();f.disable();f.picker.onSubmit.call(null);assert.equal(f.requests.length,1);assert.equal(f.messages.length,0);assert.equal(Object.hasOwn(f.picker,'$http'),false);
});
test('nonconfigurable own HTTP accessor falls back to native confirmation without locking the button',()=>{
 const f=fixture({ownNonconfigurable:true});f.picker.onSubmit.call(null);assert.equal(f.requests.length,1);assert.equal(f.messages.length,0);assert.deepEqual(Object.getOwnPropertyDescriptor(f.picker,'$http'),f.before);
});
test('own writable HTTP descriptor is restored exactly after observing the request',()=>{
 const f=fixture({ownWritable:true});f.picker.onSubmit.call(null);assert.equal(f.requests.length,1);assert.deepEqual(Object.getOwnPropertyDescriptor(f.picker,'$http'),f.before);
});
test('native business failure does not report rendering and permits retry after settlement',async()=>{
 const f=fixture();f.picker.onSubmit.call(null);f.resolve({success:false,message:'failed'});await flush();f.timers.forEach(fn=>fn());assert.ok(!f.messages.some(m=>m.phase==='rendering'));assert.ok(f.messages.some(m=>m.phase==='error'));f.picker.onSubmit.call(null);assert.equal(f.requests.length,2);
});
test('empty selections and destroyed components do not start confirmation',()=>{
 const f=fixture();f.picker.checkedValues=[];f.picker.onSubmit.call(null);assert.equal(f.requests.length,0);f.picker.checkedValues=['a'];f.picker._isDestroyed=true;f.picker.onSubmit.call(null);assert.equal(f.requests.length,0);
});
test('synchronous HTTP exceptions restore the client and leave failure feedback for retry',()=>{
 const f=fixture({syncFailure:true});assert.throws(()=>f.picker.onSubmit.call(null),/sync HTTP failure/);assert.equal(Object.hasOwn(f.picker,'$http'),false);assert.ok(f.messages.some(m=>m.phase==='error'));assert.ok(!f.messages.some(m=>m.phase==='idle'));assert.throws(()=>f.picker.onSubmit.call(null),/sync HTTP failure/);assert.equal(f.requests.length,2);
});
