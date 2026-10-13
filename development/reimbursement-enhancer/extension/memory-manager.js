(() => {
 'use strict';
 const core=window.ReimbursementMemoryCore;
 const pageVersion=chrome.runtime.getManifest().version;
 const defaults={enabled:true,totals:true,aiGuard:true,visual:true,motion:true,loader:true,wallet:true,memory:true,memoryBank:true,memoryDatabase:{},basicTemplateDatabase:{}};
 let host,shadow,panel,list,notice,scope,libraryScope,settings={},opened=false,serial=0,previousFocus,editor,editorArea,addButton,templateUI;
 const controls=new Map(),requests=new Map();
 function request(action,other={}){return new Promise(resolve=>{const id='manager-'+(++serial),timer=setTimeout(()=>{requests.delete(id);resolve(null)},5000);requests.set(id,{resolve,timer});window.postMessage({type:action.startsWith('basic-')?'reimbursement-basic-request':'reimbursement-memory-request',id,action,...other},location.origin)})}
 window.addEventListener('message',event=>{if(event.source!==window||event.origin!==location.origin||event.data?.type!=='reimbursement-memory-reply')return;const p=requests.get(event.data.id);if(p){clearTimeout(p.timer);requests.delete(event.data.id);p.resolve(event.data)}});
 function node(tag,text,className){const n=document.createElement(tag);if(text)n.textContent=text;if(className)n.className=className;return n}
 function button(text,action,label){const b=node('button',text);b.type='button';if(label)b.setAttribute('aria-label',label);const kind=/^新增/.test(text)?'plus':text==='保存'?'save':text==='取消'?'close':text==='编辑'?'edit':label?.startsWith('删除')?'trash':text==='×'?'close':null;if(kind)b.dataset.reButtonKind=kind;b.addEventListener('click',action);return b}
 async function load(){
  try{settings=await chrome.storage.local.get(defaults)}catch{if(notice)notice.textContent='插件已更新，请重新打开报销页。';return}
  for(const [key,input]of controls)input.checked=!!settings[key];
  const identity=await request('identify');let prefix;try{const u=JSON.parse(localStorage.getItem('userInfo')||'null');if(u?.id)prefix=String(u.groupId||'')+'|'+String(u.id)+'|'}catch{}
  const next=prefix&&identity?.userScope===prefix+'@recipients'?identity.userScope:null;if(next!==libraryScope)closeEditor();libraryScope=next;scope=prefix&&identity?.scope?.startsWith(prefix)?identity.scope:null;addButton.disabled=!libraryScope;render();await templateUI?.load();
 }
 function closeEditor(){if(editor)clearTimeout(editor.timer);editor=null;editorArea.replaceChildren();editorArea.hidden=true;if(addButton)addButton.hidden=false}
 function editRecipient(previous){
  if(!libraryScope)return;closeEditor();
  const draft=editor={scope:libraryScope,previous,bank:previous?.bank||null,manual:previous?.bank.kind==='manual',sequence:0,page:1};editorArea.hidden=false;addButton.hidden=true;
  const form=node('form',null,'editor');form.append(node('h3',previous?'编辑收款信息':'新增收款信息'));
  function field(label,value,type='text'){const wrap=node('label',null,'field'),input=node('input');input.type=type;input.value=value||'';input.autocomplete='off';wrap.append(node('span',label),input);form.append(wrap);return input}
  const name=field('账户名称',previous?.name);name.maxLength=100;name.required=true;
  const mode=node('label',null,'bank-mode'),manual=node('input');manual.type='checkbox';manual.checked=!!draft.manual;mode.append(manual,node('span','手填开户行'));form.append(mode);
  const bank=field('开户行',previous?.bank.name);bank.placeholder='银行名称或12位联行号';bank.maxLength=250;bank.required=true;bank.setAttribute('role','combobox');bank.setAttribute('aria-autocomplete','list');bank.setAttribute('aria-expanded','false');
  const results=node('div',null,'bank-results');results.setAttribute('role','group');results.setAttribute('aria-label','开户行搜索结果');form.append(results);
  const code=field('联行号',previous?.bank.code);code.readOnly=true;
  const account=field('银行账号',previous?.account,'password');account.inputMode='numeric';account.maxLength=40;account.required=true;
  const visibility=button('显示账号',()=>{const show=account.type==='password';account.type=show?'text':'password';visibility.textContent=show?'隐藏账号':'显示账号'});visibility.className='link';form.append(visibility);
  const status=node('div',null,'muted');status.setAttribute('role','status');form.append(status);
  async function search(page=1){
   if(draft.manual)return;const term=bank.value.trim(),token=++draft.sequence;draft.page=page;if(!term){results.replaceChildren();return}
   status.textContent='正在查询开户行…';const r=await request('search-banks',{term,page,expectedScope:draft.scope});
   if(editor!==draft||draft.manual||token!==draft.sequence||term!==bank.value.trim())return;
   if(page===1)results.replaceChildren();status.textContent=r?.ok?(r.banks.length?'请选择开户行。':'未找到开户行，可减少关键词或输入12位联行号。'):'查询失败，请重试。';bank.setAttribute('aria-expanded',String(!!r?.banks?.length));
   for(const entry of r?.banks||[]){const identity=JSON.stringify([entry.name,entry.code||entry.id]);if([...results.children].some(n=>n.dataset.bankIdentity===identity))continue;const option=button(entry.name+ (entry.code?' · '+entry.code:''),()=>{draft.bank=entry;bank.value=entry.name;code.value=entry.code;draft.sequence++;results.replaceChildren();bank.setAttribute('aria-expanded','false');status.textContent='';account.focus()});option.dataset.bankIdentity=identity;option.className='bank-option';results.append(option)}
   results.querySelector('.more')?.remove();if(r?.hasMore){const more=button('更多结果',()=>search(page+1));more.className='more';results.append(more)}
  }
  function bankChanged(){draft.bank=draft.manual?{kind:'manual',name:bank.value.trim(),code:''}:null;code.value='';draft.sequence++;results.replaceChildren();bank.setAttribute('aria-expanded','false');clearTimeout(draft.timer);status.textContent='';if(!draft.manual)draft.timer=setTimeout(()=>search(),250)}
  function modeChanged(){draft.manual=manual.checked;code.parentElement.hidden=!!draft.manual;bank.placeholder=draft.manual?'填写开户行全称':'银行名称或12位联行号';bank.setAttribute('role',draft.manual?'textbox':'combobox');bank.setAttribute('aria-autocomplete',draft.manual?'none':'list')}
  manual.addEventListener('change',()=>{modeChanged();bankChanged()});modeChanged();
  bank.addEventListener('input',bankChanged);
  bank.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();results.querySelector('button')?.focus()}});
  const actions=node('div',null,'actions'),save=button('保存',()=>{});save.type='submit';save.className='primary';actions.append(save,button('取消',closeEditor));form.append(actions);
  form.addEventListener('submit',async e=>{
   e.preventDefault();if(save.disabled)return;if(!core?.clean){status.textContent='插件初始化失败，请重新加载扩展并重新打开报销页。';return}const entry=core.clean('recipient',{name:name.value,bank:draft.bank,account:account.value});
   if(!entry){status.textContent='请填写账户名称、选择有效开户行并检查银行账号。';return}
   if(!settings.memoryBank){status.textContent='请先在设置中开启“记住银行账号”。';return}
   save.disabled=true;status.textContent=draft.manual?'正在保存…':'正在核验开户行…';
   const verified=await request('validate-recipient',{entry,expectedScope:draft.scope});
   if(editor!==draft||libraryScope!==draft.scope)return;
   const unchanged=core.clean('recipient',{name:name.value,bank:draft.bank,account:account.value});
   if(!verified?.ok||unchanged?.value!==entry.value||JSON.stringify(unchanged?.bank)!==JSON.stringify(entry.bank)){save.disabled=false;status.textContent='信息已变化或开户行核验失败，请重新保存。';return}
   const result=await chrome.runtime.sendMessage({type:'memory-save-recipient',descriptor:{scope:draft.scope,key:'recipient',context:''},entry:verified.entry,previous:draft.previous}).catch(()=>null);
   if(editor!==draft)return;save.disabled=false;
   if(result?.ok){closeEditor();notice.textContent='收款信息已保存。';await load()}else status.textContent='保存失败，记录可能已被修改，请重试。';
  });
  editorArea.append(form);name.focus();
 }
 function render(){
  list.replaceChildren();if(!libraryScope){list.append(node('p','请先登录报销系统。','muted'));return}
  if(!core?.recall){notice.textContent='插件初始化失败，请重新加载扩展并重新打开报销页。';return}
  const labels={recipient:'收款信息',applyReason:'事由',bankAccountName:'账户名称',branchBankName:'开户行',bankAccount:'银行账号'};
  const recipients=core.library(settings.memoryDatabase,libraryScope),bundledNames=new Set(recipients.map(e=>e.name));
  let count=0;const records=recipients.map(entry=>({d:{scope:libraryScope,key:'recipient',context:''},entry}));
  for(const key of Object.keys(settings.memoryDatabase||{})){
   let parts;try{parts=JSON.parse(key)}catch{continue}if(!scope||!Array.isArray(parts)||parts[0]!==scope||parts[1]==='recipient')continue;
   const d={scope:parts[0],key:parts[1],context:parts[2]};
   for(const entry of core.recall(settings.memoryDatabase,d))records.push({d,entry});
  }
  for(const {d,entry} of records){
    if(d.key==='bankAccountName'&&bundledNames.has(entry.value))continue;
    const item=node('div',null,'record'),body=node('div',null,'record-body');
    if(d.key==='recipient'){
     body.append(node('div',entry.name,'value recipient-name'),node('div',entry.bank.name,'muted'),node('div',entry.bank.kind==='manual'?'手填开户行':'联行号 '+(entry.bank.code||'未提供'),'muted'));
     const number=node('div','账号 •••• '+entry.account.slice(-4),'muted'),show=button('查看账号',()=>{const visible=show.textContent==='查看账号';number.textContent='账号 '+(visible?entry.account:'•••• '+entry.account.slice(-4));show.textContent=visible?'隐藏账号':'查看账号'}),edit=button('编辑',()=>editRecipient(entry));show.className=edit.className='link';body.append(number,show,edit);
    }
    else body.append(node('div',labels[d.key]||'','muted'),node('div',entry.label,'value'));
    const remove=button('×',async()=>{const message=d.key==='recipient'?{type:'memory-delete-recipient',scope:libraryScope,entry}:{type:'memory-delete',descriptor:d,entry};const result=await chrome.runtime.sendMessage(message).catch(()=>null);notice.textContent=result?.ok?'记录已删除。':'删除失败，请重试。';await load()},'删除这条'+(labels[d.key]||'记录'));
    item.append(body,remove);list.append(item);count++;
  }
  if(!count)list.append(node('p','暂无收款资料。','muted'));
 }
 async function toggle(next){
  opened=next;panel.hidden=!next;document.documentElement.dataset.reManagerOpen=String(next);
  if(next){previousFocus=shadow.activeElement||document.activeElement;shadow.querySelector('.close').focus();await load()}
  else{closeEditor();templateUI?.close();if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true})}
 }
 function start(){
  host=node('div');host.dataset.reManager='true';shadow=host.attachShadow({mode:'open'});
  const style=node('style');style.textContent=':host{position:fixed;inset:0;z-index:999;pointer-events:none;font:14px system-ui;color:rgba(0,0,0,.85)}*{box-sizing:border-box}button{font:inherit;border:1px solid #d9d9d9;background:#fff;color:inherit;border-radius:4px;padding:5px 10px;cursor:pointer}button:hover{border-color:#1890ff;color:#1890ff}button:focus-visible,input:focus-visible{outline:2px solid #1890ff;outline-offset:2px}.trigger{pointer-events:auto;position:absolute;right:16px;top:68px}.panel{pointer-events:auto;position:absolute;right:0;top:56px;bottom:0;width:min(360px,100vw);background:#fff;border-left:1px solid #e8e8e8;box-shadow:-4px 0 16px #0000000c;display:flex;flex-direction:column}.panel[hidden]{display:none}.heading{display:flex;justify-content:space-between;align-items:center;padding:16px;border-bottom:1px solid #f0f0f0;font-weight:600}.content{overflow:auto;padding:16px;flex:1}.label{display:flex;align-items:center;gap:8px;margin:12px 0;line-height:1.5}.label input{accent-color:#1890ff}.group{padding-bottom:16px;margin-bottom:16px;border-bottom:1px solid #f0f0f0}h3{font-size:14px;margin:0 0 12px;font-weight:600}.record{display:flex;align-items:flex-start;gap:8px;padding:10px 0;border-bottom:1px solid #f0f0f0}.record-body{min-width:0;flex:1}.record button{border:0;padding:0 7px;font-size:20px}.value{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6}.muted{color:rgba(0,0,0,.55);font-size:12px;line-height:1.6}.notice{min-height:20px;font-size:12px;color:rgba(0,0,0,.65);padding:12px 16px;border-top:1px solid #f0f0f0}';shadow.append(style);
  const trigger=button('信息管理',()=>toggle(!opened));trigger.className='trigger';trigger.setAttribute('aria-label','打开信息管理');
  panel=node('aside',null,'panel');panel.hidden=true;panel.setAttribute('role','complementary');panel.setAttribute('aria-label','信息管理');
  const heading=node('div',null,'heading'),close=button('×',()=>toggle(false),'关闭信息管理');close.className='close';heading.append(node('span','信息管理'),close);
  const content=node('div',null,'content'),templates=node('div'),preferences=node('div',null,'group');preferences.setAttribute('role','tabpanel');preferences.id='re-manager-settings';preferences.hidden=true;
  for(const [key,label]of [['enabled','启用交互优化'],['memory','自动记忆有效填写'],['memoryBank','记住银行账号'],['totals','自动汇总已填写金额'],['aiGuard','关闭自动填报与重新生成'],['visual','表单层级与留白'],['loader','统一等待状态'],['motion','等待时微动'],['wallet','优化发票夹']]){
   const line=node('label',null,'label'),input=node('input');input.type='checkbox';input.addEventListener('change',async()=>{try{await chrome.storage.local.set({[key]:input.checked})}catch{notice.textContent='设置保存失败，请重试。';await load()}});controls.set(key,input);line.append(input,node('span',label));preferences.append(line);
  }
  list=node('div');const history=node('div');history.setAttribute('role','tabpanel');history.id='re-manager-history';addButton=button('新增收款信息',()=>editRecipient());addButton.className='primary';editorArea=node('div');editorArea.hidden=true;history.append(addButton,editorArea,list);
  templates.setAttribute('role','tabpanel');templates.id='re-manager-templates';templates.hidden=true;
  const tabs=node('div',null,'tabs');tabs.setAttribute('role','tablist');
  const tabButtons=[];for(const [index,label]of ['收款资料','基本模板','设置'].entries()){
   const b=button(label,()=>{history.hidden=index!==0;templates.hidden=index!==1;preferences.hidden=index!==2;tabButtons.forEach((n,i)=>n.setAttribute('aria-selected',String(i===index)))});b.setAttribute('role','tab');b.setAttribute('aria-selected',String(index===0));b.setAttribute('aria-controls',[history.id,templates.id,preferences.id][index]);tabs.append(b);tabButtons.push(b);
  }
  tabs.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const current=tabButtons.indexOf(shadow.activeElement),next=tabButtons[(current+(e.key==='ArrowLeft'?-1:1)+tabButtons.length)%tabButtons.length];next.focus();next.click()}});
  style.textContent+=' .tabs{display:flex;gap:12px;padding:10px 16px 0;border-bottom:1px solid #f0f0f0}.tabs button{border:0;border-radius:0;padding:8px 4px}.tabs [aria-selected="true"]{color:#1890ff;border-bottom:2px solid #1890ff}[role="tabpanel"][hidden]{display:none!important}.recipient-name{font-weight:500}';
  style.textContent+=' .primary{background:#1890ff;border-color:#1890ff;color:#fff}.primary:hover{color:#fff;background:#40a9ff}button:disabled{opacity:.5;cursor:default}.editor{padding:16px 0;border-bottom:1px solid #f0f0f0;margin-bottom:16px}.field{display:flex;flex-direction:column;gap:6px;margin:12px 0}.field input{font:inherit;color:inherit;width:100%;border:1px solid #d9d9d9;border-radius:4px;padding:6px 10px;min-height:32px}.field input[readonly]{background:#fafafa;color:#595959}.actions{display:flex;gap:8px;margin-top:12px}.bank-results{max-height:180px;overflow:auto}.bank-option{display:block;width:100%;text-align:left;line-height:1.5;border:0;border-bottom:1px solid #f0f0f0;border-radius:0}.link,.record .link{font-size:12px;border:0;color:#1890ff;padding:4px 8px 4px 0}.content>div>h3{margin-top:16px}';
  content.append(history,templates,preferences);
  const clear=button('清除收款资料',async()=>{if(!libraryScope||!confirm('清除当前登录用户的全部收款资料？'))return;const result=await chrome.runtime.sendMessage({type:'memory-clear-recipients',scope:libraryScope}).catch(()=>null);notice.textContent=result?.ok?'收款资料已清除。':'清除失败，请重试。';await load()});history.append(clear);
  style.textContent+=' .close:has(svg),.record>button:has(svg){font-size:0!important;min-width:36px;min-height:36px}button:has([data-re-action-icon]){display:inline-flex;align-items:center;gap:8px}svg[data-re-action-icon]{width:18px;height:18px;flex:0 0 18px;pointer-events:none}.close svg,[aria-label^=\"删除\"] svg{width:16px;height:16px} .trigger{min-height:32px;font-size:13px;padding:5px 12px}.panel{top:var(--manager-top,104px);width:min(400px,100vw)}.heading{padding:24px;font-size:18px}.content{padding:24px}.tabs{padding-left:24px;padding-right:24px;gap:20px}.recipient-name{font-size:18px;font-weight:600;margin-bottom:8px}.record{padding:20px 0}.record .muted{line-height:1.8}.notice:empty{display:none}.field{margin:18px 0;gap:8px}.field input,.field select,.field textarea{font:inherit;font-size:16px;width:100%;border:1px solid #d9d9d9;border-radius:4px;padding:8px 10px;background:#fff;min-height:42px;color:inherit}.field textarea{resize:vertical}.actions{margin-top:20px}.link,.record .link{padding-top:8px}.tabs button{white-space:nowrap;font-size:14px}.value{font-size:16px}.muted{font-size:13px}@media(max-width:900px){.panel{width:calc(100vw - var(--manager-left,0px))}}@media(max-width:560px){.panel{width:100vw}.content{padding:20px}.heading{padding:16px 20px}}';
  style.textContent+=' .bank-mode{display:flex;align-items:center;gap:8px;margin:16px 0;font-size:14px}.bank-mode input{accent-color:#1890ff}.field[hidden]{display:none!important}.heading .close{display:grid;place-items:center;flex:0 0 32px;width:32px;height:32px;min-width:32px;min-height:32px;border:0;border-radius:50%;padding:0;gap:0;background:#f5f7fa;font-size:22px;line-height:1}.heading .close:hover{background:#eaf2ff;color:#1677ff}.heading .close svg{width:18px;height:18px;margin:0}';
  notice=node('div',null,'notice');notice.setAttribute('role','status');panel.append(heading,tabs,content,notice);shadow.append(trigger,panel);document.body.append(host);document.documentElement.dataset.reManagerReady='true';
  templateUI=window.ReimbursementBasicUI?.mount({container:templates,node,button,request,context:()=>({scope,libraryScope,settings}),notify:text=>{notice.textContent=text},openTemplates:()=>{toggle(true);tabButtons[1].click()}});
  let observed;const resize=new ResizeObserver(position);function position(){const bar=document.querySelector('.multi-tab>.ant-tabs-bar'),header=document.querySelector('.ant-layout-header');if(bar!==observed){if(observed)resize.unobserve(observed);observed=bar;if(bar)resize.observe(bar)}const r=bar?.getBoundingClientRect(),h=header?.getBoundingClientRect();const top=Math.max(0,Math.min(innerHeight-48,r?.bottom||h?.bottom||0));host.style.setProperty('--manager-top',top+'px');host.style.setProperty('--manager-left',(r?.left||0)+'px');if(r&&r.height>0){trigger.style.top=Math.max(0,r.top+(r.height-trigger.offsetHeight)/2)+'px';trigger.style.bottom='auto'}else{trigger.style.top='auto';trigger.style.bottom='16px'}}
  window.addEventListener('resize',position);window.visualViewport?.addEventListener('resize',position);window.addEventListener('hashchange',position);let queued=false;new MutationObserver(()=>{if(!queued){queued=true;requestAnimationFrame(()=>{queued=false;position()})}}).observe(document.body,{childList:true,subtree:true});position();load();
  shadow.addEventListener('keydown',e=>{if(e.key==='Escape'&&opened){e.preventDefault();e.stopPropagation();toggle(false)}});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
 chrome.storage.onChanged.addListener(load);
 window.addEventListener('hashchange',load);
 window.addEventListener('message',e=>{if(e.source===window&&e.origin===location.origin&&e.data?.type==='reimbursement-basic-ready')load()});
 chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(message?.type==='info-manager-status'){
   respond({version:pageVersion,ready:!!(host?.isConnected&&panel&&core?.recall&&window.ReimbursementBasicUI?.mount)});return;
  }
  if(message?.type==='open-info-manager'){
   if(!panel){respond({ok:false});return}
   toggle(true).then(()=>respond({ok:true}),()=>respond({ok:false}));return true;
  }
 });
})();
