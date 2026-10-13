(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ReimbursementBasicCore=factory()})(typeof window!=='undefined'?window:typeof self!=='undefined'?self:{},()=>{
 'use strict';
 const formId='c3771358d145490f9e363790c0519fde';
 const fields={jjkm:{title:'经济科目',dictionary:'ECONOMIC_SUBJECTS'},zclx:{title:'支出类型',dictionary:'EXPENDITURE_TYPE'},zbtx:{title:'指标特性',dictionary:'INDEX_PROPERTIES'},SSQK:{title:'食宿情况'},applyReason:{title:'事由',text:true}};
 const text=(v,max)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)?v.trim():null;
 function newId(random){return 'template-'+Array.from(random.getRandomValues(new Uint32Array(4)),n=>n.toString(16).padStart(8,'0')).join('')}
 function scopeValid(scope){return typeof scope==='string'&&scope.length<=250&&scope.split('|').length===3&&scope.endsWith('|'+formId)}
 function clean(raw){
  if(!raw||typeof raw!=='object'||!text(raw.id,80)||!text(raw.name,40)||!raw.values||typeof raw.values!=='object')return null;
  const values={};for(const [key,entry]of Object.entries(raw.values)){
   if(!Object.hasOwn(fields,key)||!entry||typeof entry!=='object')return null;
   const value=text(entry.value,fields[key].text?800:100),label=text(entry.label,fields[key].text?800:200);
   if(!value||!label)return null;values[key]={value,label};
  }
  if(!Object.keys(values).length)return null;
  return {id:raw.id.trim(),name:raw.name.trim(),values};
 }
 function save(db,scope,raw,previous){
  const entry=clean(raw);if(!scopeValid(scope)||!entry||(previous&&!clean(previous)))return null;
  const records=Array.isArray(db?.[scope])?db[scope].filter(clean):[],existing=records.find(x=>x.id===entry.id);
  if(previous?(JSON.stringify(clean(existing))!==JSON.stringify(clean(previous))):!!existing)return null;
  if(!existing&&records.length>=30)return null;
  return {...db,[scope]:[entry,...records.filter(x=>x.id!==entry.id)]};
 }
 function remove(db,scope,previous){if(!scopeValid(scope)||!clean(previous))return null;const records=db?.[scope]||[];if(!records.some(x=>JSON.stringify(clean(x))===JSON.stringify(clean(previous))))return null;return {...db,[scope]:records.filter(x=>x.id!==previous.id)}}
 function library(db,userScope){if(typeof userScope!=='string'||!userScope.endsWith('|@recipients'))return [];const prefix=userScope.slice(0,-11);return Object.entries(db||{}).filter(([s])=>scopeValid(s)&&s.startsWith(prefix)).flatMap(([scope,rows])=>Array.isArray(rows)?rows.map(clean).filter(Boolean).map(entry=>({scope,entry})):[])}
 return {fields,formId,scopeValid,clean,save,remove,library,newId};
});
