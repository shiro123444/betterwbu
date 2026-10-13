(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ReimbursementMemoryCore=api;})(typeof window==='object'?window:typeof self==='object'?self:{},function(){
 'use strict';
 const keys=new Set(['applyReason','bankAccountName','branchBankName','bankAccount','recipient']);
 function clean(key,entry){
  if(key==='recipient'){
   const name=clean('bankAccountName',{value:entry?.name}),bank=clean('branchBankName',{value:entry?.bank?.kind==='manual'?entry.bank.name:entry?.bank?.id,record:entry?.bank}),account=clean('bankAccount',{value:entry?.account});
   if(!name||!bank||!account)return null;
   return {value:JSON.stringify([name.value,bank.record.kind==='manual'?['manual',bank.record.name]:bank.record.code||bank.value,account.value]),label:name.value+' · '+bank.label+' · '+account.label,name:name.value,bank:bank.record,account:account.value};
  }
  if(!keys.has(key)||!entry||typeof entry.value!=='string')return null;
  let value=entry.value.trim();if(!value||value.length>2000)return null;
  if(key==='bankAccount'){
   if(!/^\d+(?:(?:\s+|\s*-\s*)\d+)*$/.test(value))return null;
   value=value.replace(/[\s-]/g,'');if(!/^\d{8,32}$/.test(value))return null;
   return {value,label:'•••• '+value.slice(-4)};
  }
  if(key==='branchBankName'){
   const record=entry.record;
   if(record?.kind==='manual'){
    if(record.id!=null||record.code||typeof record.name!=='string'||record.name.trim()!==value||value.length>250||/[\x00-\x1f\x7f]/.test(record.name))return null;
    return {value,label:value,record:{kind:'manual',name:value,code:''}};
   }
   if(!record||record.id!==value||typeof record.name!=='string'||!record.name||record.name.length>250)return null;
   if(!/^[\w-]{1,100}$/.test(record.id)||typeof record.code!=='string'||record.code.length>64)return null;
   return {value,label:record.name,record:{id:record.id,name:record.name,code:record.code}};
  }
  if(key==='bankAccountName'&&value.length>100)return null;
  return {value,label:value};
 }
 function slot(descriptor){
  if(!descriptor||!keys.has(descriptor.key)||typeof descriptor.scope!=='string'||!descriptor.scope||descriptor.scope.length>250)return null;
  const context=descriptor.context||'';
  if(['bankAccount','branchBankName'].includes(descriptor.key)&&!context)return null;
  if(typeof context!=='string'||context.length>500)return null;
  return JSON.stringify([descriptor.scope,descriptor.key,context]);
 }
 function remember(database,descriptor,entry,now=Date.now(),manual=false){
  const id=slot(descriptor),normalized=clean(descriptor?.key,entry);if(!id||!normalized)return database;
  const next={...database};
  const prior=Array.isArray(next[id])?next[id]:[],pinned=descriptor.key==='recipient'&&(manual||prior.some(e=>e.value===normalized.value&&e.manual));
  next[id]=[{...normalized,at:now,...(pinned?{manual:true}:{})},...prior.filter(e=>e.value!==normalized.value&&(e.manual||now-e.at<90*86400000))].sort((a,b)=>Number(!!b.manual)-Number(!!a.manual)||b.at-a.at).slice(0,descriptor.key==='recipient'?60:12);
  if(descriptor.key==='recipient')for(const key of Object.keys(next)){
   let parts;try{parts=JSON.parse(key)}catch{continue}if(parts[0]!==descriptor.scope||!Array.isArray(next[key]))continue;
   if(parts[1]==='bankAccountName')next[key]=next[key].filter(e=>e.value!==normalized.name);
   if(parts[1]==='branchBankName'&&parts[2]===normalized.name)next[key]=next[key].filter(e=>!((normalized.bank.kind==='manual'?e.record?.kind==='manual'&&e.record.name===normalized.bank.name:e.record?.id===normalized.bank.id)||(normalized.bank.code&&e.record?.code===normalized.bank.code)));
   if(parts[1]==='bankAccount'&&[normalized.name+'|'+normalized.bank.code,normalized.name+'|'+(normalized.bank.kind==='manual'?normalized.bank.name:normalized.bank.id)].includes(parts[2]))next[key]=next[key].filter(e=>e.value!==normalized.account);
   if(Array.isArray(next[key])&&!next[key].length)delete next[key];
  }
  const ordered=Object.keys(next).sort((a,b)=>(next[b][0]?.at||0)-(next[a][0]?.at||0));
  for(const key of ordered.slice(120))if(!next[key].some(e=>e.manual))delete next[key];
  return next;
 }
 function recall(database,descriptor,now=Date.now()){
  const id=slot(descriptor);if(!id)return [];
  return (Array.isArray(database[id])?database[id]:[]).filter(e=>e.manual||now-e.at<90*86400000).map(e=>clean(descriptor.key,e)).filter(Boolean);
 }
 function forget(database,descriptor,entry){const id=slot(descriptor),normalized=clean(descriptor?.key,entry);if(!id||!normalized)return database;const next={...database};next[id]=(Array.isArray(next[id])?next[id]:[]).filter(e=>e.value!==normalized.value);if(!next[id].length)delete next[id];return next}
 function replace(database,descriptor,entry,previous){
  if(descriptor?.key!=='recipient'||!slot(descriptor)||!clean('recipient',entry))return null;
  if(previous){const old=clean('recipient',previous);if(!old||!recall(database,descriptor).some(e=>e.value===old.value&&e.bank.id===old.bank.id&&e.bank.name===old.bank.name))return null;database=forget(database,descriptor,previous);database=forget(database,{...descriptor,key:'bankAccountName'},{value:old.name})}
  const id=slot(descriptor),value=clean('recipient',entry).value;
  if((database[id]||[]).filter(e=>e.manual).length>=60&&!(database[id]||[]).some(e=>e.value===value))return null;
  return remember(database,descriptor,entry,Date.now(),true);
 }
 function recipientScope(scope){if(typeof scope!=='string'||scope.length>250)return null;const last=scope.lastIndexOf('|');return last>0?scope.slice(0,last)+'|@recipients':null}
 function library(database,scope,now=Date.now()){
  if(typeof scope!=='string'||recipientScope(scope)!==scope)return [];const prefix=scope.slice(0,-'@recipients'.length),entries=[];
  for(const [id,rows]of Object.entries(database||{})){let parts;try{parts=JSON.parse(id)}catch{continue}if(!Array.isArray(parts)||!String(parts[0]).startsWith(prefix)||parts[1]!=='recipient'||parts[2]!==''||!Array.isArray(rows))continue;
   for(const row of rows){if(!row.manual&&now-row.at>=90*86400000)continue;const normalized=clean('recipient',row);if(normalized)entries.push({...normalized,at:row.at,manual:!!row.manual})}
  }
  entries.sort((a,b)=>Number(b.manual)-Number(a.manual)||b.at-a.at);
  return entries.filter((e,i,a)=>a.findIndex(x=>x.value===e.value)===i).map(({at,manual,...entry})=>entry);
 }
 function forgetRecipient(database,scope,entry){
  if(typeof scope!=='string'||recipientScope(scope)!==scope||!clean('recipient',entry))return database;const prefix=scope.slice(0,-'@recipients'.length);let next={...database};
  for(const id of Object.keys(next)){let parts;try{parts=JSON.parse(id)}catch{continue}if(Array.isArray(parts)&&String(parts[0]).startsWith(prefix)&&parts[1]==='recipient'&&parts[2]==='')next=forget(next,{scope:parts[0],key:'recipient',context:''},entry)}return next;
 }
 function saveRecipient(database,descriptor,entry,previous){
  if(typeof descriptor?.scope!=='string'||recipientScope(descriptor.scope)!==descriptor.scope)return replace(database,descriptor,entry,previous);
  const normalized=clean('recipient',entry);if(!normalized)return null;
  if(previous){const old=clean('recipient',previous),current=old&&library(database,descriptor.scope).find(e=>e.value===old.value);if(!current||current.bank.id!==old.bank.id||current.bank.name!==old.bank.name)return null;database=forgetRecipient(database,descriptor.scope,old)}
  database=forgetRecipient(database,descriptor.scope,normalized);return replace(database,descriptor,normalized);
 }
 function clearRecipients(database,scope){if(typeof scope!=='string'||recipientScope(scope)!==scope)return database;const next={...database},prefix=scope.slice(0,-'@recipients'.length);for(const id of Object.keys(next)){let parts;try{parts=JSON.parse(id)}catch{continue}if(Array.isArray(parts)&&String(parts[0]).startsWith(prefix)&&['recipient','bankAccountName','branchBankName','bankAccount'].includes(parts[1]))delete next[id]}return next}
 return {clean,slot,remember,recall,forget,replace,recipientScope,library,saveRecipient,forgetRecipient,clearRecipients};
});
