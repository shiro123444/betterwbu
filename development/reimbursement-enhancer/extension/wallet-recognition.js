(() => {
  'use strict';
  if(window.ReimbursementRecognitionMonitor)return;
  const core=window.ReimbursementRecognitionCore;if(!core)return;
  const tracker=core.create();let enabled=true,vm,scope='',busy=false,latest='',lastScan=0;
  const route=()=>location.hash.split('?')[0]==='#/bill/file';
  function find(){const q=[document.querySelector('#app')?.__vue__],seen=new Set();while(q.length){const v=q.shift();if(!v||seen.has(v))continue;seen.add(v);if(Array.isArray(v.sourceData)&&v.condition&&typeof v.getInfo==='function'&&!v._isDestroyed)return v;q.push(...(v.$children||[]))}return null}
  function queryScope(v){const derived=new Set(['ticketCodes','isShowAll','bizFlag','slBusinessType','slBillType','attachFileType','origin','keyword','searchBarcode']);const condition=Object.fromEntries(Object.entries(v.condition||{}).filter(([k])=>!derived.has(k)&&!/token|auth|password/i.test(k)));return JSON.stringify([location.hash.split('?')[0],condition,[v.page?.currentPage,v.page?.pageSize],v.keyword,v.searchBarcode,v.billValue,v.typeValue,v.slBillType,v.slBusinessType,v.attachFileType])}
  function idle(v){return !!v&&!v._isDestroyed&&v.$el?.isConnected&&!v.spinning&&!v.loading&&!v.isEdit&&!v.activeEdit&&!v.visible&&!(v.checkedValues||[]).length&&!(v.allUploadFiles||[]).some(f=>f.active===true||(f.success!==true&&!f.error))&&!(v.uploadFileList||[]).length&&document.visibilityState!=='hidden'}
  function emit(rows){const payload={type:'reimbursement-recognition-state',enabled,rows,canRefresh:enabled&&route()&&!busy&&idle(vm)};const s=JSON.stringify(payload);if(s!==latest){latest=s;window.postMessage(payload,location.origin)}}
  function inspect(){
    lastScan=Date.now();if(!enabled||!route()){vm=null;scope='';emit([]);return}
    const next=find();if(!next){emit([]);return}vm=next;const nextScope=queryScope(vm);if((busy||vm.spinning||vm.loading)&&scope===nextScope){emit(tracker.snapshot());return}scope=nextScope;emit(tracker.observe(vm.sourceData,scope,Date.now()));
  }
  async function refresh(manual=false){
    inspect();const target=vm,expected=scope;if(!enabled||!route()||busy||!idle(target)||(!manual&&!tracker.needsQuery(Date.now())))return false;
    busy=true;tracker.queried(Date.now());emit(tracker.snapshot());let timeout;
    // Only the native read-only list query; never onRefresh (clears selection),
    // upload, delete, retain-repeat, reidentify or reimbursement save/submit.
    try{
      const http=target.$http,descriptor=Object.getOwnPropertyDescriptor(target,'$http');let request;
      if(typeof http!=='function')throw Error('No native list query');
      Object.defineProperty(target,'$http',{configurable:true,writable:true,value:function(...args){if(String(args[0]?.url).split('?')[0]!=='/bill-wallet/bill/manage/findBillFolderCardList.json'||String(args[0]?.method).toLowerCase()!=='post')throw Error('Unsupported native query');const result=http.apply(target,args);request=Promise.resolve(result);return result}});
      try{target.getInfo()}finally{if(descriptor)Object.defineProperty(target,'$http',descriptor);else delete target.$http}
      if(!request)throw Error('Native query not observed');const result=await Promise.race([request,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Query timeout')),30000)})]);
      if(result?.success!==true||!Array.isArray(result.data?.unIdentInstanceVOList)||!Array.isArray(result.data?.billCardList))throw Error('Invalid list response');
      await target.$nextTick?.();if(vm===target&&queryScope(target)===expected){tracker.succeeded();busy=false;inspect()}return true;
    }
    catch{if(enabled&&route()&&vm===target&&queryScope(target)===expected)emit(tracker.failed('查询失败，请重新查询'));return false}
    finally{clearTimeout(timeout);busy=false;if(enabled&&route()&&vm===target&&queryScope(target)===expected)emit(tracker.snapshot());else inspect()}
  }
  window.addEventListener('message',e=>{if(e.source!==window||!window.ReimbursementSite.messageOrigin(e.origin,location))return;const d=e.data;if(d?.type==='reimbursement-wallet-settings'){enabled=d.enabled===true;inspect()}
    if(d?.type==='reimbursement-recognition-command'&&enabled&&route()){if(d.action==='refresh')refresh(true);else if(d.action==='clear')emit(tracker.clearTerminal())}});
  new MutationObserver(()=>{if(Date.now()-lastScan>1000)inspect()}).observe(document.documentElement,{childList:true,subtree:true});
  const timer=setInterval(()=>{inspect();refresh()},5000);
  window.addEventListener('hashchange',inspect);window.addEventListener('pagehide',()=>clearInterval(timer));
  window.ReimbursementRecognitionMonitor={inspect,refresh};inspect();
})();
