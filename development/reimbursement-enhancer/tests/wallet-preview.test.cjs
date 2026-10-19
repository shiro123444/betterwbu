const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(origin='http://test',eventOrigin=origin){
 const messages=[],events={},raf=[];let mutate,resize;const list={nodeType:1,isConnected:true,offsetHeight:300},component={sourceData:[{id:'old'}],$refs:{fileList:list},$children:[]};
 const parent={postMessage:m=>messages.push(typeof m==='string'?JSON.parse(m):m)},window={ReimbursementSite:require("../extension/site.js"),parent,postMessage(){},addEventListener:(k,f)=>events[k]=f};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../extension/wallet-bridge.js','utf8'),{window,location:{origin,hash:'#/bill/listDetails'},document:{documentElement:{},querySelector:()=>({__vue__:component})},MutationObserver:class{constructor(f){mutate=f}observe(){}},ResizeObserver:class{constructor(f){resize=f}observe(){}disconnect(){}},requestAnimationFrame:f=>raf.push(f),setTimeout(){}});
 function drain(){while(raf.length)raf.shift()()};drain();messages.length=0;return {component,list,messages,drain,mutate:()=>{mutate();drain()},resize:()=>resize(),send(action='billDetails'){events.message({origin:eventOrigin,source:parent,data:JSON.stringify({action,data:[{id:'new'}]})})}};
}
test('old list resize cannot complete preview; same-height replacement can',()=>{
 const f=fixture();f.send();f.resize();f.drain();assert.deepEqual(f.messages.map(m=>m.phase||m.action),['preview-start']);f.component.sourceData=[{id:'new'}];f.mutate();assert.ok(f.messages.some(m=>m.action==='billHeight'&&m.value===300));assert.ok(f.messages.some(m=>m.action==='showIframe'&&m.value===true));assert.ok(f.messages.some(m=>m.phase==='ready'&&m.operation===1&&m.count===1));
});
test('empty replacement clears preview and reports completion once',()=>{
 const f=fixture();f.send();f.drain();f.component.sourceData=[];f.mutate();f.resize();assert.ok(f.messages.some(m=>m.action==='showIframe'&&m.value===false));assert.equal(f.messages.filter(m=>m.phase==='ready').length,1);assert.equal(f.messages.find(m=>m.phase==='ready').count,0);
});
test('async refresh waits for new data and positive height; each update has distinct ID',()=>{
 const f=fixture();f.send('billDetailsPost');f.drain();assert.ok(!f.messages.some(m=>m.phase==='ready'));f.component.sourceData=[{id:'new'}];f.list.offsetHeight=0;f.mutate();assert.ok(!f.messages.some(m=>m.phase==='ready'));f.list.offsetHeight=300;f.resize();assert.equal(f.messages.find(m=>m.phase==='ready').operation,1);f.send();f.drain();f.component.sourceData=[{id:'next'}];f.mutate();assert.deepEqual(f.messages.filter(m=>m.phase==='ready').map(m=>m.operation),[1,2]);
});

test('WebVPN wallet accepts the proxy-restored parent origin and completes the matching preview',()=>{
 const f=fixture('http://wsbx-wbu-edu-cn.webvpn.wbu.edu.cn:8118','http://wsbx.wbu.edu.cn');
 f.send();f.drain();assert.equal(f.messages[0].phase,'preview-start');f.component.sourceData=[{id:'new'}];f.mutate();
 assert.equal(f.messages.filter(m=>m.phase==='ready').length,1);
});
