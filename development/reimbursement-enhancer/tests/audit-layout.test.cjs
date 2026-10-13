const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 let observe,roots=[],contentReady=true,loading=false;
 class Element{
  constructor(cls='',text=''){this.className=cls;this.textContent=text;this.children=[];this.attrs={};this.isConnected=true;this.classList={contains:c=>this.className.split(' ').includes(c)}}
  getAttribute(k){return this.attrs[k]??null}setAttribute(k,v){this.attrs[k]=v}removeAttribute(k){delete this.attrs[k]}
  append(...nodes){nodes.forEach(n=>{n.parent=this;n.isConnected=true;this.children.push(n)})}
  prepend(n){n.parent=this;n.isConnected=true;this.children.unshift(n)}
  after(n){n.parent=this.parent;n.isConnected=true;this.parent.children.push(n)}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.isConnected=false}
  querySelector(){return null}querySelectorAll(){return []}
 }
 const document={readyState:'complete',documentElement:{dataset:{reVisual:'true'}},createElement:()=>new Element(),querySelectorAll:()=>roots};
 const header=new Element(),state=new Element('state','待审批'),pushed=new Element('','已推送财务系统');header.querySelector=()=>state;header.querySelectorAll=()=>[pushed];
 const page=new Element(),container=new Element();page.querySelector=sel=>sel==='.top-desc>.state'?state:header;
 function create(){
  const root=new Element(),panel=new Element(),warning=new Element('','违规/提示'),approval=new Element('','审批详情'),content=new Element(),warningPane=new Element('ant-tabs-tabpane','原始黄色提醒'),progressPane=new Element('ant-tabs-tabpane'),timeline=new Element('timeline-content'),form={total:9996.48,payment:6942.48},warningData={count:7,confirmed:false};
  timeline.append(new Element('','真实审批人'));progressPane.append(timeline);content.append(warningPane,progressPane);
  warning.setAttribute('aria-selected','true');approval.setAttribute('aria-selected','false');let clicks=0,wrappers=[];
  approval.click=()=>{clicks++;approval.setAttribute('aria-selected','true');warning.setAttribute('aria-selected','false')};warning.click=()=>{warning.setAttribute('aria-selected','true');approval.setAttribute('aria-selected','false')};
  panel.querySelectorAll=s=>s==='[role="tab"]'?[warning,approval]:s==='.cell-item.maodianGBCDiv'?warningPane.children:s==='.col-list'?wrappers:[];panel.querySelector=s=>s==='.ant-tabs-content'?(contentReady?content:null):s.includes('timeline-content')?timeline:s==='.ant-spin-spinning'?(loading?new Element():null):null;
  root.querySelector=()=>panel;root.closest=s=>s==='.layout-content'?page:container;
  return{root,panel,warning,approval,content,warningPane,timeline,form,warningData,setWrappers(items){wrappers=items.map(x=>{const w=new Element('col-list');w.querySelectorAll=()=>x;return w});return wrappers},get clicks(){return clicks}};
 }
 let native=create();roots=[native.root];
 vm.runInNewContext(fs.readFileSync(__dirname+'/../extension/audit-layout.js','utf8'),{document,window:{addEventListener(){}},MutationObserver:class{constructor(f){observe=f}observe(){}},requestAnimationFrame:f=>f()});
 return {document,state,get native(){return native},notify:()=>observe(),enable(v){document.documentElement.dataset.reVisual=String(v);observe()},setContentReady(v){contentReady=v;observe()},empty(v){native.timeline.children=v?[]:[new Element('','审批记录')];observe()},setLoading(v){loading=v;observe()},rerender(){const old=native;old.root.isConnected=false;native=create();roots=[native.root];observe();return old},setReviewItems(texts){native.warningPane.children=texts.map(t=>new Element('cell-item maodianGBCDiv',t));observe();return native.warningPane.children},replacePane(){native.content.children[0]=new Element('ant-tabs-tabpane','新版原始提醒');observe();return native.content.children[0]}};
}
test('read-only modern layout removes warning presentation and shows actual status without changing data',()=>{
 const f=fixture(),n=f.native;assert.equal(n.warning.getAttribute('data-re-audit-warnings'),'true');assert.equal(n.warningPane.getAttribute('data-re-audit-warnings'),'true');assert.equal(n.approval.getAttribute('aria-selected'),'true');assert.equal(n.clicks,1);
 assert.equal(n.root.children.length,0);assert.equal(n.root.getAttribute('data-re-audit-layout'),'true');
 f.notify();assert.equal(n.root.children.length,0);assert.equal(n.clicks,1);assert.deepEqual(n.form,{total:9996.48,payment:6942.48});assert.deepEqual(n.warningData,{count:7,confirmed:false});assert.equal(n.warningPane.textContent,'原始黄色提醒');
});
test('settings disable restores native attributes and removes inserted presentation',()=>{
 const f=fixture(),n=f.native;f.enable(false);assert.equal(n.root.getAttribute('data-re-audit-layout'),null);assert.equal(n.warning.getAttribute('data-re-audit-warnings'),null);assert.equal(n.warningPane.getAttribute('data-re-audit-warnings'),null);assert.equal(n.root.children.length,0);assert.equal(n.panel.getAttribute('data-re-audit-progress'),null);
 f.enable(true);assert.equal(n.root.children.length,0);assert.equal(n.form.total,9996.48);
});
test('empty progress never claims approval; waits for native loading then updates with records',()=>{
 const f=fixture();f.setLoading(true);f.empty(true);assert.equal(f.native.timeline.parent.children.length,1);f.setLoading(false);assert.equal(f.native.timeline.parent.children[1].textContent,'暂无审批记录');f.empty(false);assert.equal(f.native.timeline.parent.children.length,1);
});
test('route and asynchronous pane replacements are handled without retaining stale layouts',()=>{
 const f=fixture(),pane=f.replacePane();assert.equal(pane.getAttribute('data-re-audit-warnings'),'true');const old=f.rerender();assert.equal(old.root.children.length,0);assert.equal(old.warning.getAttribute('data-re-audit-warnings'),null);assert.equal(f.native.root.children.length,0);f.enable(false);assert.equal(pane.getAttribute('data-re-audit-warnings'),null);
 f.setContentReady(false);f.enable(true);assert.equal(f.native.root.children.length,0);f.setContentReady(true);assert.equal(f.native.root.children.length,0);
});

test('only yellow reminders are removed; native blocking errors remain available',()=>{
 const f=fixture(),items=f.setReviewItems(['违规提醒【1】：原始黄色提醒','违规【2】：缺少必填信息']);
 assert.equal(items[0].getAttribute('data-re-audit-warnings'),'true');assert.equal(items[1].getAttribute('data-re-audit-warnings'),'false');assert.equal(f.native.warning.getAttribute('data-re-audit-warnings'),'false');assert.equal(f.native.warningPane.getAttribute('data-re-audit-warnings'),'false');assert.equal(items[1].textContent,'违规【2】：缺少必填信息');assert.equal(f.native.warning.getAttribute('aria-selected'),'true');f.native.approval.click();f.notify();assert.equal(f.native.approval.getAttribute('aria-selected'),'true');
});

test('failed state stays red and reminder wrappers disappear without suppressing error wrappers',()=>{
 const f=fixture();f.state.textContent='稽核不通过';const items=f.setReviewItems(['违规提醒【1】：黄色','违规【1】：保险有效金额0']);const wrappers=f.native.setWrappers([[items[0]],[items[1]]]);f.notify();
 assert.equal(f.state.getAttribute('data-re-audit-failed'),'true');assert.equal(wrappers[0].getAttribute('data-re-audit-warnings'),'true');assert.equal(wrappers[1].getAttribute('data-re-audit-warnings'),'false');
 f.state.textContent='待审批';f.notify();assert.equal(f.state.getAttribute('data-re-audit-failed'),'false');f.enable(false);assert.equal(wrappers[0].getAttribute('data-re-audit-warnings'),null);assert.equal(f.state.getAttribute('data-re-audit-failed'),null);
});
