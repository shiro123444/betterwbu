const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(reduced=false,local=false){
 let observer,active=true,dialog=false;
 const frames=new Map(),timers=new Map(),events={};let now=0,nextTimer=0;
 const document={hidden:false,readyState:'complete',documentElement:{dataset:{reLoader:'true'}},addEventListener:(name,f)=>events[name]=f};
 class Element{
  constructor(tag='div'){this.tag=tag;this.dataset={};this.attrs={};this.children=[];this.isConnected=true;this.textContent='';this.style={getPropertyValue(){},setProperty(){}}}
  setAttribute(k,v){this.attrs[k]=v}getAttribute(k){return this.attrs[k]??null}removeAttribute(k){delete this.attrs[k]}
  append(...children){for(const child of children){child.remove();child.parent=this;child.isConnected=true;this.children.push(child)}}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);this.parent=null;this.isConnected=false}
  closest(){return null}
  focus(){document.activeElement=this}getClientRects(){return this.hidden?[]:[{}]}
 }
 const focusBefore=new Element('input');document.activeElement=focusBefore;document.body=new Element('body');
 const indicator=new Element(),nativeText=new Element();nativeText.textContent='Saving…';indicator.querySelector=s=>s==='.loadingText'&&!local||s==='.ant-spin-text'&&local?nativeText:null;
 const region=new Element();region.getBoundingClientRect=()=>({left:30,top:20,width:500,height:400,bottom:420,right:530});
 const host=local?indicator:new Element();host.closest=selector=>selector==='.ant-spin-spinning'?(active?indicator:null):selector==='.ant-spin-dot'?indicator:selector==='.ant-spin-nested-loading'&&local?region:null;host.getClientRects=()=>active?[{}]:[];
 const media={matches:reduced,addEventListener(){}};
 document.createElement=tag=>new Element(tag);
 document.querySelectorAll=selector=>selector.includes('.loadingBG')?(local?[]:[host]):selector==='.ant-spin-spinning .ant-spin-dot'?(local?[host]:[]):selector==='iframe'?[]:dialog?[new Element()]:[];
 const sandbox={location:{pathname:'/workbench-web/'},window:{addEventListener(){}},document,innerWidth:1000,innerHeight:700,matchMedia:()=>media,getComputedStyle:()=>({visibility:'visible'}),MutationObserver:class{constructor(f){observer=f}observe(){}},queueMicrotask:f=>f(),requestAnimationFrame(){throw Error('Continuous frames are forbidden for the lightweight wait')},setTimeout(){throw Error('No artificial wait duration')},setInterval(f){const id=++nextTimer;timers.set(id,f);return id},clearInterval(id){timers.delete(id)},Date:{now:()=>now},Math};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../extension/waiting.js','utf8'),sandbox);
 return {document,host,indicator,focusBefore,frames,timers,advance(seconds){now+=seconds*1000;for(const f of [...timers.values()])f()},notify(){observer()},show(){document.hidden=false;events.visibilitychange()},get overlay(){return document.body.children[0]},hide(){document.hidden=true;events.visibilitychange()},setActive(v){active=v;observer()},setDialog(v){dialog=v;observer()},disable(){document.documentElement.dataset.reLoader='false';observer()},setText(text){nativeText.textContent=text;observer()},key(key){const e={key,preventDefault(){this.prevented=true},stopPropagation(){this.stopped=true}};events.keydown(e);return e}};
}
test('lightweight wait disappears immediately when loading closes or tab is hidden',()=>{
 const f=fixture();f.setActive(false);assert.equal(f.overlay.hidden,true);
 f.setActive(true);assert.equal(f.overlay.hidden,false);f.hide();assert.equal(f.overlay.hidden,true);
});
test('whole-window portal mirrors native status and restores focus and indicator on close',()=>{
 const f=fixture();assert.equal(f.overlay.parent,f.document.body);assert.equal(f.document.documentElement.dataset.reWaiting,'true');
 assert.equal(f.document.activeElement,f.overlay);assert.equal(f.indicator.getAttribute('aria-hidden'),'true');
 const scene=f.overlay.children[0];assert.equal(scene.children[5].children[1].textContent,'Saving…');f.setText('正在检查单据');assert.equal(scene.children[1].textContent,'正在审查单据');assert.equal(scene.children[5].children[1].textContent,'正在检查单据');
 assert.equal(f.key('Tab').prevented,true);f.setActive(false);assert.equal(f.document.activeElement,f.focusBefore);assert.equal(f.indicator.getAttribute('aria-hidden'),null);
 const css=fs.readFileSync(__dirname+'/../extension/polish.css','utf8');assert.match(css,/\.re-wait-overlay \{position:fixed;inset:0/);
});
test('Escape removes only the new veil for the current wait and allows the next wait',()=>{
 const f=fixture();assert.equal(f.key('Escape').prevented,true);assert.equal(f.overlay.hidden,true);assert.ok(f.host.closest('.ant-spin-spinning'));
 f.setText('Still saving…');assert.equal(f.overlay.hidden,true);
 f.setActive(false);f.setActive(true);assert.equal(f.overlay.hidden,false);
});
test('native dialogs take precedence and disabling the loader removes the portal',()=>{
 const f=fixture();f.setDialog(true);assert.equal(f.overlay.hidden,true);f.setDialog(false);assert.equal(f.overlay.hidden,false);
 f.disable();assert.equal(f.overlay.hidden,true);assert.equal(f.document.documentElement.dataset.reWaiting,'false');assert.equal(f.frames.size,0);
});
test('motion follows visible native lifetime with reduced-motion override and no frame loop',()=>{
 const f=fixture(true);assert.equal(f.host.children.length,0);assert.equal(f.frames.size,0);
 const css=fs.readFileSync(__dirname+'/../extension/polish.css','utf8');assert.match(css,/re-wait-overlay:not\(\[hidden\]\).*re-wait-mark.*re-wait-slide 1.6s ease-in-out infinite/);assert.match(css,/prefers-reduced-motion:reduce.*re-wait-mark.*animation:none/);
 assert.doesNotMatch(css,/re-enter|backdrop-filter|re-wait-picture/);
});

test('one elapsed timer gives honest long-wait messages and stops on all exits',()=>{
 const f=fixture(),scene=f.overlay.children[0];f.setText('正在提交');assert.equal(scene.children[1].textContent,'正在提交单据');assert.equal(f.timers.size,1);
 f.notify();f.notify();assert.equal(f.timers.size,1);
 f.advance(15);assert.equal(scene.children[4].textContent,'已等待 00:15');assert.equal(scene.children[2].textContent,'仍在等待系统返回，请勿重复提交');
 f.advance(45);assert.equal(scene.children[4].textContent,'已等待 01:00');assert.equal(scene.children[2].textContent,'等待较久，系统尚未返回结果');
 f.hide();assert.equal(f.timers.size,0);f.show();assert.equal(f.timers.size,1);assert.equal(scene.children[4].textContent,'已等待 01:00');
 f.setDialog(true);assert.equal(f.timers.size,0);f.setDialog(false);assert.equal(f.timers.size,1);
 f.key('Escape');assert.equal(f.timers.size,0);f.setActive(false);f.setActive(true);assert.equal(f.timers.size,1);f.disable();assert.equal(f.timers.size,0);
});
test('repeated observer inspections do not rewrite unchanged clock text',()=>{
 const f=fixture(),elapsed=f.overlay.children[0].children[4];let value=elapsed.textContent,writes=0;
 Object.defineProperty(elapsed,'textContent',{get:()=>value,set(v){writes++;value=v}});
 f.notify();f.notify();assert.equal(writes,0);f.advance(1);assert.equal(writes,1);f.notify();assert.equal(writes,1);
});

test('standard page-region loading shares motion without taking focus or blocking navigation',()=>{
 const f=fixture(false,true);assert.equal(f.overlay.getAttribute('data-re-local'),'true');assert.equal(f.overlay.style.width,'500px');assert.equal(f.overlay.style.left,'30px');assert.equal(f.document.activeElement,f.focusBefore);assert.equal(f.key('Tab').prevented,undefined);
 assert.equal(f.indicator.getAttribute('data-re-wait-indicator'),'true');f.advance(3);assert.equal(f.overlay.children[0].children[4].textContent,'已等待 00:03');f.setActive(false);assert.equal(f.overlay.hidden,true);assert.equal(f.timers.size,0);assert.equal(f.indicator.getAttribute('data-re-wait-indicator'),null);
});
test('modern wallet inline state suppresses the duplicate wait overlay',()=>{const f=fixture();f.document.documentElement.dataset.bwWalletModern='';f.notify();assert.equal(f.overlay.hidden,true);assert.equal(f.timers.size,0)});
