(() => {
 'use strict';
 const core=window.ReimbursementBasicCore,instances=new Map();let operation=0,lastForm;
 const memory=()=>window.ReimbursementMemoryBridge;
 function user(){try{const u=JSON.parse(localStorage.getItem('userInfo')||'null');return u?.id?String(u.groupId||'')+'|'+String(u.id):null}catch{return null}}
 function scope(){const form=memory()?.getForm?.();return user()&&form?.formId===core.formId&&location.hash.startsWith('#/reimbursementCreate')&&location.hash.includes('formId='+core.formId)?user()+'|'+core.formId:null}
 function live(key){const i=instances.get(key),form=memory()?.getForm?.(),c=i?.props.componentInfo,n=i?.subTree?.el;
  if(!scope()||String(form?.state)!=='2'||!i||i.isUnmounted||i.isDeactivated||i.props.formProps!==form||!n?.isConnected||!n.getClientRects().length||i.setupState.isEdit?.data===false||c.isRead||c.isShow===false||n.matches?.(':disabled')||n.classList?.contains('ant-select-disabled'))return null;
  if(!core.fields[key].text&&(c.associativeRule?.length||i.props.mode==='multiple'))return null;
  if(core.fields[key].dictionary&&(c.postUrl!=='F0025'||c.hiddenValue!=='data_item_code'||c.selectCondition?.length!==1||c.selectCondition[0].curreFieldData!==core.fields[key].dictionary||c.selectCondition[0].assocField!=='data_dict_code'||c.selectCondition[0].currTable!=='fv'||c.selectCondition[0].filterCon!=='2'||typeof i.setupState.onSelect!=='function'))return null;
  if(key==='SSQK'&&(c.dataSource!=='custom'||typeof i.setupState.selectChange!=='function'))return null;
  return i;
 }
 async function options(key,page=1,term='',code=''){
  if(!core.fields[key])return null;
  if(key==='SSQK'){const i=live(key);return i?{choices:i.props.componentInfo.optionList.map(x=>({value:String(x.selectLabel),label:String(x.selectLabel)})),hasMore:false}:null}
  const dict=core.fields[key].dictionary;if(!dict)return null;
  const query=memory()?.getQuery?.();if(!query)return null;
  const u=JSON.parse(localStorage.getItem('userInfo')||'null'),and=[{matchMode:'2',data_dict_code:dict},{matchMode:'2',corp_id:u?.corpId},{matchMode:'2',group_id:u?.groupId}],or=term?[{matchMode:'8',data_item_name:term},{matchMode:'8',data_item_code:term}]:[];
  if(code)and.push({matchMode:'2',data_item_code:code});
  const r=await query({assetCode:'F0025',queryParam:{data_dict_code:dict,corp_id:u?.corpId,group_id:u?.groupId,...(code?{data_item_code:code}:{})},currentPage:page,pageSize:20,customCondition:{and:[{and,or}]}});
  return r?.success&&Array.isArray(r.data)?{choices:r.data.filter(x=>x.data_item_code&&x.data_item_name).map(x=>({value:String(x.data_item_code),label:String(x.data_item_name)})),records:r.data,hasMore:r.data.length===20}:null;
 }
 function snapshot(){const form=memory()?.getForm?.(),values={};for(const key of Object.keys(core.fields)){if(!live(key))continue;values[key]=[form[key]??'',form[key+'_object']??[],form[key+'_showValue']??'']}return JSON.stringify(values)}
 async function apply(raw,expectedScope,expected,overwrite){
  const entry=core.clean(raw),form=memory()?.getForm?.(),token=++operation;
  if(!entry||scope()!==expectedScope||snapshot()!==expected)return {ok:false};
  const plan=[];for(const [key,value]of Object.entries(entry.values)){
   if(!live(key))return {ok:false};if(!overwrite&&String(form[key]??'').trim())continue;
   if(core.fields[key].text){plan.push({key,value});continue}
   const result=await options(key,1,'',core.fields[key].dictionary?value.value:''),choice=result?.choices.find(x=>x.value===value.value&&x.label===value.label);
   if(!choice)return {ok:false};plan.push({key,value,record:result.records?.find(x=>String(x.data_item_code)===value.value)});
  }
  if(token!==operation||scope()!==expectedScope||memory()?.getForm?.()!==form||snapshot()!==expected||plan.some(x=>!live(x.key)))return {ok:false};
  const before=new Map(plan.flatMap(x=>[x.key,x.key+'_object',x.key+'_showValue'].map(k=>[k,{exists:Object.hasOwn(form,k),value:form[k]}])));
  try{for(const item of plan){const i=live(item.key);if(core.fields[item.key].text)form[item.key]=item.value.value;else if(item.key==='SSQK')i.setupState.selectChange(item.value.value);else i.setupState.onSelect(item.value.value,item.record)}}catch{for(const [k,v]of before){if(v.exists)form[k]=v.value;else delete form[k]}return {ok:false}}
  return {ok:true,count:plan.length};
 }
 window.ReimbursementBasicBridge={register(i){const key=i.props?.componentInfo?.key,form=memory()?.getForm?.();if(!Object.hasOwn(core.fields,key)||i.props.formProps!==form)return;if(core.fields[key].text?i.type?.name!=='textareaCmpt':i.type?.name!=='selectSingleCmpt')return;instances.set(key,i);if(form!==lastForm){lastForm=form;window.postMessage({type:'reimbursement-basic-ready'},location.origin)}},apply};
 window.addEventListener('message',async e=>{
  if(e.source!==window||e.origin!==location.origin||e.data?.type!=='reimbursement-basic-request'||typeof e.data.id!=='string')return;
  const {id,action,expectedScope}=e.data;const reply=data=>window.postMessage({type:'reimbursement-memory-reply',id,...data},location.origin);
  if(!action?.startsWith('basic-'))return;
  try{
   if(action==='basic-describe'){const fields=[];for(const [key,def]of Object.entries(core.fields)){const i=live(key);if(!i)continue;const form=i.props.formProps,value=String(form[key]??''),label=def.text||key==='SSQK'?value:String(form[key+'_object']?.[0]?.data_item_name||'');fields.push({key,title:def.title,text:!!def.text,current:value&&label?{value,label}:null,choices:key==='SSQK'?i.props.componentInfo.optionList.map(x=>({value:String(x.selectLabel),label:String(x.selectLabel)})):[]})}return reply({ok:!!scope(),scope:scope(),fields,snapshot:snapshot()})}
   if(!expectedScope||![scope(),user()+'|@recipients'].includes(expectedScope))return reply({ok:false});
   if(action==='basic-options'){const startUser=user(),r=await options(e.data.key,Math.max(1,Math.min(100,Number(e.data.page)||1)),String(e.data.term||'').slice(0,200));return reply(r&&user()===startUser?{ok:true,choices:r.choices,hasMore:r.hasMore}:{ok:false})}
   if(action==='basic-apply')return reply(await apply(e.data.entry,expectedScope,e.data.expected,e.data.overwrite===true));
  }catch{reply({ok:false})}
 });
})();
