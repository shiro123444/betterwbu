const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const code=name=>fs.readFileSync(__dirname+'/../extension/'+name,'utf8'),flush=()=>new Promise(r=>setTimeout(r,35));
function fixture(ui=false,options={}){
 const dom=new JSDOM('<div id="app"><div class="file-page"><div class="file-content-wrap"><div class="file-tabs"><div class="tabs-swipe">原生文件夹</div><div class="tabs-tool"></div></div><div class="file-list"><div class="ant-empty">暂无数据</div></div></div></div></div>',{url:'http://wsbx.wbu.edu.cn/bill-wallet-web/#/bill/file',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,messages=[],calls=[],watch=[];let changed;w.postMessage=m=>messages.push(m);
 if(options.fastDeadline){const timeout=w.setTimeout.bind(w);w.setTimeout=(fn,ms,...args)=>timeout(fn,ms===25000?10:ms,...args)}
 const message=data=>w.dispatchEvent(new w.MessageEvent('message',{source:w,origin:w.location.origin,data}));
 const v={folderData:[{folderId:'0000',name:'发票夹',billCount:2},{folderId:'custom',name:'会议',billCount:0}],sourceData:[{}],condition:{folderId:'0000'},totalRecord:2,checkedValues:[],activeEdit:'',$children:[],$watch:(k,fn)=>{watch.push(fn);return()=>{}},tabChange(f){calls.push(['switch',f]);this.condition.folderId=f.folderId},getFolder:async()=>calls.push(['folders']),getInfo:()=>calls.push(['bills']),onDeleteFolder:id=>calls.push(['delete',id]),$http:async cfg=>{calls.push(['http',cfg]);return{success:true}}};
 w.document.querySelector('#app').__vue__=v;
 class XHR extends w.EventTarget{open(method,url){this.url=url}send(){}complete(status,body){this.status=status;this.responseText=JSON.stringify(body);this.dispatchEvent(new w.Event('loadend'))}}
 w.XMLHttpRequest=XHR;w.chrome={storage:{local:{get:async()=>({enabled:true,wallet:true,visual:true})},onChanged:{addListener:fn=>changed=fn}}};
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'))};
 w.eval(code('site.js'));
 w.eval(code(ui?'wallet-manager-ui.js':'wallet-manager.js'));
 return {w,v,calls,messages,message,async disable(){w.chrome.storage.local.get=async()=>({enabled:false});await changed();await flush()},close:()=>dom.window.close()};
}
test('bridge publishes all folders and switches only known IDs without startup writes',async()=>{
 const f=fixture();try{f.message({type:'betterwbu-wallet-config',enabled:true});await flush();assert.ok(f.messages.some(m=>m.type==='betterwbu-wallet-view'&&m.folders.length===2));assert.equal(f.calls.length,0);
 f.message({type:'betterwbu-wallet-command',id:'1',action:'switch',folder:'missing'});await flush();assert.equal(f.calls.length,0);assert.equal(f.messages.find(m=>m.id==='1').ok,false);
 f.message({type:'betterwbu-wallet-command',id:'2',action:'switch',folder:'custom'});await flush();assert.equal(f.calls[0][0],'switch');assert.equal(f.v.condition.folderId,'custom');
 }finally{f.close()}
});
test('failed responses stay errors; a successful empty folder response is ready',async()=>{
 const f=fixture();try{f.message({type:'betterwbu-wallet-config',enabled:true});await flush();const x=new f.w.XMLHttpRequest();x.open('POST','/bill-wallet/folder/manage/getMyFolderByCondition.json');x.send();await flush();assert.equal(f.messages.at(-1).queries.folders.phase,'loading');x.complete(500,{message:'down'});await flush();assert.equal(f.messages.at(-1).queries.folders.phase,'error');
 const y=new f.w.XMLHttpRequest();y.open('POST','/bill-wallet/folder/manage/getMyFolderByCondition.json');y.send();y.complete(200,{success:true,info:[]});await flush();assert.equal(f.messages.at(-1).queries.folders.phase,'ready');
 }finally{f.close()}
});
test('names and system folders are validated before native folder writes',async()=>{
 const f=fixture();try{f.message({type:'betterwbu-wallet-config',enabled:true});await flush();for(const [id,action,rest]of [['1','create',{name:' '}],['2','create',{name:'会议'}],['3','rename',{folder:'0000',name:'变更'}],['4','delete',{folder:'0001'}]])f.message({type:'betterwbu-wallet-command',id,action,...rest});await flush();assert.equal(f.calls.length,0);
 f.message({type:'betterwbu-wallet-command',id:'5',action:'rename',folder:'custom',name:'修改名称'});await flush();const cfg=f.calls.find(c=>c[0]==='http')[1];assert.equal(cfg.url,'/bill-wallet/folder/manage/saveOrUpdateFolder.json');assert.deepEqual(JSON.parse(JSON.stringify(cfg.data)),{folderName:'修改名称',id:'custom'});
 }finally{f.close()}
});
const view={type:'betterwbu-wallet-view',ready:true,folders:[{id:'0000',name:'发票夹',count:2},{id:'custom',name:'会议',count:0}],active:'0000',count:2,selected:0,queries:{folders:{phase:'ready'},bills:{phase:'ready'}}};
test('UI searches folders and requires an explicit create submission; disabling restores native controls',async()=>{
 const f=fixture(true);try{await flush();f.message(view);await flush();assert.equal(f.w.document.querySelectorAll('.bw-wallet-folder').length,2);const s=f.w.document.querySelector('.bw-wallet-folder-search');s.value='会议';s.dispatchEvent(new f.w.Event('input'));assert.equal(f.w.document.querySelectorAll('.bw-wallet-folder').length,1);
 f.w.document.querySelector('.bw-wallet-sidebar-title button').click();assert.ok(f.w.document.querySelector('dialog').hasAttribute('open'));assert.equal(f.messages.filter(m=>m.action==='create').length,0);
 f.w.document.querySelector('dialog input').value='新会议';f.w.document.querySelector('form').dispatchEvent(new f.w.Event('submit',{cancelable:true}));const request=f.messages.find(m=>m.action==='create');assert.equal(request.name,'新会议');f.message({type:'betterwbu-wallet-result',id:request.id,ok:false,message:'服务异常'});assert.match(f.w.document.querySelector('[role="alert"]').textContent,/服务异常/);
 await f.disable();assert.equal(f.w.document.documentElement.hasAttribute('data-bw-wallet-modern'),false);assert.equal(f.w.document.querySelector('.bw-wallet-sidebar'),null);
 }finally{f.close()}
});
test('UI distinguishes loading, failure and a genuine empty folder',async()=>{
 const f=fixture(true);try{await flush();f.message({...view,count:0,queries:{folders:{phase:'ready'},bills:{phase:'loading'}}});await flush();assert.equal(f.w.document.querySelector('.file-page').dataset.bwWalletLoading,'true');assert.match(f.w.document.querySelector('[role="status"]').textContent,/正在加载/);
 f.message({...view,count:0,queries:{folders:{phase:'ready'},bills:{phase:'error'}}});await flush();assert.match(f.w.document.querySelector('[role="status"]').textContent,/票据加载失败/);assert.equal(f.w.document.querySelector('.bw-wallet-heading button:last-child').disabled,false);
 f.message({...view,count:0});await flush();assert.equal(f.w.document.querySelector('[role="status"]').hidden,true);
 }finally{f.close()}
});
test('query deadline bounds native read hangs and retains a shorter native timeout',async()=>{
 const f=fixture();try{f.message({type:'betterwbu-wallet-config',enabled:true});await flush();const x=new f.w.XMLHttpRequest();x.open('POST','/bill-wallet/folder/manage/getMyFolderByCondition.json');x.timeout=0;x.send();assert.equal(x.timeout,20000);x.complete(0,null);const y=new f.w.XMLHttpRequest();y.open('POST','/bill-wallet/bill/manage/findBillFolderCardList.json');y.timeout=5000;y.send();assert.equal(y.timeout,5000);y.complete(0,null)}finally{f.close()}
});
test('host shows early status and accepts readiness only from its own iframe',async()=>{
 const d=new JSDOM('<div><iframe class="iframe-box" src="about:blank"></iframe></div>',{url:'http://wsbx.wbu.edu.cn/workbench-web/#/mineFold',runScripts:'outside-only',pretendToBeVisual:true});const w=d.window;try{w.chrome={storage:{local:{get:async()=>({enabled:true,wallet:true,visual:true})},onChanged:{addListener(){}}}};w.eval(code('wallet-host.js'));await flush();const b=w.document.querySelector('.bw-wallet-host-state');assert.equal(b.hidden,false);assert.match(b.textContent,/正在连接发票夹/);
 const send=source=>w.dispatchEvent(new w.MessageEvent('message',{origin:w.location.origin,source,data:view}));send(w);assert.equal(b.hidden,false);send(w.document.querySelector('iframe').contentWindow);assert.equal(b.hidden,true);
 }finally{d.window.close()}
});

test('missing create reply times out, permits closing, blocks duplicate writes and accepts a late result',async()=>{
 const f=fixture(true,{fastDeadline:true});try{
  await flush();f.message(view);f.w.document.querySelector('.bw-wallet-sidebar-title button').click();
  const dialog=f.w.document.querySelector('dialog'),form=dialog.querySelector('form'),save=dialog.querySelector('[type="submit"]');
  dialog.querySelector('input').value='新会议';form.dispatchEvent(new f.w.Event('submit',{cancelable:true}));
  const request=f.messages.find(m=>m.action==='create');await flush();
  assert.match(dialog.querySelector('[role="alert"]').textContent,/保存结果尚未确认/);assert.equal(save.disabled,true);
  form.dispatchEvent(new f.w.Event('submit',{cancelable:true}));assert.equal(f.messages.filter(m=>m.action==='create').length,1);
  dialog.querySelector('.bw-wallet-dialog-actions button').click();assert.equal(dialog.open,false);assert.equal(f.w.document.querySelector('.bw-wallet-sidebar-title button').disabled,true);
  f.message({type:'betterwbu-wallet-result',id:request.id,ok:true});assert.equal(f.w.document.querySelector('.bw-wallet-sidebar-title button').disabled,false);
 }finally{f.close()}
});
test('rename waits use a save label and ambiguous transport failures require verification before another write',async()=>{
 const f=fixture(true);try{
  await flush();f.message({...view,active:'custom'});[...f.w.document.querySelectorAll('button')].find(b=>b.textContent==='重命名').click();
  const dialog=f.w.document.querySelector('dialog'),form=dialog.querySelector('form'),save=dialog.querySelector('[type="submit"]');dialog.querySelector('input').value='改名';form.dispatchEvent(new f.w.Event('submit',{cancelable:true}));
  assert.equal(save.textContent,'正在保存…');const request=f.messages.find(m=>m.action==='rename');
  f.message({type:'betterwbu-wallet-result',id:request.id,ok:false,uncertain:true});assert.equal(save.disabled,true);assert.match(dialog.querySelector('[role="alert"]').textContent,/避免重复创建/);
  const cancel=new f.w.Event('cancel',{cancelable:true});dialog.dispatchEvent(cancel);assert.equal(cancel.defaultPrevented,false);
 }finally{f.close()}
});
test('route changes retire old creation deadlines and ignore late errors on the new view',async()=>{
 const f=fixture(true,{fastDeadline:true});try{
  await flush();f.message(view);f.w.document.querySelector('.bw-wallet-sidebar-title button').click();f.w.document.querySelector('dialog input').value='旧页面';f.w.document.querySelector('dialog form').dispatchEvent(new f.w.Event('submit',{cancelable:true}));const request=f.messages.find(m=>m.action==='create');
  f.w.dispatchEvent(new f.w.Event('hashchange'));await flush();f.message(view);f.message({type:'betterwbu-wallet-result',id:request.id,ok:false,message:'旧页面失败'});await flush();
  assert.equal(f.w.document.querySelector('dialog').open,false);assert.equal(f.w.document.querySelector('.bw-wallet-sidebar-title button').disabled,false);assert.equal(f.w.document.querySelector('[role="status"]').hidden,true);
 }finally{f.close()}
});
test('known save success with a failed list refresh remains visible after the dialog closes',async()=>{
 const f=fixture(true);try{
  await flush();f.message(view);f.w.document.querySelector('.bw-wallet-sidebar-title button').click();f.w.document.querySelector('dialog input').value='已保存';f.w.document.querySelector('dialog form').dispatchEvent(new f.w.Event('submit',{cancelable:true}));const request=f.messages.find(m=>m.action==='create');
  f.message({type:'betterwbu-wallet-result',id:request.id,ok:true,message:'文件夹已保存，但列表更新失败，请刷新后确认'});
  assert.equal(f.w.document.querySelector('dialog').open,false);assert.match(f.w.document.querySelector('[role="status"]').textContent,/已保存.*列表更新失败/);
 }finally{f.close()}
});
