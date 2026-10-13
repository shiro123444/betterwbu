const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const flush=()=>new Promise(setImmediate);
function fixture(hash='#/bill/list?from=outer',wallet=true){
 const events={},attrs={},toolbar={children:[],prepend(n){this.children.unshift(n);n.isConnected=true}},root={getAttribute:k=>attrs[k]??null,setAttribute(k,v){attrs[k]=v},removeAttribute(k){delete attrs[k]}};let change,observed,settings={enabled:true,wallet:true,visual:true};
 const location={hash,pathname:wallet?'/bill-wallet-web/':'/workbench-web/'};
 const document={readyState:'complete',documentElement:root,querySelector:()=>toolbar,querySelectorAll:()=>[],createElement(){const a={},e={};return {isConnected:false,addEventListener:(k,f)=>e[k]=f,setAttribute(k,v){a[k]=v},getAttribute:k=>a[k]??null,remove(){this.isConnected=false;toolbar.children=toolbar.children.filter(n=>n!==this)},click:()=>e.click(),attrs:a}}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../extension/wallet-layout.js','utf8'),{document,location,window:{addEventListener:(k,f)=>events[k]=f},chrome:{storage:{local:{get:async()=>settings},onChanged:{addListener:f=>change=f}}},MutationObserver:class{constructor(f){observed=f}observe(){}},requestAnimationFrame:f=>f()});
 return {attrs,toolbar,async configure(s){settings={...settings,...s};await change()},navigate(s){location.hash=s;events.hashchange()},observed:()=>observed()};
}
test('wallet filters default folded and toggle without modifying native controls',async()=>{
 const f=fixture();await flush();assert.equal(f.attrs['data-re-wallet-picker'],'true');const b=f.toolbar.children[0];assert.equal(b.getAttribute('aria-expanded'),'false');b.click();assert.equal(f.attrs['data-re-wallet-filters'],'true');assert.equal(b.getAttribute('aria-expanded'),'true');b.click();assert.equal(f.attrs['data-re-wallet-filters'],'false');f.observed();assert.equal(f.toolbar.children.length,1);
});
test('disabled layout restores filters and preview/detail routes are never restyled as the picker',async()=>{
 const f=fixture();await flush();await f.configure({wallet:false});assert.equal(f.attrs['data-re-wallet-picker'],'false');assert.equal(f.toolbar.children.length,0);assert.equal(f.attrs['data-re-wallet-filters'],undefined);await f.configure({wallet:true});assert.equal(f.toolbar.children.length,1);f.navigate('#/bill/listDetails');assert.equal(f.attrs['data-re-wallet-picker'],'false');assert.equal(f.toolbar.children.length,0);f.navigate('#/bill/detail/test/readonly');assert.equal(f.toolbar.children.length,0);
});
test('management wallet reuses folded filters and route transitions keep a single toggle',async()=>{
 const f=fixture('#/bill/file');await flush();assert.equal(f.attrs['data-re-wallet-picker'],'true');assert.equal(f.toolbar.children.length,1);f.observed();assert.equal(f.toolbar.children.length,1);
 f.navigate('#/bill/list?from=outer');assert.equal(f.toolbar.children.length,1);f.navigate('#/bill/file?folder=test');assert.equal(f.toolbar.children.length,1);f.navigate('#/bill/repeat');assert.equal(f.toolbar.children.length,0);
});
