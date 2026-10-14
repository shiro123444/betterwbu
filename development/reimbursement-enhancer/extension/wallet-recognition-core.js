(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ReimbursementRecognitionCore=api})(typeof window==='object'?window:{},function(){
  'use strict';
  const text=v=>typeof v==='string'||typeof v==='number'?String(v):'';
  const pending=b=>b?.billType==='unident'||(b?.dataType===2&&!!b.fileName&&!b.ticketCode);
  function flatten(rows){return (rows||[]).flatMap(b=>[b,...flatten(b.subBillCards)])}
  function ids(b){return [b?.id,b?.barcode,b?.parentBarcode,b?.billAttachId].map(text).filter(Boolean)}
  function create({delay=120000,limit=200}={}){
    const records=new Map();let scope='', lastQuery=-Infinity,queryError='';
    function observe(rows,currentScope,now){
      if(currentScope!==scope){records.clear();scope=currentScope;lastQuery=-Infinity;queryError=''}
      const all=flatten(rows), waiting=all.filter(pending),recognized=all.filter(b=>!pending(b)&&!!b.ticketCode);
      for(const b of waiting){const key=text(b.barcode||b.id);if(!key)continue;let r=records.get(key);if(!r){const date=Date.parse(b.createTs);r={key,barcode:text(b.barcode),name:text(b.fileName||b.billTitle)||'票据',first:Number.isFinite(date)&&date<=now?date:now,ids:ids(b)};records.set(key,r)}r.present=true;r.phase=now-r.first>=delay?'delayed':'processing';r.reason=queryError||'';r.seconds=Math.max(0,Math.floor((now-r.first)/1000))}
      const keys=new Set(waiting.map(b=>text(b.barcode||b.id)));
      for(const r of records.values())if(!keys.has(r.key)){
        const match=recognized.find(b=>ids(b).some(id=>r.ids.includes(id)));
        r.seconds=Math.max(0,Math.floor((now-r.first)/1000));
        if(match){r.present=false;r.phase=match.billType==='repeat'||String(match.isHasRepeat)==='1'?'duplicate':'recognized';r.reason='';}
        else if(queryError&&r.present){r.reason=queryError;r.phase=now-r.first>=delay?'delayed':'processing';}
        else if(!['recognized','duplicate'].includes(r.phase)){r.present=false;r.phase='unconfirmed';r.reason=queryError||'任务已不在待识别列表，但未返回对应票据';}
      }
      while(records.size>limit)records.delete(records.keys().next().value);
      return snapshot();
    }
    function snapshot(){return [...records.values()].map(({ids,...r})=>({...r}))}
    function needsQuery(now,idle=true){return idle&&[...records.values()].some(r=>r.present)&&now-lastQuery>=30000}
    function queried(now){lastQuery=now}
    function succeeded(){queryError=''}
    function failed(message){queryError=text(message)||'查询失败，请重新查询';for(const r of records.values())r.reason=queryError;return snapshot()}
    function clearTerminal(){for(const [key,r]of records)if(!r.present)records.delete(key);return snapshot()}
    return {observe,snapshot,needsQuery,queried,succeeded,failed,clearTerminal};
  }
  return {create,pending};
});
