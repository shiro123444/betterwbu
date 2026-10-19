(() => {
 'use strict';
 const core=window.ReimbursementMemoryCore;
 const pageVersion=chrome.runtime.getManifest().version;
 const defaults={enabled:true,totals:true,aiGuard:true,visual:true,motion:true,loader:true,wallet:true,memory:true,memoryBank:true,memoryDatabase:{},basicTemplateDatabase:{}};
 let host,shadow,panel,list,notice,scope,libraryScope,settings={},opened=false,serial=0,loadSequence=0,previousFocus,editor,editorArea,addButton,templateUI,basePanel;
 const controls=new Map(),requests=new Map();
 function request(action,other={}){return new Promise(resolve=>{const id='manager-'+(++serial),timer=setTimeout(()=>{requests.delete(id);resolve(null)},5000);requests.set(id,{resolve,timer});window.postMessage({type:action.startsWith('basic-')?'reimbursement-basic-request':'reimbursement-memory-request',id,action,...other},location.origin)})}
 window.addEventListener('message',event=>{if(event.source!==window||event.origin!==location.origin||event.data?.type!=='reimbursement-memory-reply')return;const p=requests.get(event.data.id);if(p){clearTimeout(p.timer);requests.delete(event.data.id);p.resolve(event.data)}});
 function node(tag,text,className){const n=document.createElement(tag);if(text)n.textContent=text;if(className)n.className=className;return n}
 function button(text,action,label){const b=node('button',text);b.type='button';if(label)b.setAttribute('aria-label',label);const kind=/^新增/.test(text)?'plus':text==='保存'?'save':text==='取消'?'close':text==='编辑'?'edit':label?.startsWith('删除')?'trash':text==='×'?'close':null;if(kind)b.dataset.reButtonKind=kind;b.addEventListener('click',action);return b}
 function inform(text){if(window.ReimbursementUI&&/已保存|已填充|已删除|已清除/.test(text)){notice.textContent='';window.ReimbursementUI.notify(text)}else notice.textContent=text}
 async function load(){
  const token=++loadSequence;let fresh;try{fresh=await chrome.storage.local.get(defaults)}catch{if(notice)notice.textContent='插件已更新，请重新打开报销页。';return}
  if(token!==loadSequence)return;const identity=await request('identify');if(token!==loadSequence)return;settings=fresh;for(const [key,input]of controls)input.checked=!!settings[key];host?.setAttribute('data-bw-motion',String(settings.motion));
  let prefix;try{const u=JSON.parse(localStorage.getItem('userInfo')||'null');if(u?.id)prefix=String(u.groupId||'')+'|'+String(u.id)+'|'}catch{}
  const next=prefix&&identity?.userScope===prefix+'@recipients'?identity.userScope:null;if(next!==libraryScope)closeEditor();libraryScope=next;scope=prefix&&identity?.scope?.startsWith(prefix)?identity.scope:null;addButton.disabled=!libraryScope;render();await templateUI?.load();
 }
 function closeEditor(){if(editor){clearTimeout(editor.timer);editor.choice?.destroy()}editor=null;editorArea.replaceChildren();editorArea.hidden=true;if(addButton)addButton.hidden=false;if(list)list.hidden=false;shadow?.querySelector('.clear-recipients')?.removeAttribute('hidden')}
 function editRecipient(previous){
  if(!libraryScope)return;closeEditor();notice.textContent='';
  const draft=editor={scope:libraryScope,previous,bank:previous?.bank||null,manual:previous?.bank.kind==='manual',sequence:0,page:1};editorArea.hidden=false;addButton.hidden=true;list.hidden=true;shadow.querySelector('.clear-recipients').hidden=true;
  const form=node('form',null,'editor');form.append(node('h3',previous?'编辑收款信息':'新增收款信息'));
  function field(label,value,type='text'){const wrap=node('label',null,'field'),input=node('input');input.type=type;input.value=value||'';input.autocomplete='off';wrap.append(node('span',label),input);form.append(wrap);return input}
  const name=field('账户名称',previous?.name);name.maxLength=100;name.required=true;
  const mode=node('label',null,'bank-mode'),manual=node('input');manual.type='checkbox';manual.checked=!!draft.manual;mode.append(manual,node('span','手填开户行'));form.append(mode);
  const bank=field('开户行',previous?.bank.name);bank.placeholder='银行名称或12位联行号';bank.maxLength=250;bank.required=true;bank.setAttribute('role','combobox');bank.setAttribute('aria-autocomplete','list');bank.setAttribute('aria-expanded','false');
  const results=node('div',null,'bank-results'),options=node('div',null,'bank-options');results.hidden=true;options.id='re-manager-bank-options';options.setAttribute('role','listbox');options.setAttribute('aria-label','开户行搜索结果');results.append(options);bank.setAttribute('aria-controls',options.id);form.append(results);let active=-1;
  function clearResults(){options.replaceChildren();results.querySelector('.more')?.remove();results.hidden=true;active=-1;bank.removeAttribute('aria-activedescendant');if(!draft.manual)bank.setAttribute('aria-expanded','false');else bank.removeAttribute('aria-expanded')}
  function activate(index){const rows=[...options.children];if(!rows.length)return;active=(index+rows.length)%rows.length;for(const [i,row]of rows.entries())row.setAttribute('aria-selected',String(i===active));bank.setAttribute('aria-activedescendant',rows[active].id);rows[active].scrollIntoView?.({block:'nearest'})}
  const code=field('联行号',previous?.bank.code);code.readOnly=true;
  const account=field('银行账号',previous?.account,'password');account.inputMode='numeric';account.maxLength=40;account.required=true;
  const visibility=button('显示账号',()=>{const show=account.type==='password';account.type=show?'text':'password';visibility.textContent=show?'隐藏账号':'显示账号'});visibility.className='link';form.append(visibility);
  const status=node('div',null,'muted');status.setAttribute('role','status');form.append(status);
  async function search(page=1){
   if(draft.manual)return;const term=bank.value.trim(),token=++draft.sequence;draft.page=page;if(!term){clearResults();return}
   status.textContent='正在查询开户行…';const r=await request('search-banks',{term,page,expectedScope:draft.scope});
   if(editor!==draft||draft.manual||token!==draft.sequence||term!==bank.value.trim())return;
   if(page===1)clearResults();const rows=r?.ok&&Array.isArray(r.banks)?r.banks:[];status.textContent=r?.ok?(rows.length?'请选择开户行。':'未找到开户行，可减少关键词或输入12位联行号。'):'查询失败，请重试。';
   for(const entry of rows){const identity=JSON.stringify([entry.name,entry.code||entry.id]);if([...options.children].some(n=>n.dataset.bankIdentity===identity))continue;const option=button(entry.name+ (entry.code?' · '+entry.code:''),()=>{draft.bank=entry;bank.value=entry.name;code.value=entry.code;draft.sequence++;clearResults();status.textContent='';account.focus()});option.dataset.bankIdentity=identity;option.className='bank-option';option.id=options.id+'-'+options.children.length;option.setAttribute('role','option');option.setAttribute('aria-selected','false');option.tabIndex=-1;options.append(option)}
   results.querySelector('.more')?.remove();if(r?.hasMore){const more=button('更多结果',()=>search(page+1));more.className='more';results.append(more)}
   results.hidden=!options.children.length&&!r?.hasMore;bank.setAttribute('aria-expanded',String(!!options.children.length));
  }
  function bankChanged(){draft.bank=draft.manual?{kind:'manual',name:bank.value.trim(),code:''}:null;code.value='';draft.sequence++;clearResults();clearTimeout(draft.timer);draft.timer=null;status.textContent='';if(!draft.manual&&!draft.choice)draft.timer=setTimeout(()=>{draft.timer=null;search()},250)}
  function modeChanged(){draft.manual=manual.checked;code.parentElement.hidden=!!draft.manual;bank.placeholder=draft.manual?'填写开户行全称':'银行名称或12位联行号';bank.setAttribute('role',draft.manual?'textbox':'combobox');if(draft.choice){bank.hidden=!draft.manual;bank.required=!!draft.manual;draft.choice.setHidden(!!draft.manual);draft.choice.setValue(null)}if(draft.manual){bank.removeAttribute('aria-autocomplete');bank.removeAttribute('aria-controls');bank.removeAttribute('aria-expanded')}else{bank.setAttribute('aria-autocomplete','list');bank.setAttribute('aria-controls',options.id);bank.setAttribute('aria-expanded','false')}}
  manual.addEventListener('change',()=>{modeChanged();bankChanged()});modeChanged();
  bank.addEventListener('input',bankChanged);
  bank.addEventListener('keydown',e=>{if(draft.manual)return;const count=options.children.length;if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(count)activate(active<0?(e.key==='ArrowDown'?0:count-1):active+(e.key==='ArrowDown'?1:-1));else{clearTimeout(draft.timer);draft.timer=null;search()}}else if(count&&(e.key==='Home'||e.key==='End')){e.preventDefault();activate(e.key==='Home'?0:count-1)}else if(e.key==='Enter'&&(count||draft.timer||status.textContent==='正在查询开户行…')){e.preventDefault();if(active>=0)options.children[active].click()}else if(e.key==='Escape'&&(count||draft.timer||status.textContent==='正在查询开户行…')){e.preventDefault();e.stopPropagation();draft.sequence++;clearTimeout(draft.timer);draft.timer=null;clearResults();status.textContent=''}else if(e.key==='Tab'){draft.sequence++;clearTimeout(draft.timer);draft.timer=null;clearResults();status.textContent=''}});
  const actions=node('div',null,'actions'),save=button('保存',()=>{});save.type='submit';save.className='primary';actions.append(save,button('取消',()=>{closeEditor();addButton.focus()}));form.append(actions);
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
   if(result?.ok){closeEditor();await load();inform('收款信息已保存。');if(opened&&!editor&&!addButton.closest('[hidden]'))addButton.focus()}else status.textContent='保存失败，记录可能已被修改，请重试。';
  });
  editorArea.append(form);
  if(window.ReimbursementUI){const mount=node('div');bank.after(mount);bank.hidden=!draft.manual;bank.required=!!draft.manual;draft.choice=window.ReimbursementUI.mountChoice({container:mount,label:'开户行',placeholder:'银行名称或12位联行号',required:true,initialValue:previous?.bank,onEscape:()=>toggle(false),
   load:(term,page)=>term.trim()?request('search-banks',{term:term.trim(),page,expectedScope:draft.scope}):Promise.resolve({ok:true,banks:draft.bank?[draft.bank]:[]}),
   onInput:value=>{bank.value=value;bankChanged()},onValue:entry=>{if(!entry)return;draft.bank=entry;bank.value=entry.name;code.value=entry.code||'';draft.sequence++;status.textContent='';account.focus()}});draft.choice.setHidden(!!draft.manual)}
  name.focus();
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
    const remove=button('×',async()=>{const message=d.key==='recipient'?{type:'memory-delete-recipient',scope:libraryScope,entry}:{type:'memory-delete',descriptor:d,entry};const result=await chrome.runtime.sendMessage(message).catch(()=>null);inform(result?.ok?'记录已删除。':'删除失败，请重试。');await load()},'删除这条'+(labels[d.key]||'记录'));
    item.append(body,remove);list.append(item);count++;
  }
  if(!count)list.append(node('p','暂无收款资料。','muted'));
 }
 async function toggle(next){
  const wasOpened=opened;
  opened=next;panel.hidden=basePanel?false:!next;basePanel?.setOpen(next);shadow.querySelector('.trigger').setAttribute('aria-expanded',String(next));document.documentElement.dataset.reManagerOpen=String(next);
  if(next){if(!wasOpened)previousFocus=shadow.activeElement||document.activeElement;shadow.querySelector('.close').focus();window.dispatchEvent(new Event('resize'));await load()}
  else{closeEditor();templateUI?.close();window.dispatchEvent(new Event('resize'));if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true})}
 }
 function start(){
  host=node('div');host.dataset.reManager='true';shadow=host.attachShadow({mode:'open'});
  const style=node('style');style.textContent=window.ReimbursementSidebarTheme||':host{position:fixed;inset:0;z-index:999;pointer-events:none;font:16px system-ui}.panel{pointer-events:auto;position:absolute;right:0;top:var(--manager-top,0px);bottom:0;width:min(400px,100vw);background:white;overflow:auto}.trigger{pointer-events:auto;position:absolute;right:24px;top:68px}[hidden]{display:none!important}';shadow.append(style);
  const trigger=button('信息管理',()=>toggle(!opened));trigger.className='trigger';trigger.setAttribute('aria-label','打开信息管理');
  panel=node('aside',null,'panel');panel.hidden=true;panel.setAttribute('role','complementary');panel.setAttribute('aria-label','信息管理');panel.id='re-info-manager-panel';trigger.setAttribute('aria-controls',panel.id);trigger.setAttribute('aria-expanded','false');
  const heading=node('div',null,'heading'),close=button('×',()=>toggle(false),'关闭信息管理');close.className='close';heading.append(node('span','信息管理'),close);
  const content=node('div',null,'content'),templates=node('div'),preferences=node('div',null,'group');preferences.setAttribute('role','tabpanel');preferences.id='re-manager-settings';preferences.hidden=true;
  const settingsGroups=new Map();
  for(const [key,label,group]of [['enabled','启用交互优化',''],['memory','自动记忆','填报'],['memoryBank','记住银行账号','填报'],['totals','自动汇总金额','填报'],['aiGuard','关闭自动生成','填报'],['visual','统一界面','显示'],['loader','加载反馈','显示'],['motion','动态效果','显示'],['wallet','发票夹布局','显示']]){
   let parent=preferences;if(group){if(!settingsGroups.has(group)){const section=node('fieldset',null,'settings-group');section.append(node('legend',group));preferences.append(section);settingsGroups.set(group,section)}parent=settingsGroups.get(group)}
   const line=node('label',null,'label'),input=node('input');input.type='checkbox';input.addEventListener('change',async()=>{try{await chrome.storage.local.set({[key]:input.checked});inform('设置已保存。')}catch{notice.textContent='设置保存失败，请重试。';await load()}});controls.set(key,input);line.append(input,node('span',label));parent.append(line);
  }
  list=node('div');const history=node('div');history.setAttribute('role','tabpanel');history.id='re-manager-history';addButton=button('新增收款信息',()=>editRecipient());addButton.className='primary';editorArea=node('div');editorArea.hidden=true;history.append(addButton,editorArea,list);
  templates.setAttribute('role','tabpanel');templates.id='re-manager-templates';templates.hidden=true;
  const tabs=node('div',null,'tabs');tabs.setAttribute('role','tablist');
  const tabButtons=[];for(const [index,label]of ['收款资料','基本模板','设置'].entries()){
   const b=button(label,()=>{history.hidden=index!==0;templates.hidden=index!==1;preferences.hidden=index!==2;tabButtons.forEach((n,i)=>{n.setAttribute('aria-selected',String(i===index));n.tabIndex=i===index?0:-1})});b.id='re-manager-tab-'+index;b.setAttribute('role','tab');b.tabIndex=index===0?0:-1;b.setAttribute('aria-selected',String(index===0));[history,templates,preferences][index].setAttribute('aria-labelledby',b.id);b.setAttribute('aria-controls',[history.id,templates.id,preferences.id][index]);tabs.append(b);tabButtons.push(b);
  }
  tabs.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const current=tabButtons.indexOf(shadow.activeElement),next=tabButtons[e.key==='Home'?0:e.key==='End'?tabButtons.length-1:(current+(e.key==='ArrowLeft'?-1:1)+tabButtons.length)%tabButtons.length];next.focus();next.click()}});
  content.append(history,templates,preferences);
  const clear=button('清除收款资料',async()=>{const targetScope=libraryScope;if(!targetScope||!(await (window.ReimbursementUI?window.ReimbursementUI.confirm('清除收款资料','清除当前登录用户的全部收款资料？'):Promise.resolve(confirm('清除当前登录用户的全部收款资料？'))))||targetScope!==libraryScope)return;const result=await chrome.runtime.sendMessage({type:'memory-clear-recipients',scope:libraryScope}).catch(()=>null);inform(result?.ok?'收款资料已清除。':'清除失败，请重试。');await load()});clear.className='clear-recipients';history.append(clear);
  notice=node('div',null,'notice');notice.setAttribute('role','status');panel.append(heading,tabs,content,notice);shadow.append(trigger,panel);document.body.append(host);document.documentElement.dataset.reManagerReady='true';
  templateUI=window.ReimbursementBasicUI?.mount({container:templates,node,button,request,context:()=>({scope,libraryScope,settings}),notify:inform,openTemplates:()=>{toggle(true);tabButtons[1].click()}});
  let observed;const resize=new ResizeObserver(position);function position(){if(basePanel)panel.removeAttribute('aria-label');panel.setAttribute('role',basePanel?'presentation':innerWidth<=1100&&opened?'dialog':'complementary');if(!basePanel&&innerWidth<=1100&&opened)panel.setAttribute('aria-modal','true');else panel.removeAttribute('aria-modal');const bar=document.querySelector('.multi-tab>.ant-tabs-bar'),header=document.querySelector('.ant-layout-header');if(bar!==observed){if(observed)resize.unobserve(observed);observed=bar;if(bar)resize.observe(bar)}const r=bar?.getBoundingClientRect(),h=header?.getBoundingClientRect();const top=Math.max(0,Math.min(innerHeight-48,r?.bottom||h?.bottom||0));host.style.setProperty('--manager-top',top+'px');host.style.setProperty('--manager-left',(r?.left||0)+'px');if(r&&r.height>0){trigger.style.top=Math.max(0,r.top+(r.height-trigger.offsetHeight)/2)+'px';trigger.style.bottom='auto'}else{trigger.style.top='auto';trigger.style.bottom='16px'}}
  window.addEventListener('resize',position);window.visualViewport?.addEventListener('resize',position);window.addEventListener('hashchange',position);let queued=false;new MutationObserver(()=>{if(!queued){queued=true;requestAnimationFrame(()=>{queued=false;position()})}}).observe(document.body,{childList:true,subtree:true});position();load();
  if(window.ReimbursementUI){basePanel=window.ReimbursementUI.mountPanel({container:shadow,panel,trigger,onOpenChange:toggle});panel.hidden=false}
  shadow.addEventListener('keydown',e=>{if(basePanel)return;if(e.key==='Tab'&&opened&&innerWidth<=1100){const nodes=[...panel.querySelectorAll('button,input,select,textarea,[tabindex]')].filter(n=>!n.disabled&&n.tabIndex>=0&&!n.closest('[hidden]'));const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&shadow.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&shadow.activeElement===last){e.preventDefault();first?.focus()}}if(e.key==='Escape'&&opened){e.preventDefault();e.stopPropagation();toggle(false)}});
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
