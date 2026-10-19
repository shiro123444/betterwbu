(() => {
 'use strict';
 const open=document.getElementById('open'),retry=document.getElementById('retry'),status=document.getElementById('status');
 const version=chrome.runtime.getManifest().version;
 document.getElementById('version').textContent='插件版本 '+version;
 let checking=false;
 function send(tabId,message){
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('页面响应超时')),12000);
   chrome.tabs.sendMessage(tabId,message,{frameId:0}).then(value=>{clearTimeout(timer);resolve(value)},error=>{clearTimeout(timer);reject(error)});
  });
 }
 async function inspect(shouldOpen=false){
  if(checking)return;checking=true;open.disabled=retry.disabled=true;status.textContent='正在检查报销页面…';
  let ready=false;
  try{
   const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
   if(!tab?.id||!window.ReimbursementSite.workbench(tab.url||'')){
    status.textContent='请先打开报销工作台，再点击“重新检查”。';return;
   }
   const page=await send(tab.id,{type:'info-manager-status'});
   if(page?.version!==version){status.textContent='当前页面版本与插件不一致。\n请保留未保存页面，另开报销页面后测试。';return}
   if(!page.ready){status.textContent='信息管理尚未初始化完成，请稍后重新检查。若仍不可用，请重新加载扩展并新开报销页面。';return}
   ready=true;status.textContent='页面版本 '+page.version+' · 信息管理可用';
   if(shouldOpen){
    const result=await send(tab.id,{type:'open-info-manager'});
    if(result?.ok)window.close();
    else{ready=false;status.textContent='信息管理未能打开，请新开报销页面后重试。'}
   }
  }catch{
   status.textContent='无法连接报销页面。\n请保留未保存页面，另开报销页面后测试；仍失败时重新加载扩展。';
   ready=false;
  }finally{checking=false;open.disabled=!ready;retry.disabled=false}
 }
 open.addEventListener('click',()=>inspect(true));
 retry.addEventListener('click',()=>inspect());
 inspect();
})();
