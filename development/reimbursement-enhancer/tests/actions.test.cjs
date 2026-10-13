const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Node{
 constructor(tag='span',connected=false){this.tagName=tag;this.isConnected=connected;this.dataset={};this.children=[];this.attrs=new Map();this.classList={contains:()=>false};this.namespaceURI='http://www.w3.org/2000/svg';this.clicks=0}
 get parentNode(){return this.parent}
 append(...nodes){for(const n of nodes){n.parent=this;n.isConnected=this.isConnected;this.children.push(n)}}remove(){this.isConnected=false;if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null}
 setAttribute(k,v){this.attrs.set(k,String(v))}getAttribute(k){if(k.startsWith('data-'))return this.dataset[k.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]??null;return this.attrs.get(k)??null}removeAttribute(k){this.attrs.delete(k);if(k.startsWith('data-'))delete this.dataset[k.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]}
 closest(s){if(s==='.table-level2-box')return null;return {querySelector:()=>({childNodes:[{nodeType:3,textContent:'收付款信息'}]})}}querySelectorAll(){return []}click(){this.clicks++}
}
test('action labels preserve the original controls, clarify last-row copy, support keyboard and restore attributes',async()=>{
 const icons=['plus-circle','delete','copy'].map(v=>{const n=new Node('span',true);n.setAttribute('aria-label',v);n.setAttribute('role','img');n.setAttribute('tabindex','-1');return n});let changed,keydown,enabled=true;
 const document={readyState:'complete',documentElement:{},createElement:t=>new Node(t),createElementNS:(ns,t)=>new Node(t),querySelectorAll:s=>s.includes('.btn>.anticon.icon')?icons:[],addEventListener:(t,f)=>{if(t==='keydown')keydown=f}};
 const chrome={storage:{local:{get:async d=>({...d,enabled})},onChanged:{addListener:f=>changed=f}}};vm.runInNewContext(fs.readFileSync(__dirname+'/../extension/actions.js','utf8'),{document,chrome,MutationObserver:class{observe(){}},requestAnimationFrame:f=>f()});await new Promise(setImmediate);
 assert.equal(icons[0].getAttribute('aria-label'),'添加收款人');assert.equal(icons[1].getAttribute('aria-label'),'删除选中');assert.equal(icons[2].getAttribute('aria-label'),'复制末行');assert.match(icons[2].title,/最后一行/);assert.equal(icons[0].clicks,0);
 let prevented=0;keydown({target:icons[0],key:'Enter',preventDefault:()=>prevented++});assert.equal(icons[0].clicks,1);assert.equal(prevented,1);
 icons[0].setAttribute('aria-disabled','true');keydown({target:icons[0],key:'Enter',preventDefault:()=>prevented++});assert.equal(icons[0].clicks,1);icons[0].removeAttribute('aria-disabled');
 enabled=false;await changed();assert.equal(icons[0].getAttribute('role'),'img');assert.equal(icons[0].getAttribute('tabindex'),'-1');assert.equal(icons[0].getAttribute('aria-label'),'plus-circle');assert.equal(icons[0].children.length,0);
});
async function buttonFixture(source=fs.readFileSync(__dirname+'/../extension/actions.js','utf8')){
 const button=new Node('button',true),native=new Node('span',true);native.textContent='查询';button.append(native);
 button.querySelectorAll=()=>[native,...button.children.filter(n=>n.dataset.reActionLabel)];let observed,changed,enabled=true,subscriptions=0;
 const document={readyState:'complete',documentElement:{},createElement:t=>new Node(t),createElementNS:(ns,t)=>new Node(t),querySelectorAll:s=>s==='button.ant-btn'&&button.isConnected?[button]:[],addEventListener(){}};
 const sandbox={document,chrome:{storage:{local:{get:async d=>({...d,enabled})},onChanged:{addListener:f=>{changed=f;subscriptions++}}}},MutationObserver:class{constructor(f){observed=f}observe(){}},requestAnimationFrame:f=>f()};
 const context=vm.createContext(sandbox);vm.runInContext(source,context);await new Promise(setImmediate);
 return{button,native,context,get subscriptions(){return subscriptions},notify:()=>observed(),disconnect(){button.isConnected=false;for(const n of button.children)n.isConnected=false;observed()},connect(){button.isConnected=true;for(const n of button.children)n.isConnected=true;observed()},async disable(){enabled=false;await changed()},rerun(){vm.runInContext(source,context)}};
}
test('cached button disconnect and reuse leaves one decoration across repeated loading cycles',async()=>{
 const f=await buttonFixture();for(let i=0;i<5;i++){
  assert.equal(f.button.children.filter(n=>n.dataset.reActionLabel).length,1);assert.equal(f.button.children.filter(n=>n.dataset.reActionIcon).length,1);
  f.disconnect();assert.equal(f.button.children.length,1);assert.equal(f.button.getAttribute('aria-label'),null);f.connect();f.notify();
 }
 assert.equal(f.native.textContent,'查询');assert.equal(f.button.clicks,0);await f.disable();assert.equal(f.button.children.length,1);
});
test('repeated initialization does not install additional observers, icons or keyboard handlers',async()=>{
 const f=await buttonFixture();f.rerun();f.notify();await new Promise(setImmediate);assert.equal(f.subscriptions,1);assert.equal(f.button.children.length,3);
});
test('rehydration adopts one existing pair, removes stale duplicates and survives replacing children',async()=>{
 const f=await buttonFixture(),label=f.button.children.find(n=>n.dataset.reActionLabel),icon=f.button.children.find(n=>n.dataset.reActionIcon);
 label.remove();icon.remove();f.notify();assert.equal(f.button.children.length,3);assert.equal(f.button.clicks,0);
 // An independently initialized modern instance shares existing decoration nodes.
 for(let i=0;i<2;i++){const extraLabel=new Node('span',true),extraIcon=new Node('svg',true);extraLabel.dataset.reActionLabel='true';extraIcon.dataset.reActionIcon='true';f.button.append(extraIcon,extraLabel)}
 assert.equal(f.button.children.length,7);const source=fs.readFileSync(__dirname+'/../extension/actions.js','utf8');delete f.context.document[Symbol.for('reimbursement-enhancer.actions')];vm.runInContext(source,f.context);await new Promise(setImmediate);assert.equal(f.button.children.length,3);
});
