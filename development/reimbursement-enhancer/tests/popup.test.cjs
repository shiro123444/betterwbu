const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../extension/popup.js','utf8');
const settle=()=>new Promise(setImmediate);
function setup(options={}){
 const elements=Object.fromEntries(['open','retry','status','version'].map(id=>[id,{disabled:false,textContent:'',addEventListener(type,fn){this[type]=fn}}]));
 const messages=[],timers=new Map();let closed=0,nextTimer=0;
 const chrome={runtime:{getManifest:()=>({version:'0.11.5'})},tabs:{
  query:async()=>[{id:9,url:'http://wsbx.wbu.edu.cn/workbench-web/#/reimbursement'}],
  sendMessage:async(id,message,opts)=>{messages.push({id,message,opts});return message.type==='info-manager-status'?{version:'0.11.5',ready:true}:{ok:true}},
  ...options
 }};
 vm.runInNewContext(source,{document:{getElementById:id=>elements[id]},chrome,window:{ReimbursementSite:require("../extension/site.js"),close(){closed++}},setTimeout(fn){timers.set(++nextTimer,fn);return nextTimer},clearTimeout(id){timers.delete(id)}});
 return {elements,messages,timers,chrome,closed:()=>closed};
}
test('popup checks the top-level workbench without opening it, and closes only after a successful explicit open',async()=>{
 const p=setup();await settle();assert.match(p.elements.version.textContent,/0\.11\.5/);assert.match(p.elements.status.textContent,/信息管理可用/);assert.equal(p.elements.open.disabled,false);assert.equal(p.closed(),0);
 assert.equal(p.messages.length,1);assert.equal(p.messages[0].opts.frameId,0);
 await p.elements.open.click();assert.equal(p.messages.at(-1).message.type,'open-info-manager');assert.equal(p.closed(),1);assert.equal(p.timers.size,0);
});
test('popup refuses unsupported sites, missing pages, mismatched versions and incomplete initialization',async()=>{
 const cases=[
  {options:{query:async()=>[{id:9,url:'https://example.com/workbench-web/'}]},text:/请先打开报销工作台/},
  {options:{query:async()=>[]},text:/请先打开报销工作台/},
  {options:{sendMessage:async()=>({version:'0.11.1',ready:true})},text:/版本与插件不一致/},
  {options:{sendMessage:async()=>undefined},text:/版本与插件不一致/},
  {options:{sendMessage:async()=>({version:'0.11.5',ready:false})},text:/尚未初始化完成/}
 ];
 for(const row of cases){const p=setup(row.options);await settle();assert.match(p.elements.status.textContent,row.text);assert.equal(p.elements.open.disabled,true);assert.equal(p.elements.retry.disabled,false);assert.equal(p.closed(),0);assert.ok(p.messages.every(m=>m.message.type==='info-manager-status'))}
});

test('popup reaches the top-level WebVPN workbench through its explicit port',async()=>{
 const p=setup({query:async()=>[{id:9,url:'http://wsbx-wbu-edu-cn.webvpn.wbu.edu.cn:8118/workbench-web/#/workbench'}]});
 await settle();assert.equal(p.elements.open.disabled,false);assert.equal(p.messages[0].opts.frameId,0);
 await p.elements.open.click();assert.equal(p.closed(),1);
});
test('query and connection errors restore retry, which can recover on a newly available page',async()=>{
 for(const failing of ['query','sendMessage']){
  const p=setup({[failing]:async()=>{throw new Error('disconnected')}});await settle();assert.match(p.elements.status.textContent,/无法连接/);assert.equal(p.elements.retry.disabled,false);assert.equal(p.elements.open.disabled,true);
  p.chrome.tabs.query=async()=>[{id:9,url:'https://wsbx.wbu.edu.cn/workbench-web/#/list'}];p.chrome.tabs.sendMessage=async()=>({version:'0.11.5',ready:true});
  await p.elements.retry.click();assert.match(p.elements.status.textContent,/信息管理可用/);assert.equal(p.elements.open.disabled,false);
 }
});
test('unresponsive pages time out and failed opens keep the popup available for recovery',async()=>{
 const p=setup({sendMessage:()=>new Promise(()=>{})});await settle();assert.equal(p.elements.retry.disabled,true);assert.equal(p.timers.size,1);
 [...p.timers.values()][0]();await settle();assert.match(p.elements.status.textContent,/无法连接/);assert.equal(p.elements.retry.disabled,false);
 const q=setup({sendMessage:async(id,message)=>message.type==='info-manager-status'?{version:'0.11.5',ready:true}:{ok:false}});await settle();await q.elements.open.click();assert.equal(q.closed(),0);assert.match(q.elements.status.textContent,/未能打开/);assert.equal(q.elements.retry.disabled,false);
});
test('information manager reports its injection-time version and safely refuses opens before the DOM is ready',()=>{
 let listener,version='0.11.5';const window={addEventListener(){}};
 const chrome={runtime:{getManifest:()=>({version}),onMessage:{addListener(fn){listener=fn}}},storage:{onChanged:{addListener(){}}}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../extension/memory-manager.js','utf8'),{window,chrome,document:{readyState:'loading',addEventListener(){}}});
 version='0.11.6';let reply;listener({type:'info-manager-status'},null,r=>reply=r);assert.equal(reply.version,'0.11.5');assert.equal(reply.ready,false);assert.deepEqual(Object.keys(reply).sort(),['ready','version']);
 listener({type:'open-info-manager'},null,r=>reply=r);assert.equal(reply.ok,false);
});
