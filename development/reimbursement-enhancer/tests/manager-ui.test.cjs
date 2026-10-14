const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const source=name=>fs.readFileSync(__dirname+'/../'+name,'utf8');
const settle=()=>new Promise(resolve=>setTimeout(resolve,40));
async function setup(width=1280){
 const dom=new JSDOM('<!doctype html><body><div class="multi-tab"><div class="ant-tabs-bar"></div></div><div class="reimbursementCreate"><div class="ant-collapse-header">基本信息<span class="ant-collapse-extra"></span></div><input id="reason" value="示例事由"><select id="meal"><option>不包食宿</option></select></div><div id="form-view"></div><div id="list-view" hidden></div></body>',{url:'http://127.0.0.1:8767/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;w.innerWidth=width;w.structuredClone=structuredClone;w.ResizeObserver=class{observe(){}unobserve(){}};
 w.postMessage=data=>w.setTimeout(()=>w.dispatchEvent(new w.MessageEvent('message',{data,source:w,origin:w.location.origin})),0);
 for(const name of ['extension/memory-core-isolated.js','extension/basic-core-http-isolated.js','tests/browser/react/manager-fixture.js','extension/manager-theme.js','extension/basic-ui-http.js','extension/memory-manager.js','extension/actions.js'])w.eval(source(name));
 await settle();const s=w.document.querySelector('[data-re-manager]').shadowRoot;
 const click=text=>[...s.querySelectorAll('button')].find(b=>!b.closest('[hidden]')&&b.textContent.trim()===text).click();
 return {w,s,click,close:()=>w.close()};
}
test('actual manager edits, saves and restores recipient list without duplicate records',async()=>{
 const f=await setup();try{f.click('信息管理');await settle();f.click('编辑');assert.equal(f.s.querySelector('.record').parentElement.hidden,true);
 const name=f.s.querySelector('.editor input');name.value='示例教师乙';f.s.querySelector('.editor').dispatchEvent(new f.w.Event('submit',{cancelable:true}));await settle();await settle();
 assert.equal(f.s.querySelector('.editor'),null);assert.equal(f.s.querySelectorAll('#re-manager-history .record').length,1);assert.equal(f.s.querySelector('.recipient-name').textContent,'示例教师乙');assert.equal(f.s.querySelector('.notice').textContent,'收款信息已保存。');assert.equal(f.s.activeElement,f.s.querySelector('#re-manager-history>.primary'));
 }finally{f.close()}
});
test('template editor hides old records, cancels cleanly and tab arrows move selected panel',async()=>{
 const f=await setup();try{f.click('信息管理');await settle();f.click('基本模板');f.click('新增模板');await settle();
 const p=f.s.querySelector('#re-manager-templates');assert.equal(p.children[2].hidden,true);assert.equal(p.querySelector('.editor input').getAttribute('maxlength'),'40');f.click('取消');assert.equal(p.children[2].hidden,false);assert.equal(f.s.activeElement,p.querySelector('.primary'));
 const tabs=[...f.s.querySelectorAll('[role=tab]')];tabs[1].focus();tabs[1].dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(tabs[2].getAttribute('aria-selected'),'true');assert.equal(f.s.querySelector('#re-manager-settings').hidden,false);
 }finally{f.close()}
});
test('bank results keep input focus, announce active option and Enter selects exact bank without submitting',async()=>{
 const f=await setup();try{f.click('信息管理');await settle();f.click('新增收款信息');const bank=f.s.querySelector('[role=combobox]');bank.value='示例银行';bank.dispatchEvent(new f.w.Event('input'));await new Promise(r=>setTimeout(r,300));await settle();bank.focus();
 const press=key=>bank.dispatchEvent(new f.w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));press('ArrowDown');const list=f.s.querySelector('#'+bank.getAttribute('aria-controls'));assert.equal(list.getAttribute('role'),'listbox');assert.equal(list.children.length,2);assert.equal(f.s.activeElement,bank);assert.equal(bank.getAttribute('aria-activedescendant'),list.children[0].id);
 press('ArrowDown');assert.equal(list.children[1].getAttribute('aria-selected'),'true');press('Enter');assert.equal(bank.value,'示例银行洪山支行');assert.equal(bank.getAttribute('aria-expanded'),'false');assert.equal(bank.hasAttribute('aria-activedescendant'),false);assert.equal(f.s.activeElement.type,'password');assert.equal(f.s.querySelectorAll('#re-manager-history .record').length,1);assert.equal(f.s.querySelector('.editor button[type=submit]').disabled,false);
 }finally{f.close()}
});
test('Escape dismisses pending bank search before closing manager, and cancel returns focus to add button',async()=>{
 const f=await setup(640);try{f.click('信息管理');await settle();f.click('新增收款信息');const bank=f.s.querySelector('[role=combobox]');bank.value='示例银行';bank.dispatchEvent(new f.w.Event('input'));bank.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,300));await settle();assert.equal(f.s.querySelector('.panel').hidden,false);assert.equal(f.s.querySelectorAll('[role=option]').length,0);assert.equal(bank.getAttribute('aria-expanded'),'false');f.click('取消');assert.equal(f.s.activeElement,f.s.querySelector('#re-manager-history>.primary'));
 }finally{f.close()}
});
test('narrow manager traps keyboard focus, closes with Escape and restores trigger focus',async()=>{
 const f=await setup(960);try{f.s.querySelector('.trigger').focus();f.click('信息管理');await settle();const p=f.s.querySelector('.panel'),close=f.s.querySelector('.close'),trigger=f.s.querySelector('.trigger');assert.equal(p.getAttribute('role'),'dialog');assert.equal(p.getAttribute('aria-modal'),'true');
 close.focus();close.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));assert.equal(f.s.activeElement,f.s.querySelector('.clear-recipients'));
 f.s.activeElement.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert.equal(f.s.activeElement,close);
 await f.w.chrome.runtime.sendMessage({type:'open-info-manager'});
 f.s.activeElement.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(p.hidden,true);assert.equal(trigger.getAttribute('aria-expanded'),'false');assert.equal(p.hasAttribute('aria-modal'),false);assert.equal(f.s.activeElement,trigger);
 }finally{f.close()}
});
test('switching to list keeps local information available and disables form-only template creation',async()=>{
 const f=await setup();try{f.click('信息管理');await settle();f.w.document.body.dataset.fixtureView='list';f.w.dispatchEvent(new f.w.Event('hashchange'));await settle();
 assert.equal(f.s.querySelectorAll('#re-manager-history .record').length,1);f.click('基本模板');assert.equal(f.s.querySelector('#re-manager-templates>.primary').disabled,true);assert.equal(f.s.querySelector('.panel').hidden,false);
 }finally{f.close()}
});
