(() => {
 'use strict';
 if(location.hostname!=='wsbx.wbu.edu.cn'||!location.pathname.startsWith('/workbench-web/'))return;
 const fields=new Map(),registered=new WeakMap(),rowVersions=new WeakMap();let serial=0;
 const core=window.ReimbursementMemoryCore;
 function identity(){try{const u=JSON.parse(localStorage.getItem('userInfo')||'null');return u?.id?String(u.groupId||'')+'|'+String(u.id):null}catch{return null}}
 function userScope(){const id=identity();return id?id+'|@recipients':null}
 function scope(){const id=identity();const form=window.ReimbursementMemoryBridge?.getForm?.();const hash=String(location.hash||'');if(hash&&!hash.startsWith('#/reimbursementCreate'))return null;const route=hash.match(/[?&]formId=([^&]+)/);if(route&&decodeURIComponent(route[1])!==String(form?.formId))return null;return id&&form?.formId?id+'|'+form.formId:null}
 function editable(field){
  if(!field.node.isConnected||field.instance.isUnmounted||field.instance.isDeactivated||field.node.disabled||field.node.readOnly||
     (field.node.getClientRects&&field.node.getClientRects().length===0))return false;
  return !!field.instance.props.formProps&&!!scope();
 }
 function readBank(row){
  const raw=String(row.branchBankName||''),bank=row.branchBankName_object?.[0];
  if(bank?.id===raw)return core.clean('branchBankName',{value:raw,record:{id:bank.id,name:bank.branch_bank_name,code:String(bank.branch_bank_code||'')}})?.record;
  if(bank&&!bank.id&&!bank.branch_bank_code&&bank.manager_name===raw&&bank.showValue===raw)return core.clean('branchBankName',{value:raw,record:{kind:'manual',name:raw,code:''}})?.record;
  return null;
 }
 function manualAllowed(field){const info=field.instance.props.componentInfo;return info.type==='selectText'&&info.postUrl==='F0003'&&!info.associativeRule?.length&&!info.selectCondition?.length}
 function writeManualBank(row,bank){row.branchBankName=bank.name;row.branchBankName_object=[{manager_name:bank.name,showValue:bank.name}]}
 function descriptor(field){
  if(!editable(field))return null;
  const p=field.instance.props,form=p.formProps,key=p.componentInfo?.key,s=scope();if(!form||!s)return null;
  const bank=readBank(form);
  const context=key==='bankAccount'?String(form.bankAccountName||'').trim()+'|'+String(bank?.code||form.branchBankName||''):key==='branchBankName'?String(form.bankAccountName||'').trim():'';
  if(key==='bankAccount'&&(!form.bankAccountName||!form.branchBankName||!bank))return null;
  const raw=String(form[key]??'');
  return {scope:s,key,context,value:raw,label:p.componentInfo.title||'',entry:key==='branchBankName'?{value:raw,record:bank}:{value:raw}};
 }
 function group(field){
  const row=field.instance.props.formProps,s=scope();if(!s)return null;
  const members={};for(const f of fields.values())if(f.instance.props.formProps===row&&editable(f))members[f.instance.props.componentInfo.key]=f;
  if(!['bankAccountName','branchBankName','bankAccount'].every(k=>members[k]))return null;
  const info=members.branchBankName.instance.props.componentInfo;
  if(info.associativeRule?.length||info.selectCondition?.length||typeof members.branchBankName.instance.setupState.onSelect!=='function')return null;
  const bank=row.branchBankName_object?.[0];
  const value=JSON.stringify([row.payMethod??'',row.bankAccountName??'',row.branchBankName??'',row.bankAccount??'',bank?.id??'',bank?.branch_bank_code??'',bank?.branch_bank_name??'',bank?.manager_name??'',bank?.showValue??'']);
  const record=readBank(row),entry=record?core.clean('recipient',{name:String(row.bankAccountName||''),bank:record,account:String(row.bankAccount||'')}):null;
  return {row,members,descriptor:{scope:s,key:'recipient',context:'',value,label:members.bankAccountName.instance.props.componentInfo.title||'',entry}};
 }
 const bridge=window.ReimbursementMemoryBridge={getForm:null,getQuery:null,register(instance){
  const key=instance.props?.componentInfo?.key;
  if(!['applyReason','bankAccountName','branchBankName','bankAccount'].includes(key))return;
  if(!instance.props.formProps||typeof instance.props.formProps!=='object')return;
  if(key==='bankAccountName'&&(instance.type?.name==='selectTextCmpt'||instance.props.componentInfo.dataSource==='post'))return;
  let root=instance.subTree?.el;
  if(!root||root.nodeType!==1)return;
  const input=root.matches('input,textarea')?root:root.querySelector('input,textarea');
  if(!input||input.disabled||input.readOnly||registered.has(input))return;
  const id=String(++serial);registered.set(input,id);input.dataset.reMemoryId=id;input.dataset.reMemoryKey=key;fields.set(id,{node:input,instance,version:0});
 },prune(){for(const [id,field]of fields)if(!field.node.isConnected)fields.delete(id)}};
 function reply(id,data){window.postMessage({type:'reimbursement-memory-reply',id,...data},location.origin)}
 window.addEventListener('message',async event=>{
  if(event.source!==window||event.origin!==location.origin||event.data?.type!=='reimbursement-memory-request')return;
  const {id,action,fieldId,entry,expected,expectedScope,expectedContext}=event.data;
  if(typeof id!=='string'||id.length>100)return;
  if(typeof action==='string'&&action.startsWith('basic-'))return;
  if(action==='identify')return reply(id,{scope:scope(),userScope:userScope()});
  if(['search-banks','validate-recipient'].includes(action)){
   const initial=expectedScope;if(!initial||![scope(),userScope()].includes(initial))return reply(id,{ok:false});
   try{
    const normalized=action==='validate-recipient'?core.clean('recipient',entry):null;
    if(normalized?.bank.kind==='manual')return reply(id,{ok:true,entry:normalized});
    const query=bridge.getQuery?.();if(!query)return reply(id,{ok:false});
    const term=action==='search-banks'?String(event.data.term||'').trim():normalized?.bank.name;
    if(!term||term.length>250)return reply(id,{ok:false});
    const words=term.split(/\s+/).slice(0,6),match=w=>({matchMode:'8',branch_bank_name:w});
    const aliases={'工行':'中国工商银行','农行':'中国农业银行','建行':'中国建设银行','中行':'中国银行','邮储':'中国邮政储蓄银行','交行':'交通银行'};
    const condition=action==='search-banks'&&/^\d{12}$/.test(term)?{and:[{or:[{matchMode:'8',branch_bank_code:term}],and:[]}]}:action==='search-banks'?{and:[{or:[match(aliases[words[0]]||words[0])],and:words.slice(1).map(w=>match(aliases[w]||w))}]}:{and:[{or:[match(term)],and:[]}]};
    const result=await query({assetCode:'F0003',queryParam:{},currentPage:action==='search-banks'?Math.max(1,Math.min(100,Number(event.data.page)||1)):1,pageSize:20,customCondition:condition});
    if(![scope(),userScope()].includes(initial)||!result.success||!Array.isArray(result.data))return reply(id,{ok:false});
    const banks=result.data.map(b=>core.clean('branchBankName',{value:b.id,record:{id:b.id,name:b.branch_bank_name,code:String(b.branch_bank_code||'')}})?.record).filter(Boolean);
    if(action==='search-banks')return reply(id,{ok:true,banks:banks.filter((b,i,a)=>a.findIndex(x=>x.name===b.name&&(b.code?x.code===b.code:x.id===b.id))===i),hasMore:result.data.length===20});
    const bank=banks.find(b=>b.name===normalized.bank.name&&(b.id===normalized.bank.id||(normalized.bank.code&&b.code===normalized.bank.code)));
    return reply(id,bank?{ok:true,entry:core.clean('recipient',{...normalized,bank})}:{ok:false});
   }catch{return reply(id,{ok:false})}
  }
  if(action==='capture'){
   const descriptors=[...fields.values()].map(descriptor).filter(Boolean),seen=new Set();
   for(const field of fields.values()){const g=group(field);if(g?.descriptor.entry&&!seen.has(g.row)){seen.add(g.row);descriptors.push(g.descriptor)}}
   return reply(id,{descriptors});
  }
  const field=fields.get(String(fieldId)),d=field&&descriptor(field);
  if(action==='cancel'&&field){field.version++;const row=field.instance.props.formProps;rowVersions.set(row,(rowVersions.get(row)||0)+1);return reply(id,{ok:true})}
  if(!d||!field.node.isConnected)return reply(id,{ok:false});
  if(action==='describe')return reply(id,{descriptor:d,recipient:group(field)?.descriptor});
  if(action==='apply-recipient'){
   const g=group(field),normalized=core.clean('recipient',entry);
   if(!g||!normalized||g.descriptor.value!==expected||g.descriptor.scope!==expectedScope||expectedContext!=='')return reply(id,{ok:false});
   const operation=(rowVersions.get(g.row)||0)+1;rowVersions.set(g.row,operation);
   try{
    const manual=normalized.bank.kind==='manual';let bank;
    if(manual){if(!manualAllowed(g.members.branchBankName))return reply(id,{ok:false});bank=normalized.bank}
    else{
     const query=bridge.getQuery?.();if(!query)return reply(id,{ok:false});
     const response=await query({assetCode:'F0003',queryParam:{},currentPage:1,pageSize:20,customCondition:{and:[{or:[{matchMode:'8',branch_bank_name:normalized.bank.name}],and:[]}]}});
     bank=response.success&&response.data?.find(b=>b.branch_bank_name===normalized.bank.name&&(b.id===normalized.bank.id||(normalized.bank.code&&String(b.branch_bank_code)===normalized.bank.code)));
    }
    const current=group(field);
    if(!bank||!current||rowVersions.get(g.row)!==operation||current.descriptor.scope!==g.descriptor.scope||current.descriptor.value!==expected)return reply(id,{ok:false});
    const before={name:g.row.bankAccountName,bank:g.row.branchBankName,objects:g.row.branchBankName_object,account:g.row.bankAccount};
    try{g.row.bankAccountName=normalized.name;if(manual)writeManualBank(g.row,bank);else g.members.branchBankName.instance.setupState.onSelect(bank.id,bank);g.row.bankAccount=normalized.account}
    catch{g.row.bankAccountName=before.name;g.row.branchBankName=before.bank;g.row.branchBankName_object=before.objects;g.row.bankAccount=before.account;return reply(id,{ok:false})}
    return reply(id,{ok:true});
   }catch{return reply(id,{ok:false})}
  }
  if(action!=='apply'||expected!==d.value||expectedScope!==d.scope||expectedContext!==d.context)return reply(id,{ok:false});
  const normalized=core.clean(d.key,entry);if(!normalized)return reply(id,{ok:false});
  const operation=++field.version;
  const row=field.instance.props.formProps,rowOperation=(rowVersions.get(row)||0)+1;rowVersions.set(row,rowOperation);
  try{
   if(d.key==='branchBankName'&&normalized.record.kind==='manual'){
    if(!manualAllowed(field))return reply(id,{ok:false});
    writeManualBank(row,normalized.record);
   }else if(d.key==='branchBankName'){
    const query=bridge.getQuery?.();if(!query)return reply(id,{ok:false});
    const r=await query({assetCode:'F0003',queryParam:{},currentPage:1,pageSize:20,customCondition:{and:[{or:[{matchMode:'8',branch_bank_name:normalized.record.name}],and:[]}]}});
    const row=r.success&&r.data?.find(b=>b.branch_bank_name===normalized.record.name&&(b.id===normalized.record.id||(normalized.record.code&&String(b.branch_bank_code)===normalized.record.code)));
    // Verify user, recipient, and field again after the asynchronous dictionary read.
    const current=descriptor(field);
    if(operation!==field.version||rowVersions.get(field.instance.props.formProps)!==rowOperation||!row||!current||current.scope!==d.scope||current.context!==d.context||current.value!==expected)return reply(id,{ok:false});
    field.instance.setupState.onSelect(row.id,row);
   }else field.instance.props.formProps[d.key]=normalized.value;
   reply(id,{ok:true});
  }catch{reply(id,{ok:false})}
 });
})();
