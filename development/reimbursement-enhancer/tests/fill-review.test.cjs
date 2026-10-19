const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const bundle=fs.readFileSync(__dirname+'/../extension/workspace.js','utf8');
const fill=fs.readFileSync(__dirname+'/../extension/fill-compat-ui.js','utf8');
const settle=()=>new Promise(resolve=>setTimeout(resolve,90));
async function fixture(visual=true){
 const dom=new JSDOM('<!doctype html><aside class="ant-layout-sider"><div class="ant-layout-sider-children"><div class="menuBox"><img class="shrinkIcon"><img class="shrinkIcon2"><ul class="ant-menu ant-menu-root" role="menu"><li>报账管理</li><li>待办中心</li></ul></div></div></aside><input value="原始财务字段"><button id="submit">提交</button>',{url:'http://wsbx.wbu.edu.cn/workbench-web/#/reimbursementCreate?formEditId=demo',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,d=w.document,requests=[],listeners=[],settings={enabled:true,visual};let submitted=0;
 w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
 w.chrome={storage:{local:{get:async defaults=>({...defaults,...settings})},onChanged:{addListener:fn=>listeners.push(fn)}},runtime:{sendMessage:async()=>({ok:true})}};
 w.postMessage=message=>{
  requests.push(message.action);
  const result=message.action==='status'?{scope:'g|u',draftId:'demo',eligible:true,available:true,fillRecorded:true}:{report:{draftId:'demo',state:2,stateName:'待提交',total:10000,expenseTotal:10000,receiptTotal:10000,printTotal:null,detailIssues:[],currentDetailIssues:[],issues:[]}};
  queueMicrotask(()=>w.dispatchEvent(new w.MessageEvent('message',{source:w,origin:w.location.origin,data:{type:'reimbursement-fill-reply',id:message.id,ok:true,...result}})));
 };
 d.querySelector('#submit').onclick=()=>submitted++;
 d.querySelector('.shrinkIcon').onclick=()=>d.querySelector('aside').classList.add('ant-layout-sider-collapsed');
 d.querySelector('.shrinkIcon2').onclick=()=>d.querySelector('aside').classList.remove('ant-layout-sider-collapsed');
 w.eval(fill);w.eval(bundle);await settle();
 return {w,d,requests,get submitted(){return submitted},async enable(value){settings.enabled=value;for(const fn of listeners)await fn();await settle()},close(){d[Symbol.for('betterwbu.react-workspace')].destroy();w.ReimbursementUI.destroy();w.close()}};
}

test('third main navigation group opens an independent read-only check panel',async()=>{
 const f=await fixture();try{
  const menu=f.d.querySelector('.ant-menu-root'),input=f.d.querySelector('input');
  assert.equal(menu.children[0].textContent,'报账管理');assert.equal(menu.children[1].textContent,'待办中心');assert.ok(menu.children[2].classList.contains('bw-fill-menu'));
  f.d.querySelector('.bw-fill-menu-title').click();await settle();
  const entries=f.d.querySelectorAll('.bw-fill-submenu button');assert.deepEqual([...entries].map(n=>n.textContent),['状态与预检','同步与恢复']);entries[0].click();await settle();
  const dialog=f.d.querySelector('[role=dialog]');assert.ok(dialog);assert.match(dialog.textContent,/状态与预检/);assert.ok(dialog.querySelector('.bw-fill-review'));assert.ok(f.requests.includes('server-status'));
  assert.equal([...dialog.querySelectorAll('button')].find(n=>n.textContent==='检查填报状态').hidden,true);
  assert.equal(f.requests.some(action=>['capture','run','restore','finish'].includes(action)),false);assert.equal(f.submitted,0);assert.equal(f.d.querySelector('input'),input);assert.equal(input.value,'原始财务字段');
 }finally{f.close()}
});
test('collapsed entry remains available and opens all tools without a generated request',async()=>{
 const f=await fixture();try{
  f.d.querySelector('.bw-sidebar-toggle').click();await settle();assert.equal(f.d.querySelector('.bw-sidebar-toggle').getAttribute('aria-label'),'展开侧栏');
  const entry=f.d.querySelector('.bw-fill-menu-title');assert.equal(entry.getAttribute('aria-haspopup'),'dialog');entry.click();await settle();
  const dialog=f.d.querySelector('[role=dialog]');assert.ok(dialog);assert.equal([...dialog.querySelectorAll('button')].find(n=>n.textContent==='检查填报状态').hidden,false);assert.equal(f.requests.includes('run'),false);
  dialog.querySelector('[aria-label="关闭详情"]').click();await settle();assert.equal(f.d.querySelector('[role=dialog]'),null);assert.equal(f.submitted,0);
 }finally{f.close()}
});
test('Vue replacing the sidebar does not duplicate the third group and disabling removes it',async()=>{
 const f=await fixture();try{
  const old=f.d.querySelector('aside'),replacement=old.cloneNode(true);old.replaceWith(replacement);await settle();
  assert.equal(f.d.querySelectorAll('.bw-fill-menu').length,1);assert.equal(replacement.querySelector('.ant-menu-root').children[2].className,'bw-fill-menu');
  await f.enable(false);assert.equal(f.d.querySelector('.bw-fill-menu'),null);await f.enable(true);assert.equal(f.d.querySelectorAll('.bw-fill-menu').length,1);assert.equal(f.submitted,0);
 }finally{f.close()}
});
test('financial tools remain reachable when only visual optimization is disabled',async()=>{
 const f=await fixture(false);try{assert.ok(f.d.querySelector('.bw-fill-menu-title'));assert.equal(f.d.querySelector('.bw-sidebar-toggle'),null)}finally{f.close()}
});
