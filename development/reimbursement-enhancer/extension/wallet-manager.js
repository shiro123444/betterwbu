(() => {
 'use strict';
 const marker=Symbol.for('betterwbu.wallet-manager');if(window[marker])return;window[marker]=true;
 const route=()=>/^#\/bill\/(?:file|list)(?:\?|$)/.test(location.hash);
 let enabled=false,vm,unwatch=[],queued=false,creating=false,serial=0;
 const queries={folders:{phase:'loading',serial:0},bills:{phase:'loading',serial:0}};
 function publish(){
  if(!enabled||!route())return;
  if(vm&&!queries.folders.serial&&vm.folderData.length)queries.folders.phase='ready';
  if(vm&&!queries.bills.serial&&vm.init&&!vm.spinning)queries.bills.phase='ready';
  const folders=(vm?.folderData||[]).filter(f=>f&&f.folderId).map(f=>({id:String(f.folderId),name:String(f.name||''),count:Number(f.billCount)||0}));
  const message={type:'betterwbu-wallet-view',ready:!!vm,folders,active:String(vm?.condition?.folderId||''),count:Number(vm?.totalRecord)||0,selected:vm?.checkedValues?.length||0,editing:!!vm?.activeEdit,creating,queries:Object.fromEntries(Object.entries(queries).map(([k,q])=>[k,{phase:q.phase}]))};window.postMessage(message,location.origin);if(window.parent!==window)window.parent.postMessage(message,location.origin);
 }
 function queue(){if(!queued){queued=true;requestAnimationFrame(()=>{queued=false;scan();publish()})}}
 function scan(){
  if(!route())return;
  const q=[document.querySelector('#app')?.__vue__],seen=new Set();let found;
  while(q.length){const v=q.shift();if(!v||seen.has(v))continue;seen.add(v);if(Array.isArray(v.folderData)&&Array.isArray(v.sourceData)&&typeof v.tabChange==='function'&&typeof v.getFolder==='function'){found=v;break}q.push(...v.$children||[])}
  if(found===vm)return;
  for(const stop of unwatch)stop();unwatch=[];vm=found;
  if(!vm)return;
  if(vm.folderData.length&&queries.folders.phase==='loading'&&!queries.folders.pending)queries.folders.phase='ready';
  if((vm.sourceData.length||(vm.init&&!vm.spinning))&&queries.bills.phase==='loading'&&!queries.bills.pending)queries.bills.phase='ready';
  for(const key of ['folderData','condition.folderId','sourceData','totalRecord','checkedValues','activeEdit'])unwatch.push(vm.$watch(key,queue,{deep:key==='folderData'}));
 }
 // Observe the native read requests without changing their credentials, data or responses.
 const proto=XMLHttpRequest.prototype,open=proto.open,send=proto.send,paths=new WeakMap();
 proto.open=function(method,url,...rest){let kind;try{const u=new URL(String(url),location.href);if(window.ReimbursementSite.messageOrigin(u.origin,location)){if(u.pathname==='/bill-wallet/folder/manage/getMyFolderByCondition.json')kind='folders';if(u.pathname==='/bill-wallet/bill/manage/findBillFolderCardList.json')kind='bills'}}catch{}paths.set(this,kind);return open.call(this,method,url,...rest)};
 proto.send=function(...args){
  const kind=paths.get(this);if(!kind||!route())return send.apply(this,args);
  const q=queries[kind],id=++serial;q.serial=id;q.phase='loading';q.pending=true;
  const slow=setTimeout(()=>{if(q.serial===id&&q.pending){q.phase='slow';queue()}},12000);
  const done=()=>{clearTimeout(slow);if(q.serial!==id)return;q.pending=false;let body;try{body=this.responseType==='json'?this.response:JSON.parse(this.responseText)}catch{}
   q.phase=this.status>=200&&this.status<300&&body?.success!==false&&(kind==='folders'?Array.isArray(body?.info):!!body?.data&&Array.isArray(body.data.billCardList||body.data.unIdentInstanceVOList))?'ready':'error';queue();};
  this.addEventListener('loadend',done,{once:true});if(enabled&&(!this.timeout||this.timeout>20000))this.timeout=20000;queue();try{return send.apply(this,args)}catch(error){clearTimeout(slow);q.pending=false;q.phase='error';queue();throw error}
 };
 function reply(id,ok,message,uncertain=false){window.postMessage({type:'betterwbu-wallet-result',id,ok,message,uncertain},location.origin)}
 async function command(m){
  scan();if(!enabled||!route()||!vm||vm._isDestroyed){reply(m.id,false,'票据页面尚未就绪，请稍后重试');return}
  let ownsBusy=false,submitted=false,saved=false;const target=vm;
  try{
   if(m.action==='switch'){
    if(creating)throw Error('文件夹正在保存，请稍后切换');
    const f=target.folderData.find(f=>String(f.folderId)===m.folder);if(!f)throw Error('文件夹已变化，请刷新后重试');if(target.activeEdit)throw Error('请先完成当前文件夹编辑');if(String(target.condition.folderId)!==m.folder)target.tabChange(f);
   }else if(m.action==='refresh'){
    if(creating||target.activeEdit)throw Error('请先完成当前文件夹编辑');
    if(queries.folders.pending||queries.bills.pending)throw Error('请求仍在进行中，请稍后重试');
    target.getFolder();target.getInfo();
   }else if(m.action==='delete'){
    const f=target.folderData.find(f=>String(f.folderId)===m.folder);if(!f||['0000','0001'].includes(m.folder))throw Error('此文件夹不可删除');
    if(creating||target.activeEdit)throw Error('请先完成当前文件夹编辑');
    target.onDeleteFolder(f.folderId);
   }else if(['create','rename'].includes(m.action)){
    if(creating||target.activeEdit)throw Error('请先完成当前文件夹编辑');
    const name=String(m.name||'').trim();if(!name||name.length>50)throw Error('文件夹名称请填写1至50个字符');
    if(target.folderData.some(f=>f.name===name&&String(f.folderId)!==(m.action==='rename'?m.folder:'')))throw Error('已有同名文件夹，请换一个名称');
    const data={folderName:name};if(m.action==='rename'){const f=target.folderData.find(f=>String(f.folderId)===m.folder);if(!f||['0000','0001'].includes(m.folder))throw Error('此文件夹不可重命名');data.id=f.folderId}
    creating=true;ownsBusy=true;publish();
    submitted=true;
    const result=await target.$http({url:'/bill-wallet/folder/manage/saveOrUpdateFolder.json',method:'post',data,timeout:20000});
    submitted=false;
    if(result?.success!==true)throw Error(String(result?.message||'创建失败，请重试'));
    saved=true;
    if(target._isDestroyed){reply(m.id,true,'文件夹已保存，请返回发票夹刷新');return}
    await target.getFolder();
    const folder=target.folderData.find(f=>data.id?f.folderId===data.id:f.name===name);if(folder&&m.action==='create')target.tabChange(folder);
   }else if(m.action!=='snapshot')return;
   reply(m.id,true,m.action==='create'?'文件夹已创建':'');
  }catch(error){
   if(saved)reply(m.id,true,'文件夹已保存，但列表更新失败，请刷新后确认');
   else reply(m.id,false,submitted?'保存结果尚未确认，请刷新页面核对文件夹，避免重复创建':error.message||'操作失败，请重试',submitted);
  }finally{if(ownsBusy)creating=false;queue()}
 }
 // WebVPN restores the upstream origin on MAIN-world MessageEvents. Use the
 // existing exact-host mapping while retaining the sender Window checks below.
 window.addEventListener('message',e=>{if(!window.ReimbursementSite.messageOrigin(e.origin,location))return;if(e.source===window.parent&&e.source!==window&&e.data?.type==='betterwbu-wallet-host-ready'){queue();return}if(e.source!==window)return;const m=e.data;if(m?.type==='betterwbu-wallet-config'){enabled=m.enabled===true;queue()}else if(m?.type==='betterwbu-wallet-command'&&['snapshot','switch','refresh','create','rename','delete'].includes(m.action))command(m)});
 window.addEventListener('hashchange',()=>{for(const stop of unwatch)stop();unwatch=[];vm=null;queue()});
 new MutationObserver(queue).observe(document.documentElement,{childList:true,subtree:true});queue();
})();
