const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const flush=()=>new Promise(setImmediate);
function fixture(wallet=true){
 const parent={},elements=[],events={},timers=new Map(),posted=[];let settings={enabled:true,wallet:true,loader:true},change,id=0;
 function element(text=''){const attrs={};return {textContent:text,disabled:false,hidden:false,isConnected:true,parentNode:parent,style:{},dataset:{},className:'',setAttribute(k,v){attrs[k]=v},getAttribute:k=>attrs[k]??null,removeAttribute(k){delete attrs[k];if(k==='data-re-confirming')delete this.dataset.reConfirming},before(e){e.parentNode=this.parentNode},closest:()=>({getBoundingClientRect:()=>({height:50})})};}
 const button=element('确 定'),picker=element(),preview=element();picker.contentWindow={};preview.contentWindow={};picker.classList={contains:n=>n==='iframe-box'};preview.classList={contains:n=>n==='iframe-box1'};
 const window={postMessage:m=>posted.push(m),addEventListener:(k,f)=>events[k]=f};
 const chrome={storage:{local:{get:async()=>settings},onChanged:{addListener:f=>change=f}}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../extension/wallet-feedback.js','utf8'),{window,location:{origin:'http://test',pathname:wallet?'/bill-wallet-web/':'/workbench-web/'},chrome,document:{createElement(){const e=element();e.parentNode=null;elements.push(e);return e},querySelector:s=>s==='iframe.iframe-box1'?preview:button,querySelectorAll:s=>s==='button.ant-btn'?[button]:[picker,preview]},setTimeout(f){timers.set(++id,f);return id},clearTimeout(i){timers.delete(i)}});
 return {button,elements,posted,timers,get status(){return elements[0]},send(data,source=wallet?window:picker.contentWindow,origin='http://test'){events.message({data,source,origin})},picker,preview,async configure(next){settings={...settings,...next};await change()}};
}
test('confirmation animation preserves selection on failure and enables retry',async()=>{
 const f=fixture();await flush();f.button.setAttribute('aria-label','确定');f.send({type:'reimbursement-wallet-state',phase:'confirming',count:34});assert.equal(f.button.disabled,true);assert.equal(f.button.dataset.reConfirming,'true');assert.equal(f.button.getAttribute('aria-busy'),'true');assert.match(f.status.textContent,/34/);assert.equal(f.status.style.bottom,'72px');
 f.send({type:'reimbursement-wallet-state',phase:'error',count:34});assert.equal(f.button.disabled,false);assert.equal(f.button.dataset.reConfirming,undefined);assert.equal(f.button.getAttribute('aria-label'),'确定');assert.match(f.status.textContent,/重试/);assert.equal(f.timers.size,0);
 f.send({type:'reimbursement-wallet-state',phase:'picker-idle',count:34});assert.equal(f.status.hidden,false);f.send({type:'reimbursement-wallet-state',phase:'confirming',count:34});assert.ok(!f.status.className.includes('--error'));assert.equal(f.button.disabled,true);
 f.send({type:'reimbursement-wallet-state',phase:'picker-idle',count:0});assert.equal(f.status.hidden,true);assert.equal(f.button.disabled,true);
});
test('slow confirmation stays honest; disabling feedback releases button but keeps request guard',async()=>{
 const f=fixture();await flush();f.send({type:'reimbursement-wallet-state',phase:'confirming',count:2});[...f.timers.values()][0]();assert.match(f.status.textContent,/系统仍在添加/);await f.configure({loader:false});assert.equal(f.status.hidden,true);assert.equal(f.button.disabled,false);assert.equal(f.posted.at(-1).enabled,true);f.send({type:'reimbursement-wallet-state',phase:'confirming',count:2});assert.equal(f.button.disabled,false);await f.configure({wallet:false});assert.equal(f.posted.at(-1).enabled,false);
});
test('preview ends only on matching ready, not old native heights or wrong frame',async()=>{
 const f=fixture(false);await flush();const state=phase=>({type:'reimbursement-wallet-state',phase,count:34});f.send(state('rendering'));assert.equal(f.status.hidden,false);f.send({...state('preview-start'),operation:2},f.preview.contentWindow);f.send(JSON.stringify({action:'billHeight',value:300}),f.preview.contentWindow);f.send({action:'showIframe',value:true},f.preview.contentWindow);f.send({...state('ready'),operation:1},f.preview.contentWindow);assert.equal(f.status.hidden,false);f.send({...state('ready'),operation:2});assert.equal(f.status.hidden,false);f.send({...state('ready'),operation:2},f.preview.contentWindow);assert.equal(f.status.hidden,true);
 f.send({...state('preview-start'),operation:3,count:0},f.preview.contentWindow);f.send({...state('ready'),operation:3,count:0},f.preview.contentWindow);assert.equal(f.status.hidden,true);
});
test('unrelated frames and origins cannot start feedback',async()=>{
 const f=fixture(false);await flush();const data={type:'reimbursement-wallet-state',phase:'preview-start',operation:1};f.send(data,{},'http://test');f.send(data,f.preview.contentWindow,'http://foreign');assert.equal(f.elements.length,0);
});
