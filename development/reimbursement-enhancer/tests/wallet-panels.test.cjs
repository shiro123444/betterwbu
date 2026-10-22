const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const src=fs.readFileSync(__dirname+'/../extension/wallet-panels.js','utf8');
function setup(){const dom=new JSDOM('<html data-bw-wallet-modern><div class="file-page"><aside class="bw-wallet-sidebar"></aside></div></html>',{url:'http://test/#/bill/file',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,saved=[];let configure;
 w.chrome={storage:{local:{get:async()=>({enabled:true,wallet:true,visual:true,walletSidebarWidth:224}),set:async data=>saved.push(data)},onChanged:{addListener:f=>configure=f}}};w.document.querySelector('.file-page').getBoundingClientRect=()=>({width:1000});w.eval(src);return{w,d:w.document,saved,close:()=>dom.window.close()}}
const tick=()=>new Promise(r=>setTimeout(r,35));
function pointer(f,type,x,y=0){const e=new f.w.Event(type,{bubbles:true,cancelable:true});Object.assign(e,{pointerId:1,clientX:x,clientY:y,button:0});return e}
test('separator keyboard and drag are bounded, commits only on release, cancellation rolls back',()=>{
 const f=setup();try{const h=f.d.createElement('div');f.d.body.append(h);let value,commits=[];const c=f.w.ReimbursementWalletPanels.separator(h,{value:224,bounds:()=>[180,320],onValue:n=>value=n,onCommit:n=>commits.push(n)});
 h.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'End',bubbles:true}));assert.equal(value,320);assert.equal(h.getAttribute('aria-valuenow'),'320');h.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowRight'}));assert.equal(value,320);
 h.dispatchEvent(pointer(f,'pointerdown',300));f.w.dispatchEvent(pointer(f,'pointermove',0));assert.equal(value,180);assert.equal(commits.length,2);f.w.dispatchEvent(pointer(f,'pointercancel',0));assert.equal(value,320);assert.equal(commits.length,2);
 h.dispatchEvent(pointer(f,'pointerdown',300));f.w.dispatchEvent(pointer(f,'pointermove',200));f.w.dispatchEvent(pointer(f,'pointerup',200));assert.equal(value,220);assert.equal(commits.at(-1),220);c.destroy();
 }finally{f.close()}
});
test('sidebar has one resize handle and adapts to available width without erasing saved preference',async()=>{
 const f=setup();try{await tick();const handle=f.d.querySelector('[role="separator"]');assert.ok(handle);assert.equal(handle.getAttribute('aria-orientation'),'vertical');handle.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'End'}));await tick();assert.equal(f.d.querySelector('.file-page').style.getPropertyValue('--bw-wallet-sidebar-width'),'360px');
 f.d.querySelector('.file-page').getBoundingClientRect=()=>({width:700});f.w.innerWidth=700;f.w.dispatchEvent(new f.w.Event('resize'));await tick();assert.equal(f.d.querySelector('.file-page').style.getPropertyValue('--bw-wallet-sidebar-width'),'245px');
 f.d.querySelector('.file-page').getBoundingClientRect=()=>({width:1000});f.w.innerWidth=1000;f.w.dispatchEvent(new f.w.Event('resize'));await tick();assert.equal(f.d.querySelector('.file-page').style.getPropertyValue('--bw-wallet-sidebar-width'),'360px');assert.equal(f.d.querySelectorAll('[role="separator"]').length,1);
 f.d.documentElement.removeAttribute('data-bw-wallet-modern');await tick();assert.equal(f.d.querySelector('[role="separator"]'),null);assert.equal(f.d.querySelector('.file-page').style.getPropertyValue('--bw-wallet-sidebar-width'),'');
 }finally{f.close()}
});
