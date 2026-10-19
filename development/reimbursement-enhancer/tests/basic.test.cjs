const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('../extension/basic-core.js');
const scope='school|teacher|'+core.formId,entry={id:'one',name:'常用',values:{SSQK:{value:'不包食宿',label:'不包食宿'},applyReason:{value:'参加会议',label:'参加会议'}}};
test('template IDs work on HTTP where crypto.randomUUID is unavailable',()=>{assert.equal(core.newId({getRandomValues:a=>{a.set([1,2,3,4]);return a}}),'template-00000001000000020000000300000004');assert.doesNotMatch(fs.readFileSync(__dirname+'/../extension/basic-ui-http.js','utf8'),/crypto\.randomUUID/)});
test('basic templates reject money, identities, stale edits and invalid scopes; isolate users',()=>{
 assert.equal(core.clean({...entry,values:{totalAmount:{value:'20',label:'20'}}}),null);
 assert.equal(core.clean({...entry,values:{applyStaffName:{value:'person',label:'person'}}}),null);
 assert.equal(core.save({},'school|teacher|unknown',entry),null);
 let db=core.save({},scope,entry);assert.ok(db);assert.equal(core.library(db,'school|other|@recipients').length,0);assert.equal(core.library(db,'school|teacher|@recipients').length,1);
 const next={...entry,name:'改名'};db=core.save(db,scope,next,entry);assert.ok(db);assert.equal(core.save(db,scope,entry,entry),null);assert.equal(core.remove(db,scope,entry),null);assert.equal(core.remove(db,scope,next)[scope].length,0);
});
function fixture(){
 let listener,user='teacher',resolve;const replies=[],form={formId:core.formId,state:2,SSQK:'',applyReason:'',jjkm:'',totalAmount:80,activitys:[{unchanged:true}]},instances={};
 const window={ReimbursementSite:require("../extension/site.js"),ReimbursementBasicCore:core,ReimbursementMemoryBridge:{getForm:()=>form,getQuery:()=>async()=>({success:true,data:[{data_item_code:'A',data_item_name:'交通费'}]})},addEventListener:(t,f)=>listener=f,postMessage:r=>replies.push(r)};
 const location={hash:'#/reimbursementCreate?formId='+core.formId,origin:'http://wsbx.wbu.edu.cn'},localStorage={getItem:()=>JSON.stringify({id:user,groupId:'school',corpId:'corp'})};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../extension/basic-bridge.js','utf8'),{window,location,localStorage});
 for(const key of ['SSQK','applyReason','jjkm']){
  const componentInfo=key==='jjkm'?{key,postUrl:'F0025',hiddenValue:'data_item_code',selectCondition:[{currTable:'fv',curreFieldData:'ECONOMIC_SUBJECTS',assocField:'data_dict_code',filterCon:'2'}]}:key==='SSQK'?{key,dataSource:'custom',optionList:[{selectLabel:'不包食宿'}]}:{key};
  const i=instances[key]={type:{name:key==='applyReason'?'textareaCmpt':'selectSingleCmpt'},props:{componentInfo,formProps:form},subTree:{el:{isConnected:true,getClientRects:()=>[{}],matches:()=>false,classList:{contains:()=>false}}},setupState:{isEdit:{data:true},selectChange:v=>form[key]=v,onSelect:(v,r)=>{form[key]=v;form[key+'_object']=[r]}}};window.ReimbursementBasicBridge.register(i);
 }
 const send=async(action,extra={})=>{await listener({source:window,origin:location.origin,data:{type:'reimbursement-basic-request',id:'test',action,...extra}});return replies.at(-1)};
 return {window,form,instances,send,changeUser:()=>user='other',defer:()=>{window.ReimbursementMemoryBridge.getQuery=()=>()=>new Promise(r=>resolve=r);return r=>resolve(r)}};
}
test('template fill uses native choices, fills empty items only, preserves expenses and existing text',async()=>{
 const f=fixture();f.form.applyReason='已有事由';const before=JSON.stringify(f.form.activitys),d=await f.send('basic-describe');
 const r=await f.send('basic-apply',{entry,expectedScope:d.scope,expected:d.snapshot});assert.equal(r.ok,true);assert.equal(r.count,1);assert.equal(f.form.SSQK,'不包食宿');assert.equal(f.form.applyReason,'已有事由');assert.equal(f.form.totalAmount,80);assert.equal(JSON.stringify(f.form.activitys),before);
 const fresh=await f.send('basic-describe');assert.equal((await f.send('basic-apply',{entry,expectedScope:fresh.scope,expected:fresh.snapshot,overwrite:true})).count,2);assert.equal(f.form.applyReason,'参加会议');
});
test('template choices are dictionary verified and reject stale form, user, readonly and racing choices',async()=>{
 const template={...entry,values:{jjkm:{value:'A',label:'交通费'},applyReason:entry.values.applyReason}};
 for(const change of ['edit','user','readonly','route','form']){
  const f=fixture(),finish=f.defer(),d=await f.send('basic-describe'),p=f.send('basic-apply',{entry:template,expectedScope:d.scope,expected:d.snapshot});
  if(change==='edit')f.form.applyReason='修改';if(change==='user')f.changeUser();if(change==='readonly')f.instances.jjkm.props.componentInfo.isRead=true;if(change==='route')f.form.state=3;if(change==='form')f.window.ReimbursementMemoryBridge.getForm=()=>({...f.form});
  finish({success:true,data:[{data_item_code:'A',data_item_name:'交通费'}]});assert.equal((await p).ok,false,change);assert.equal(f.form.jjkm,'');assert.notEqual(f.form.applyReason,'参加会议');
 }
 const f=fixture(),d=await f.send('basic-describe');f.window.ReimbursementMemoryBridge.getQuery=()=>async()=>({success:true,data:[{data_item_code:'B',data_item_name:'交通费'}]});assert.equal((await f.send('basic-apply',{entry:template,expectedScope:d.scope,expected:d.snapshot})).ok,false);assert.equal(f.form.applyReason,'');
});
test('template dictionary lookup retains school and exact dictionary constraints',async()=>{
 const f=fixture();let payload;f.window.ReimbursementMemoryBridge.getQuery=()=>async p=>{payload=p;return {success:true,data:[]}};
 assert.equal((await f.send('basic-options',{key:'jjkm',term:'交通',expectedScope:scope})).ok,true);assert.equal(payload.queryParam.data_dict_code,'ECONOMIC_SUBJECTS');assert.equal(payload.queryParam.corp_id,'corp');assert.equal(payload.queryParam.group_id,'school');assert.equal(payload.customCondition.and[0].or[0].data_item_name,'交通');
 assert.equal((await f.send('basic-options',{key:'totalAmount',expectedScope:scope})).ok,false);
});
test('a failed native choice restores all planned basic values',async()=>{
 const f=fixture(),d=await f.send('basic-describe');f.instances.jjkm.setupState.onSelect=()=>{f.form.jjkm='partial';throw Error('failed')};
 assert.equal((await f.send('basic-apply',{entry:{...entry,values:{applyReason:entry.values.applyReason,jjkm:{value:'A',label:'交通费'}}},expectedScope:scope,expected:d.snapshot})).ok,false);assert.equal(f.form.applyReason,'');assert.equal(f.form.jjkm,'');assert.equal(Object.hasOwn(f.form,'jjkm_object'),false);
});
