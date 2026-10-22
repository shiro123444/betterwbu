const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const bundle=fs.readFileSync(__dirname+'/../extension/workspace.js','utf8');
const settle=()=>new Promise(r=>setTimeout(r,80));
async function fixture(){
 const dom=new JSDOM('<!doctype html><aside class="ant-layout-sider"><div class="ant-layout-sider-children"><div class="menuBox"><img class="shrinkIcon"><img class="shrinkIcon2"><ul class="ant-menu"><li><div class="ant-menu-submenu-title">报账管理</div><a href="#/myToDo" title="原提示">我的待办</a></li></ul></div></div><div class="ant-layout-sider-trigger"></div></aside><input value="不改报销字段"><button id="submit">提交</button>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,d=w.document;let enabled=true,counts={close:0,open:0,submit:0};const listeners=[];
 w.chrome={storage:{local:{get:async defaults=>({...defaults,enabled})},onChanged:{addListener(fn){listeners.push(fn)}}}};
 function bind(sider){sider.querySelector('.shrinkIcon').onclick=()=>{counts.close++;sider.classList.add('ant-layout-sider-collapsed')};sider.querySelector('.shrinkIcon2').onclick=()=>{counts.open++;sider.classList.remove('ant-layout-sider-collapsed')}}
 bind(d.querySelector('aside'));d.querySelector('#submit').onclick=()=>counts.submit++;
 w.eval(bundle);await settle();
 return{w,d,counts,bind,async enabled(value){enabled=value;for(const fn of listeners)await fn();await settle()},close(){d[Symbol.for('betterwbu.react-workspace')].destroy();w.close()}};
}
test('sidebar replacement works on list pages, forwards exactly one native click and tracks external state',async()=>{
 const f=await fixture();try{
  const input=f.d.querySelector('input'),native=f.d.querySelector('.shrinkIcon');
  let b=f.d.querySelector('.bw-sidebar-toggle');assert.ok(b);assert.equal(b.type,'button');assert.equal(b.getAttribute('aria-label'),'收起侧栏');assert.equal(b.getAttribute('aria-expanded'),'true');assert.equal(native.dataset.bwSidebarNative,'true');
  b.click();await settle();assert.deepEqual(f.counts,{close:1,open:0,submit:0});b=f.d.querySelector('.bw-sidebar-toggle');assert.equal(b.getAttribute('aria-label'),'展开侧栏');assert.equal(b.getAttribute('aria-expanded'),'false');assert.equal(f.d.querySelector('.ant-menu-submenu-title').title,'报账管理');
  b.click();await settle();assert.deepEqual(f.counts,{close:1,open:1,submit:0});assert.equal(f.d.querySelector('.ant-menu-submenu-title').hasAttribute('title'),false);
  f.d.querySelector('aside').classList.add('ant-layout-sider-collapsed');await settle();assert.equal(f.d.querySelector('.bw-sidebar-toggle').getAttribute('aria-expanded'),'false');assert.deepEqual(f.counts,{close:1,open:1,submit:0});assert.equal(f.d.querySelector('input'),input);assert.equal(input.value,'不改报销字段');assert.equal(f.d.querySelector('.shrinkIcon'),native);
 }finally{f.close()}
});
test('sidebar replacement follows Vue remounts and disabling restores original controls and attributes',async()=>{
 const f=await fixture();try{
  f.w.eval(bundle);await settle();assert.equal(f.d.querySelectorAll('.bw-sidebar-toggle').length,1);
  const old=f.d.querySelector('aside'),replacement=old.cloneNode(true);replacement.querySelector('.bw-sidebar-toggle-host').remove();replacement.removeAttribute('id');replacement.removeAttribute('data-bw-sidebar-ready');for(const n of replacement.querySelectorAll('[data-bw-sidebar-native]'))n.removeAttribute('data-bw-sidebar-native');f.bind(replacement);old.replaceWith(replacement);await settle();
  assert.equal(f.d.querySelectorAll('.bw-sidebar-toggle').length,1);f.d.querySelector('.bw-sidebar-toggle').click();await settle();assert.equal(f.counts.close,1);
  await f.enabled(false);assert.equal(f.d.querySelector('.bw-sidebar-toggle'),null);assert.equal(replacement.hasAttribute('data-bw-sidebar-ready'),false);assert.equal(replacement.hasAttribute('id'),false);assert.equal(replacement.querySelector('[data-bw-sidebar-native]'),null);assert.equal(replacement.querySelector('a').title,'原提示');assert.equal(f.counts.submit,0);
 }finally{f.close()}
});
test('disabled native target cannot be triggered through the new sidebar button',async()=>{
 const f=await fixture();try{
  f.d.querySelector('.shrinkIcon').setAttribute('aria-disabled','true');await settle();const b=f.d.querySelector('.bw-sidebar-toggle');assert.equal(b.disabled,true);b.click();assert.equal(f.counts.close,0);
 }finally{f.close()}
});

test('sidebar text-button sizing survives reversed stylesheet order and remains compact when collapsed',()=>{
 const styles=['workspace.css','components.css'].map(name=>fs.readFileSync(__dirname+'/../extension/'+name,'utf8'));
 for(const ordered of [styles,[...styles].reverse()]){
  const dom=new JSDOM('<html data-bw-ui="true"><head></head><body><aside class="ant-layout-sider" data-bw-sidebar-ready="true"><div class="bw-sidebar-toggle-host"><button class="bw-button bw-sidebar-toggle"><svg></svg><span class="bw-sidebar-toggle-label">收起侧栏</span></button></div></aside></body></html>');
  try{const w=dom.window,d=w.document;for(const css of ordered){const style=d.createElement('style');style.textContent=css;d.head.append(style)}const button=d.querySelector('button'),host=d.querySelector('.bw-sidebar-toggle-host');assert.equal(w.getComputedStyle(button).width,'100%');assert.equal(w.getComputedStyle(button).boxSizing,'border-box');assert.equal(w.getComputedStyle(host).justifyContent,'center');d.querySelector('aside').classList.add('ant-layout-sider-collapsed');assert.equal(w.getComputedStyle(button).width,'44px');assert.equal(w.getComputedStyle(button.lastElementChild).clipPath,'inset(50%)');
  }finally{dom.window.close()}
 }
});
