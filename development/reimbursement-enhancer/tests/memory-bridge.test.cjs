const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const core=require('../extension/memory-core.js');
function fixture(key='bankAccount'){
 let listener,user='teacher-a';const replies=[];
 const window={ReimbursementMemoryCore:core,addEventListener:(type,f)=>listener=f,postMessage:r=>replies.push(r)};
 const localStorage={getItem:()=>JSON.stringify({id:user,groupId:'school'})},location={hostname:'wsbx.wbu.edu.cn',pathname:'/workbench-web/',origin:'http://wsbx.wbu.edu.cn'};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../extension/memory-bridge.js','utf8'),{window,localStorage,location});
 const model={bankAccountName:'Recipient',branchBankName:'bank-id',bankAccount:'',branchBankName_object:[{id:'bank-id',branch_bank_name:'Full bank',branch_bank_code:'123'}]};
 const input={nodeType:1,disabled:false,readOnly:false,isConnected:true,dataset:{},matches:()=>true};
 const instance={props:{componentInfo:{key,title:key},formProps:model},subTree:{el:input},setupState:{onSelect:(id,row)=>{model.branchBankName=id;model.branchBankName_object=[row]}}};
 window.ReimbursementMemoryBridge.getForm=()=>({formId:'travel'});window.ReimbursementMemoryBridge.register(instance);
 const send=async(action,extra={})=>{await listener({source:window,origin:'http://wsbx.wbu.edu.cn',data:{type:'reimbursement-memory-request',id:'test',action,fieldId:input.dataset.reMemoryId,...extra}});return replies.at(-1)};
 function add(key){const node={...input,dataset:{}},instance={props:{componentInfo:{key,title:key},formProps:model},subTree:{el:node},setupState:{onSelect:(id,row)=>{model.branchBankName=id;model.branchBankName_object=[row]}}};window.ReimbursementMemoryBridge.register(instance);return {node,instance}}
 return {model,window,send,input,add,location,changeUser:()=>user='teacher-b'};
}
test('memory application requires unchanged user, recipient, bank and current value',async()=>{
 const f=fixture();const d=(await f.send('describe')).descriptor;
 const choose={entry:{value:'1234567890123456'},expected:d.value,expectedScope:d.scope,expectedContext:d.context};
 f.changeUser();assert.equal((await f.send('apply',choose)).ok,false);assert.equal(f.model.bankAccount,'');
 const g=fixture();const e=(await g.send('describe')).descriptor;g.model.bankAccountName='Other';
 assert.equal((await g.send('apply',{...choose,expectedScope:e.scope,expectedContext:e.context})).ok,false);
 const h=fixture();const a=(await h.send('describe')).descriptor;
 h.model.branchBankName='updated-dictionary-id';h.model.branchBankName_object[0].id='updated-dictionary-id';
 assert.equal((await h.send('describe')).descriptor.context,a.context);
 assert.equal((await h.send('apply',{entry:{value:'1234567890123456'},expected:a.value,expectedScope:a.scope,expectedContext:a.context})).ok,true);
 assert.equal(h.model.bankAccount,'1234567890123456');
});
test('a wrapper without row props does not occupy the real input registration',async()=>{
 const f=fixture('bankAccountName'),input={nodeType:1,disabled:false,readOnly:false,isConnected:true,dataset:{},matches:()=>true};
 f.window.ReimbursementMemoryBridge.register({props:{componentInfo:{key:'bankAccountName'}},subTree:{el:input}});
 assert.equal(input.dataset.reMemoryId,undefined);
 f.window.ReimbursementMemoryBridge.register({props:{componentInfo:{key:'bankAccountName',title:'Name'},formProps:f.model},subTree:{el:input},setupState:{}});
 assert.equal((await f.send('describe',{fieldId:input.dataset.reMemoryId})).descriptor.value,'Recipient');
 const picker={...input,dataset:{}};f.window.ReimbursementMemoryBridge.register({type:{name:'selectTextCmpt'},props:{componentInfo:{key:'bankAccountName',dataSource:'post'},formProps:f.model},subTree:{el:picker},setupState:{}});assert.equal(picker.dataset.reMemoryId,undefined);
});
test('whole recipient fills three fields after dictionary validation and preserves payment amounts',async()=>{
 const f=fixture('bankAccountName');f.add('branchBankName');f.add('bankAccount');Object.assign(f.model,{payMethod:'transfer',receivableCurrency:123,actualReceivableCurrency:110});
 f.window.ReimbursementMemoryBridge.getQuery=()=>async()=>({success:true,data:[{id:'new-bank',branch_bank_name:'New bank',branch_bank_code:'new-code'}]});
 const d=(await f.send('describe')).recipient;
 assert.equal((await f.send('apply-recipient',{entry:{name:'New recipient',bank:{id:'new-bank',name:'New bank',code:'new-code'},account:'1234567890123456'},expected:d.value,expectedScope:d.scope,expectedContext:''})).ok,true);
 assert.equal(f.model.bankAccountName,'New recipient');assert.equal(f.model.branchBankName,'new-bank');assert.equal(f.model.bankAccount,'1234567890123456');
 assert.equal(f.model.payMethod,'transfer');assert.equal(f.model.receivableCurrency,123);assert.equal(f.model.actualReceivableCurrency,110);
});
test('a completely blank new payment row exposes whole-recipient choices and can be filled',async()=>{
 const f=fixture('bankAccountName');f.add('branchBankName');f.add('bankAccount');Object.assign(f.model,{bankAccountName:'',branchBankName:'',branchBankName_object:[],bankAccount:''});
 const d=(await f.send('describe')).recipient;assert.ok(d);assert.equal(d.entry,null);
 f.window.ReimbursementMemoryBridge.getQuery=()=>async()=>({success:true,data:[{id:'new-bank',branch_bank_name:'New bank',branch_bank_code:'new-code'}]});
 assert.equal((await f.send('apply-recipient',{entry:{name:'New person',bank:{id:'new-bank',name:'New bank',code:'new-code'},account:'1234567890123456'},expected:d.value,expectedScope:d.scope,expectedContext:''})).ok,true);
 assert.equal(f.model.bankAccountName,'New person');assert.equal(f.model.branchBankName,'new-bank');assert.equal(f.model.bankAccount,'1234567890123456');
});
test('manual bank lookup and recipient validation do not modify payment rows and reject identity changes',async()=>{
 const f=fixture('bankAccountName'),before=JSON.stringify(f.model),scope=(await f.send('identify')).scope;let payload;
 f.window.ReimbursementMemoryBridge.getQuery=()=>async p=>{payload=p;return {success:true,data:[{id:'bank-id',branch_bank_name:'Full bank',branch_bank_code:'123'}]}};
 const found=await f.send('search-banks',{term:'Bank City',expectedScope:scope});assert.equal(found.ok,true);assert.equal(found.banks[0].code,'123');assert.equal(payload.customCondition.and[0].and[0].branch_bank_name,'City');
 const entry={name:'Person',bank:found.banks[0],account:'1234567890123456'};
 assert.equal((await f.send('validate-recipient',{entry,expectedScope:scope})).ok,true);assert.equal(JSON.stringify(f.model),before);
 let finish;f.window.ReimbursementMemoryBridge.getQuery=()=>()=>new Promise(r=>finish=r);
 const op=f.send('validate-recipient',{entry,expectedScope:scope});f.changeUser();finish({success:true,data:[{id:'bank-id',branch_bank_name:'Full bank',branch_bank_code:'123'}]});assert.equal((await op).ok,false);
});
test('manual bank search accepts a full clearing code and deduplicates identical branch/code records',async()=>{
 const f=fixture('bankAccountName'),scope=(await f.send('identify')).scope;let payload;
 f.window.ReimbursementMemoryBridge.getQuery=()=>async p=>{payload=p;return {success:true,data:[{id:'a',branch_bank_name:'Full bank',branch_bank_code:'301521000021'},{id:'b',branch_bank_name:'Full bank',branch_bank_code:'301521000021'},{id:'c',branch_bank_name:'Other bank',branch_bank_code:'301521009027'}]}};
 const r=await f.send('search-banks',{term:'301521000021',expectedScope:scope});
 assert.equal(payload.customCondition.and[0].or[0].branch_bank_code,'301521000021');assert.equal(payload.customCondition.and[0].or[0].branch_bank_name,undefined);assert.equal(r.banks.length,2);
});
test('recipient management can identify the current user and query banks on a list page with no active form',async()=>{
 const f=fixture();f.location.hash='#/reimbursementList';f.window.ReimbursementMemoryBridge.getForm=()=>null;
 const identity=await f.send('identify');assert.equal(identity.scope,null);assert.equal(identity.userScope,'school|teacher-a|@recipients');
 f.window.ReimbursementMemoryBridge.getQuery=()=>async()=>({success:true,data:[{id:'bank',branch_bank_name:'Full bank',branch_bank_code:'123'}]});
 assert.equal((await f.send('search-banks',{term:'bank',expectedScope:identity.userScope})).ok,true);
 f.changeUser();assert.equal((await f.send('search-banks',{term:'bank',expectedScope:identity.userScope})).ok,false);
});
test('whole recipient is refused when user edits, row becomes readonly, or query is cancelled',async()=>{
 for(const action of ['edit','readonly','cancel']){
  const f=fixture('bankAccountName');f.add('branchBankName');const account=f.add('bankAccount');let finish;
  f.window.ReimbursementMemoryBridge.getQuery=()=>()=>new Promise(resolve=>finish=resolve);
  const d=(await f.send('describe')).recipient;
  const op=f.send('apply-recipient',{entry:{name:'New recipient',bank:{id:'new-bank',name:'New bank',code:'new-code'},account:'1234567890123456'},expected:d.value,expectedScope:d.scope,expectedContext:''});
  if(action==='edit')f.model.bankAccount='edited';if(action==='readonly')account.node.readOnly=true;if(action==='cancel')await f.send('cancel');
  finish({success:true,data:[{id:'new-bank',branch_bank_name:'New bank',branch_bank_code:'new-code'}]});assert.equal((await op).ok,false);assert.equal(f.model.bankAccountName,'Recipient');assert.equal(f.model.branchBankName,'bank-id');
 }
});
test('whole recipient rolls back if native bank selection fails',async()=>{
 const f=fixture('bankAccountName'),bank=f.add('branchBankName');f.add('bankAccount');const before=JSON.stringify(f.model);
 bank.instance.setupState.onSelect=()=>{f.model.branchBankName='partial';throw Error('failure')};
 f.window.ReimbursementMemoryBridge.getQuery=()=>async()=>({success:true,data:[{id:'new-bank',branch_bank_name:'New bank',branch_bank_code:'new-code'}]});
 const d=(await f.send('describe')).recipient;
 assert.equal((await f.send('apply-recipient',{entry:{name:'New recipient',bank:{id:'new-bank',name:'New bank',code:'new-code'},account:'1234567890123456'},expected:d.value,expectedScope:d.scope,expectedContext:''})).ok,false);
 assert.equal(JSON.stringify(f.model),before);
});
test('hidden and read-only cached form inputs cannot be captured or filled',async()=>{
 const f=fixture();f.input.getClientRects=()=>[];assert.equal((await f.send('describe')).ok,false);
 const g=fixture();g.input.readOnly=true;assert.equal((await g.send('describe')).ok,false);
 const h=fixture();h.input.isConnected=false;assert.equal((await h.send('describe')).ok,false);
});
test('remembered bank is rechecked against the live dictionary before selection',async()=>{
 const f=fixture('branchBankName');const d=(await f.send('describe')).descriptor;
 f.window.ReimbursementMemoryBridge.getQuery=()=>async()=>({success:true,data:[{id:'bank-id',branch_bank_name:'Full bank',branch_bank_code:'123'}]});
 const choice={entry:d.entry,expected:d.value,expectedScope:d.scope,expectedContext:d.context};
 assert.equal((await f.send('apply',choice)).ok,true);
 f.window.ReimbursementMemoryBridge.getQuery=()=>async()=>({success:true,data:[{id:'different',branch_bank_name:'Full bank',branch_bank_code:'different'}]});
 assert.equal((await f.send('apply',choice)).ok,false);
});
test('a later remembered-bank choice invalidates an earlier dictionary request',async()=>{
 const f=fixture('branchBankName'),d=(await f.send('describe')).descriptor,pending=[];
 f.window.ReimbursementMemoryBridge.getQuery=()=>()=>new Promise(resolve=>pending.push(resolve));
 const choose=(id)=>({entry:{value:id,record:{id,name:id,code:id}},expected:d.value,expectedScope:d.scope,expectedContext:d.context});
 const first=f.send('apply',choose('bank-first')),second=f.send('apply',choose('bank-second'));
 pending[0]({success:true,data:[{id:'bank-first',branch_bank_name:'bank-first',branch_bank_code:'bank-first'}]});await first;
 assert.equal(f.model.branchBankName,'bank-id');
 pending[1]({success:true,data:[{id:'bank-second',branch_bank_name:'bank-second',branch_bank_code:'bank-second'}]});await second;
 assert.equal(f.model.branchBankName,'bank-second');
});

const manualBank={kind:'manual',name:'交通银行武汉分行',code:''};
function manualFixture(){const f=fixture('bankAccountName'),bank=f.add('branchBankName');f.add('bankAccount');Object.assign(bank.instance.props.componentInfo,{type:'selectText',postUrl:'F0003'});return {f,bank}}
test('manual recipient capture and whole-row fill use the native free-text shape without a dictionary request',async()=>{
 const {f}=manualFixture();Object.assign(f.model,{branchBankName:manualBank.name,branchBankName_object:[{manager_name:manualBank.name,showValue:manualBank.name}],bankAccount:'1234567890123456',receivableCurrency:678});
 const d=(await f.send('describe')).recipient;assert.deepEqual(d.entry.bank,manualBank);
 const captured=await f.send('capture');assert.ok(captured.descriptors.some(x=>x.key==='recipient'&&x.entry.bank.kind==='manual'));
 f.window.ReimbursementMemoryBridge.getQuery=()=>()=>{throw Error('manual banks must not query')};
 assert.equal((await f.send('apply-recipient',{entry:{name:'Synthetic recipient',bank:manualBank,account:'1111222233334444'},expected:d.value,expectedScope:d.scope,expectedContext:''})).ok,true);
 assert.equal(f.model.branchBankName,manualBank.name);assert.equal(f.model.branchBankName_object[0].manager_name,manualBank.name);assert.equal(f.model.branchBankName_object[0].showValue,manualBank.name);assert.equal(f.model.branchBankName_object[0].id,undefined);assert.equal(f.model.receivableCurrency,678);
});
test('manual recipient validation is scoped, accepts list pages, and does not modify the form',async()=>{
 const f=fixture();f.location.hash='#/reimbursementList';f.window.ReimbursementMemoryBridge.getForm=()=>null;
 const scope=(await f.send('identify')).userScope,before=JSON.stringify(f.model),entry={name:'Synthetic',bank:manualBank,account:'1234567890123456'};
 assert.equal((await f.send('validate-recipient',{entry,expectedScope:scope})).ok,true);assert.equal(JSON.stringify(f.model),before);
 f.changeUser();assert.equal((await f.send('validate-recipient',{entry,expectedScope:scope})).ok,false);
});
test('manual choices invalidate pending dictionary choices and still reject stale, readonly or unsupported rows',async()=>{
 const {f,bank}=manualFixture();const d=(await f.send('describe')).recipient;let finish;
 f.window.ReimbursementMemoryBridge.getQuery=()=>()=>new Promise(r=>finish=r);
 const old=f.send('apply-recipient',{entry:{name:'Old',bank:{id:'old',name:'Old bank',code:'123'},account:'1234567890123456'},expected:d.value,expectedScope:d.scope,expectedContext:''});
 const choice={entry:{name:'New',bank:manualBank,account:'1111222233334444'},expected:d.value,expectedScope:d.scope,expectedContext:''};
 assert.equal((await f.send('apply-recipient',choice)).ok,true);finish({success:true,data:[{id:'old',branch_bank_name:'Old bank',branch_bank_code:'123'}]});assert.equal((await old).ok,false);assert.equal(f.model.bankAccountName,'New');
 assert.equal((await f.send('apply-recipient',choice)).ok,false);
 const current=(await f.send('describe')).recipient;bank.node.readOnly=true;assert.equal((await f.send('apply-recipient',{...choice,expected:current.value})).ok,false);
 const g=manualFixture();g.bank.instance.props.componentInfo.type='select';const x=(await g.f.send('describe')).recipient;assert.equal((await g.f.send('apply-recipient',{...choice,expected:x.value,expectedScope:x.scope})).ok,false);
});
test('a mismatched dictionary object is never silently captured as a manual bank',async()=>{
 const {f}=manualFixture();Object.assign(f.model,{branchBankName:manualBank.name,bankAccount:'1234567890123456'});
 assert.equal((await f.send('describe')).recipient.entry,null);
 Object.assign(f.model,{branchBankName_object:[{manager_name:manualBank.name,showValue:'Old name'}]});assert.equal((await f.send('describe')).recipient.entry,null);
});
test('individual manual-bank selection writes both display fields and allows account recall',async()=>{
 const f=fixture('branchBankName');Object.assign(f.window.ReimbursementMemoryBridge, {getQuery:()=>()=>{throw Error('no query')}});
 const bank={kind:'manual',name:'Manual branch',code:''},d=(await f.send('describe')).descriptor;
 assert.equal((await f.send('apply',{entry:{value:bank.name,record:bank},expected:d.value,expectedScope:d.scope,expectedContext:d.context})).ok,false);
 // Only the native F0003 selectText control can receive the free-text shape.
 const g=manualFixture(),id=g.bank.node.dataset.reMemoryId,desc=(await g.f.send('describe',{fieldId:id})).descriptor;
 assert.equal((await g.f.send('apply',{fieldId:id,entry:{value:bank.name,record:bank},expected:desc.value,expectedScope:desc.scope,expectedContext:desc.context})).ok,true);
 const account=g.f.add('bankAccount'),a=(await g.f.send('describe',{fieldId:account.node.dataset.reMemoryId})).descriptor;assert.equal(a.context,'Recipient|Manual branch');assert.equal(g.f.model.branchBankName_object[0].showValue,'Manual branch');
});
