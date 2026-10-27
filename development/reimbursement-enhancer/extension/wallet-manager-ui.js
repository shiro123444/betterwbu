(() => {
 'use strict';
 const marker=Symbol.for('betterwbu.wallet-manager-ui');if(document[marker])return;document[marker]=true;
 let enabled=false,view,host,nav,folderList,search,heading,meta,status,retry,create,dialog,input,save,error,sequence=0,signature='',queued=false,mode='create',rename,remove,dialogAnchor;
 const pending=new Map(),retired=new Set();let uncertain=false,notice='';
 const route=()=>/^#\/bill\/(?:file|list)(?:\?|$)/.test(location.hash);
 function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n}
 function text(node,value){if(node.textContent!==value)node.textContent=value}
 function button(text,handler,cls=''){const n=el('button','bw-wallet-button '+cls,text);n.type='button';n.addEventListener('click',handler);return n}
 function command(action,extra={}){if(action!=='snapshot')notice='';const id=String(++sequence);window.postMessage({type:'betterwbu-wallet-command',id,action,...extra},location.origin);return id}
 function folders(){
  if(!folderList)return;const text=search.value.trim().toLocaleLowerCase();
  const rows=(view?.folders||[]).filter(f=>f.name.toLocaleLowerCase().includes(text));
  const next=JSON.stringify([rows,view?.active,view?.editing,view?.creating]);if(next===signature)return;signature=next;
  const focus=folderList.contains(document.activeElement)?document.activeElement.dataset.folder:null;folderList.replaceChildren();
  if(!rows.length){const state=view?.queries?.folders?.phase;folderList.append(el('p','bw-wallet-muted',text?'没有匹配的文件夹':state==='ready'?'尚无文件夹':state==='error'?'文件夹加载失败':'正在加载文件夹…'));return}
  for(const f of rows){const b=button('',()=>command('switch',{folder:f.id}),'bw-wallet-folder');b.dataset.folder=f.id;b.setAttribute('aria-current',String(f.id===view.active));b.disabled=!!view.editing||!!view.creating;
   b.append(el('span','bw-wallet-folder-icon',f.id==='0001'?'✓':'▱'),el('span','bw-wallet-folder-name',f.name),el('span','bw-wallet-count',String(f.count)));b.title=f.name+' · '+f.count+'张';folderList.append(b);if(f.id===focus)b.focus({preventScroll:true});
  }
 }
 function openDialog(next='create'){if(uncertain||pending.size)return;ensureDialog();dialogAnchor=document.activeElement;mode=next;const current=view?.folders.find(f=>f.id===view.active);dialog.querySelector('h2').textContent=next==='rename'?'重命名文件夹':'新建文件夹';input.value=next==='rename'?current?.name||'':'';input.disabled=false;error.textContent='';save.disabled=false;save.textContent=next==='rename'?'保存名称':'创建文件夹';dialog.showModal();input.focus()}
 function canClose(){return !save?.disabled||uncertain}
 function unresolved(){uncertain=true;error.textContent='保存结果尚未确认，可关闭此窗口并刷新页面核对文件夹，避免重复创建';save.disabled=true;save.textContent='请刷新页面确认';input.disabled=true;render()}
 function ensureDialog(){
  if(dialog)return;dialog=el('dialog','bw-wallet-dialog');dialog.dataset.bwOwned='true';dialog.setAttribute('aria-labelledby','bw-wallet-create-title');
  const form=el('form'),head=el('div','bw-wallet-dialog-head');const title=el('h2','','新建文件夹');title.id='bw-wallet-create-title';head.append(title,button('×',()=>{if(canClose())dialog.close()},'bw-wallet-close'));head.lastChild.setAttribute('aria-label','关闭文件夹窗口');
  const label=el('label','','文件夹名称');input=el('input');input.id='bw-wallet-folder-name';input.maxLength=50;input.placeholder='例如：北京会议报销';input.autocomplete='off';label.htmlFor=input.id;
  error=el('p','bw-wallet-form-error');error.setAttribute('role','alert');const actions=el('div','bw-wallet-dialog-actions');save=button('创建文件夹',()=>{},'bw-wallet-primary');save.type='submit';actions.append(button('取消',()=>{if(canClose())dialog.close()}),save);form.append(head,label,input,error,actions);dialog.append(form);document.body.append(dialog);
  input.addEventListener('input',()=>{error.textContent=''});form.addEventListener('submit',e=>{e.preventDefault();if(save.disabled||uncertain||pending.size)return;const name=input.value.trim();if(!name||name.length>50){error.textContent='请填写1至50个字符的文件夹名称';input.focus();return}if(view?.folders.some(f=>f.name===name&&(mode!=='rename'||f.id!==view.active))){error.textContent='已有同名文件夹，请换一个名称';return}save.disabled=true;input.disabled=true;save.textContent=mode==='rename'?'正在保存…':'正在创建…';const id=command(mode,{name,folder:view.active});pending.set(id,{mode,timer:setTimeout(()=>{if(pending.has(id))unresolved()},25000)})});
  dialog.addEventListener('cancel',e=>{if(!canClose())e.preventDefault()});dialog.addEventListener('close',()=>{if(canClose()&&dialogAnchor?.isConnected)dialogAnchor.focus()});
 }
 function setup(page,toolbar){
  host=el('aside','bw-wallet-sidebar');host.dataset.bwOwned='true';host.setAttribute('aria-label','发票文件夹');
  const title=el('div','bw-wallet-sidebar-title');title.append(el('strong','','我的文件夹'));create=button('+ 新建',()=>openDialog());create.setAttribute('aria-label','新建文件夹');title.append(create);
  search=el('input','bw-wallet-folder-search');search.type='search';search.placeholder='搜索文件夹';search.setAttribute('aria-label','搜索文件夹');search.addEventListener('input',folders);
  folderList=el('nav','bw-wallet-folders');folderList.setAttribute('aria-label','文件夹列表');host.append(title,search,folderList);page.prepend(host);
  nav=el('section','bw-wallet-heading');nav.dataset.bwOwned='true';const copy=el('div');heading=el('h1','','我的票据');meta=el('p','bw-wallet-muted','正在连接票据页面…');copy.append(heading,meta);retry=button('刷新',()=>{command('refresh')});const tools=el('div','bw-wallet-heading-tools');rename=button('重命名',()=>openDialog('rename'));remove=button('删除文件夹',()=>command('delete',{folder:view.active}));tools.append(rename,remove,retry);nav.append(copy,tools);toolbar.prepend(nav);
  status=el('div','bw-wallet-load-state');status.dataset.bwOwned='true';status.setAttribute('role','status');status.setAttribute('aria-live','polite');page.querySelector('.file-content-wrap')?.append(status);
 }
 function render(){
  const page=document.querySelector('.file-page'),toolbar=page?.querySelector('.file-tabs');
  const active=enabled&&route()&&page&&toolbar;
  document.documentElement.toggleAttribute('data-bw-wallet-modern',!!active);
  if(!active){host?.remove();nav?.remove();status?.remove();dialog?.close();host=nav=status=null;signature='';return}
  if(!host?.isConnected||!nav?.isConnected){host?.remove();nav?.remove();status?.remove();setup(page,toolbar);signature=''}
  folders();const current=view?.folders.find(f=>f.id===view.active);text(heading,current?.name||'我的票据');
  const fq=view?.queries?.folders?.phase||'loading',bq=view?.queries?.bills?.phase||'loading';const busy=['loading','slow'].includes(fq)||['loading','slow'].includes(bq);
  page.dataset.bwWalletLoading=String(busy);page.dataset.bwWalletError=String(fq==='error'||bq==='error');
  text(meta,busy?'正在加载票据…':view?.ready?(view.count+' 张票据'+(view.selected?' · 已选 '+view.selected+' 张':'')):'正在连接票据页面…');
  rename.hidden=remove.hidden=!current||['0000','0001'].includes(current.id);rename.disabled=remove.disabled=!!view?.creating||busy||uncertain||!!pending.size;retry.disabled=!!view?.creating||busy;create.disabled=!view?.ready||fq!=='ready'||!!view?.creating||!!view?.editing||uncertain||!!pending.size;
  const message=fq==='error'?'文件夹加载失败，请刷新重试':bq==='error'?'票据加载失败，请刷新重试':fq==='slow'||bq==='slow'?'加载时间较长，仍在等待票据服务响应…':busy?'正在加载文件夹和票据…':'';
  text(status,uncertain?'保存结果尚未确认，请刷新页面核对文件夹，避免重复创建':message||notice);status.hidden=!message&&!uncertain&&!notice;status.dataset.error=String(uncertain||fq==='error'||bq==='error');
 }
 function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;render()})}
 window.addEventListener('message',e=>{if(e.source!==window||e.origin!==location.origin)return;const m=e.data;if(m?.type==='betterwbu-wallet-view'){view=m;render()}else if(m?.type==='betterwbu-wallet-result'){
  if(retired.delete(m.id))return;const operation=pending.get(m.id);if(operation){clearTimeout(operation.timer);pending.delete(m.id);if(m.uncertain){unresolved();return}uncertain=false;notice=m.ok?m.message||'':'';save.disabled=false;input.disabled=false;save.textContent=mode==='rename'?'保存名称':'创建文件夹';if(m.ok)dialog.close();else error.textContent=m.message||'创建失败，请重试';render()}else if(!m.ok&&status){status.hidden=false;status.textContent=m.message;status.dataset.error='true'}
 }});
 async function configure(){try{const s=await chrome.storage.local.get({enabled:true,wallet:true,visual:true});enabled=s.enabled&&s.wallet&&s.visual}catch{enabled=false}window.postMessage({type:'betterwbu-wallet-config',enabled},location.origin);render();if(enabled)command('snapshot')}
 new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('hashchange',()=>{for(const [id,p]of pending){clearTimeout(p.timer);retired.add(id)}pending.clear();uncertain=false;notice='';if(save)save.disabled=false;dialog?.close();view=null;signature='';configure()});chrome.storage.onChanged.addListener(configure);configure();
})();
