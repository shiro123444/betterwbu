const test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const {createWorkspaceModel}=require('../src/workspace-model.cjs');
function setup(){
 const dom=new JSDOM(`<!doctype html><html data-re-visual="true"><body><main class="layout-content"><div class="reimbursementCreate"><div class="custom-forms-render commit-bill"><section class="collapse-box"><div class="ant-collapse-item"><div class="ant-collapse-header" aria-expanded="true">基本信息<span class="ant-collapse-extra"><span class="behaviorNum">¥ 123.45</span></span></div><div class="ant-collapse-content"><form><input value="未保存内容"><iframe id="preview"></iframe><table><tbody><tr><td><span class="anticon anticon-plus-circle"></span><span class="anticon anticon-copy"></span><span class="anticon anticon-delete"></span><span class="behavior-detail-btn">详情</span></td></tr></tbody></table></form></div></div></section></div><div class="button-box"><button id="submit">提交</button></div></div></main></body></html>`,{url:'http://localhost/'});
 const d=dom.window.document,model=createWorkspaceModel(d);let submit=0,detail=0,copy=0;
 d.querySelector('#submit').onclick=()=>submit++;d.querySelector('.behavior-detail-btn').onclick=()=>detail++;d.querySelector('.anticon-copy').onclick=()=>copy++;
 return {dom,d,model,counts:()=>({submit,detail,copy})};
}
test('React adapter preserves every native node, field value and iframe parent; does not submit',()=>{
 const f=setup(),input=f.d.querySelector('input'),iframe=f.d.querySelector('iframe'),parent=iframe.parentElement,originalRoot=f.d.querySelector('.custom-forms-render');
 input.value='正在填写';const s=f.model.scan();assert.equal(s.sections.length,1);assert.equal(s.rows.length,1);assert.equal(f.d.querySelector('input'),input);assert.equal(input.value,'正在填写');assert.equal(iframe.parentElement,parent);assert.equal(parent.closest('.custom-forms-render'),originalRoot);assert.equal(f.counts().submit,0);f.dom.window.close();
});
test('headings read native labels, totals and collapsed state without mixing React text',()=>{
 const f=setup(),s=f.model.scan(),section=s.sections[0];assert.equal(section.title,'基本信息');assert.equal(section.amount,'¥ 123.45');section.host.textContent='React 新标题';assert.equal(f.model.scan().sections[0].title,'基本信息');section.header.setAttribute('aria-expanded','false');assert.equal(f.model.scan().sections[0].expanded,false);f.dom.window.close();
});
test('repeated scans reuse portals and notify only when native state changes',()=>{
 const f=setup();let notifications=0;f.model.subscribe(()=>notifications++);const first=f.model.scan();for(let i=0;i<10;i++)f.model.scan();assert.equal(notifications,1);assert.equal(first.sections[0].host,f.model.snapshot().sections[0].host);assert.equal(f.d.querySelectorAll('.bw-heading-host').length,1);assert.equal(f.d.querySelectorAll('.bw-row-host').length,1);f.dom.window.close();
});
test('detail and row copy invoke the exact original handlers, not last-row toolbar copy',()=>{
 const f=setup(),row=f.model.scan().rows[0];assert.deepEqual(row.menu.map(m=>m.label),['新增一行','复制此行','删除此行']);assert.equal(f.model.invoke(row.detail),true);assert.equal(f.model.invoke(row.menu[1].node),true);assert.deepEqual(f.counts(),{submit:0,detail:1,copy:1});f.dom.window.close();
});
test('disabled and disconnected native controls cannot be triggered by React',()=>{
 const f=setup(),row=f.model.scan().rows[0];row.detail.setAttribute('aria-disabled','true');assert.equal(f.model.invoke(row.detail),false);assert.equal(f.model.scan().rows[0].disabled,true);row.detail.remove();assert.equal(f.model.invoke(row.detail),false);f.model.scan();assert.equal(f.d.querySelectorAll('.bw-row-host').length,0);f.dom.window.close();
});
test('disabling layout restores original controls, IDs and DOM, preserving edits',()=>{
 const f=setup(),input=f.d.querySelector('input');f.model.scan();input.value='保留修改';assert.ok(f.d.querySelector('.behavior-detail-btn').hasAttribute('data-bw-native-control'));f.model.enable(false);assert.equal(f.d.querySelectorAll('[data-bw-owned]').length,0);assert.equal(f.d.querySelector('.collapse-box').getAttribute('id'),null);assert.equal(f.d.querySelector('.behavior-detail-btn').getAttribute('data-bw-native-control'),null);assert.equal(input.value,'保留修改');assert.equal(f.model.snapshot().root,null);f.dom.window.close();
});
test('existing section IDs survive cleanup and route replacement releases old controls',()=>{
 const f=setup();f.d.querySelector('.collapse-box').id='existing';const before=f.model.scan();const native=f.d.querySelector('.reimbursementCreate');native.remove();f.model.scan();assert.equal(before.sections[0].section.id,'existing');assert.equal(before.rows[0].detail.getAttribute('data-bw-native-control'),null);assert.equal(f.model.snapshot().sections.length,0);f.dom.window.close();
});
test('native rerenders adopt new headers/details and discard stale portals',()=>{
 const f=setup();const first=f.model.scan(),old=first.sections[0].host;first.sections[0].header.remove();const header=f.d.createElement('div');header.className='ant-collapse-header';header.textContent='更新后的标题';f.d.querySelector('.ant-collapse-item').prepend(header);const next=f.model.scan();assert.equal(next.sections[0].title,'更新后的标题');assert.equal(old.isConnected,false);assert.equal(f.d.querySelectorAll('.bw-heading-host').length,1);f.dom.window.close();
});
test('headers toggle by original native click exactly once and never call submit',()=>{
 const f=setup(),s=f.model.scan().sections[0];let toggles=0;s.header.onclick=()=>{toggles++;s.header.setAttribute('aria-expanded','false')};f.model.invoke(s.header);assert.equal(toggles,1);assert.equal(f.model.scan().sections[0].expanded,false);assert.equal(f.counts().submit,0);f.dom.window.close();
});
test('native title text nodes and accessibility attributes restore exactly after disable',()=>{
 const f=setup(),header=f.d.querySelector('.ant-collapse-header'),original=[...header.childNodes];header.setAttribute('role','button');header.setAttribute('tabindex','0');f.model.scan();
 assert.equal(header.querySelector('[data-bw-native-title]').getAttribute('aria-hidden'),'true');assert.equal(header.getAttribute('role'),'presentation');
 f.model.enable(false);assert.equal(header.getAttribute('role'),'button');assert.equal(header.getAttribute('tabindex'),'0');assert.deepEqual([...header.childNodes],original);f.dom.window.close();
});
test('existing toolbar labels still use native section titles after React concealment',async()=>{
 const fs=require('node:fs');
 const dom=new JSDOM('<html data-re-visual="true"><body><div class="reimbursementCreate"><section class="collapse-box"><div class="ant-collapse-item"><div class="ant-collapse-header">收付款信息</div><div class="btn"><span class="anticon icon" aria-label="plus-circle"></span></div></div></section></div></body></html>',{runScripts:'outside-only',pretendToBeVisual:true});
 const model=createWorkspaceModel(dom.window.document);model.scan();
 dom.window.chrome={storage:{local:{get:async defaults=>defaults},onChanged:{addListener(){}}}};
 dom.window.eval(fs.readFileSync(__dirname+'/../extension/actions.js','utf8'));await new Promise(r=>setTimeout(r,40));
 assert.equal(dom.window.document.querySelector('.btn>.anticon').getAttribute('aria-label'),'添加收款人');model.destroy();dom.window.close();
});
