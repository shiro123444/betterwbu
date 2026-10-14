const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const bundle=fs.readFileSync(__dirname+'/../extension/workspace.js','utf8');
const settle=()=>new Promise(resolve=>setTimeout(resolve,60));
async function setup(){
 const dom=new JSDOM(`<!doctype html><html data-re-visual="true"><body><main class="layout-content"><div class="reimbursementCreate"><section class="collapse-box"><div class="ant-collapse-item"><div class="ant-collapse-header" role="button" tabindex="0" aria-expanded="true">基本信息</div><div class="ant-collapse-content"><input value="保留的未保存输入"><iframe id="preview"></iframe><table><tr><td><span class="behavior-detail-btn">详情</span></td></tr></table></div></div></section><button id="submit">提交</button></div></main></body></html>`,{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});
 const {window:w}=dom,d=w.document;let toggles=0,details=0,submits=0;
 w.chrome={storage:{local:{get:async defaults=>defaults},onChanged:{addListener(){}}}};
 const header=d.querySelector('.ant-collapse-header');header.onclick=()=>{toggles++;header.setAttribute('aria-expanded',String(header.getAttribute('aria-expanded')!=='true'))};
 d.querySelector('.behavior-detail-btn').onclick=()=>details++;d.querySelector('#submit').onclick=()=>submits++;
 const input=d.querySelector('input'),iframe=d.querySelector('iframe'),parent=iframe.parentElement;
 w.eval(bundle);await settle();
 return {dom,w,d,input,iframe,parent,counts:()=>({toggles,details,submits}),close(){d[Symbol.for('betterwbu.react-workspace')]?.destroy();dom.window.close()}};
}
test('compiled React header and detail route to native handlers once, preserving native fields and iframe',async()=>{
 const f=await setup();try{
  assert.equal(f.d.querySelectorAll('.bw-heading-toggle').length,1);f.d.querySelector('.bw-heading-toggle').click();await settle();assert.equal(f.counts().toggles,1);
  f.d.querySelector('.bw-row-actions button').click();assert.equal(f.counts().details,1);assert.equal(f.counts().submits,0);
  assert.equal(f.d.querySelector('input'),f.input);assert.equal(f.input.value,'保留的未保存输入');assert.equal(f.iframe.parentElement,f.parent);
 }finally{f.close()}
});
test('compiled React remount protection and disable restore original accessibility and text nodes',async()=>{
 const f=await setup();try{
  f.w.eval(bundle);await settle();assert.equal(f.d.querySelectorAll('.bw-heading-toggle').length,1);
  const controller=f.d[Symbol.for('betterwbu.react-workspace')];controller.model.enable(false);controller.refresh();await settle();
  assert.equal(f.d.querySelectorAll('.bw-row-actions').length,0);assert.equal(f.d.querySelector('.ant-collapse-header').getAttribute('role'),'button');
  assert.equal(f.d.querySelector('.ant-collapse-header').textContent,'基本信息');assert.equal(f.input.value,'保留的未保存输入');assert.equal(f.counts().submits,0);
 }finally{f.close()}
});
test('compiled React follows replacement of the native form root without stale portals',async()=>{
 const f=await setup();try{
  const old=f.d.querySelector('.reimbursementCreate'),replacement=old.cloneNode(true);
  for(const n of replacement.querySelectorAll('[data-bw-owned]'))n.remove();
  old.replaceWith(replacement);await settle();
  assert.equal(f.d.querySelectorAll('.bw-section-nav').length,1);assert.equal(f.d.querySelectorAll('.bw-heading-toggle').length,1);assert.equal(f.counts().submits,0);
 }finally{f.close()}
});

test('chapter navigation preserves the reimbursement route and unsaved fields while scrolling',async()=>{
 const f=await setup();try{
  f.w.location.hash='#/reimbursementCreate?formEditId=local';await settle();let scrolls=0;
  f.d.querySelector('.collapse-box').scrollIntoView=()=>scrolls++;
  const route=f.w.location.hash,link=f.d.querySelector('.bw-section-nav a');
  const event=new f.w.MouseEvent('click',{bubbles:true,cancelable:true});link.dispatchEvent(event);await settle();
  assert.equal(event.defaultPrevented,true);assert.equal(f.w.location.hash,route);assert.equal(scrolls,1);assert.equal(f.counts().toggles,0);assert.equal(f.counts().submits,0);assert.equal(f.input.value,'保留的未保存输入');
 }finally{f.close()}
});
