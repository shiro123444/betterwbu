const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('../extension/core.js'),invoices=require('../extension/invoice-core.js');
function fakeDocument(){
 const nodes=[];
 function element(tag){const attrs={},events={};const n={tagName:tag.toUpperCase(),nodeType:1,isConnected:true,dataset:{},style:{},className:'',textContent:'',value:'',children:[],disabled:false,hidden:false,checked:false,open:false,append(...items){for(const x of items)if(typeof x==='object'){this.children.push(x);x.parentNode=this}},after(x){this.parentNode.append(x)},replaceChildren(){this.children=[]},setAttribute(k,v){attrs[k]=String(v)},getAttribute:k=>attrs[k]??null,removeAttribute(k){delete attrs[k]},addEventListener(k,f){(events[k] ||= []).push(f)},fire(k){for(const f of events[k]||[])f({target:this})},closest(){return null},querySelector(sel){return this.querySelectorAll(sel)[0]||null},querySelectorAll(sel){const q=[...this.children],out=[];while(q.length){const x=q.shift();if((sel.startsWith('.')&&x.className.split(' ').includes(sel.slice(1)))||sel.split(',').includes(x.tagName.toLowerCase()))out.push(x);q.push(...x.children)}return out},showModal(){this.open=true},close(){this.open=false}};nodes.push(n);return n}
 const body=element('body'),anchor=element('button');anchor.className='fileFold';body.append(anchor);
 const document={body,nodes,createElement:element,querySelector:()=>null,querySelectorAll:()=>[anchor],control:label=>nodes.slice().reverse().find(n=>n.getAttribute('aria-label')===label),dialog:()=>nodes.find(n=>n.tagName==='DIALOG'),button:text=>nodes.slice().reverse().find(n=>n.tagName==='BUTTON'&&n.textContent===text)};
 return document;
}
function fixture({manual=false,fail=false,separateNative=false,ui=false,rich=[]}={}){
 const root=()=>({nodeType:1,isConnected:true,closest:()=>null});
 const templates=[{activityMetaId:'travel',activityMetaName:'常规差旅',ASX060401:0,behaviors:['城市间交通费','住宿','用餐补贴','市内交通补贴'].map((name,i)=>({behaviorMetaName:name,behaviorMetaId:String(i),behaviorDetail:[{option:{list:['BSX070306','BSX070303','BSX070110','BTSSX0402','BTSSX0403','BTSSX0404','BTSSX0409','BSX071301','BTSSX0412'].map(key=>({option:{key}}))}}]}))}];
 const form={formId:'c3771358d145490f9e363790c0519fde',reimbursementId:'draft',state:2,totalAmount:manual?'7.00':'0.00',totalAmountOrigin:'0.00',billVOList:[{barcode:'a',totalAmount:'10.05',ticketName:'铁路电子客票',billData:{trainNO:'G1'}}]};
 const manualRow={key:'manual',BSX070306:'7.00',BSX070110:'手填说明'};
 if(manual)form.activitys=[{activityMetaId:'travel',ASX060401:'7.00',behaviors:[{behaviorMetaId:'0',behaviorMetaName:'城市间交通费',BSX060206:'7.00',behaviorDetail:[manualRow]}]}];
 const native=separateNative?{...form}:form;
 const main={subTree:{el:root()},props:{componentInfo:{key:'activitys'}},setupState:{form:native,isEdit:{data:true},activityOptionList:templates,onAddTableList:a=>{native.activitys ||= [];native.activitys.push(a)}}};
 const events={},window={ReimbursementInvoiceCore:invoices,addEventListener:(k,f)=>events[k]=f},document=ui?fakeDocument():{querySelector:()=>null};let richData=rich;document.querySelector=selector=>selector==='iframe.iframe-box1'?{contentWindow:'details',contentDocument:{querySelector:()=>({__vue__:{sourceData:richData}})}}:null;
 vm.runInNewContext(fs.readFileSync(__dirname+'/../extension/invoices.js','utf8'),{window,document,location:{hash:'#/reimbursementCreate',origin:'http://test'}});
 const api=window.ReimbursementInvoiceTools;let activeForm=form,count=0,watch;
 const refresh=()=>{for(const a of form.activitys||[])api.register({subTree:{el:root()},props:{tableRecord:a},setupState:{isEdit:{data:true},onAddBehaviorList:b=>a.behaviors.push(b),onAddTableList:b=>{b.behaviorDetail ||= []; b.behaviorDetail.push({key:'native-'+(++count)})}}})};
 api.bind({form:()=>activeForm,settings:{enabled:true,totals:true},raw:x=>x,watch:(fn,changed)=>{watch=changed;return ()=>{}},nextTick:async()=>{},refresh,compute:f=>{if(fail)throw Error('native failure');for(const p of core.travelPlan(f))p.target[p.key]=String((p.amount/100).toFixed(2));}});
 api.register(main);refresh();
 return {api,form,native,main,manualRow,document,events,setRich:b=>richData=b,notify:()=>watch(),replace:()=>activeForm={...form}};
}
test('empty forms initialize through native activity and row handlers and sync a stale injected form',async()=>{
 const f=fixture({separateNative:true});const p=f.api.prepare();const r=await f.api.apply(p);
 assert.equal(r.count,1);assert.equal(f.form.totalAmount,'10.05');assert.equal(f.form.activitys,f.native.activitys);
 assert.equal(f.form.activitys[0].behaviors[0].behaviorDetail[0].key,'native-1');
 assert.equal(f.form.activitys[0].behaviors[0].behaviorDetail[0].BSX070306,10.05);
});
test('appending preserves manual rows and detects an already generated invoice',async()=>{
 const f=fixture({manual:true});await f.api.apply(f.api.prepare(undefined,'append'));
 assert.equal(f.form.activitys[0].behaviors[0].behaviorDetail[0],f.manualRow);assert.equal(f.manualRow.BSX070306,'7.00');assert.equal(f.form.totalAmount,'17.05');
 const second=f.api.prepare(undefined,'append');assert.equal(second.rows[0].blocked,true);assert.equal(second.rows[0].selected,false);
 await assert.rejects(f.api.apply(second),/选择分类/);
});
test('changed invoice selections and replaced forms reject stale previews',async()=>{
 const f=fixture(),p=f.api.prepare();f.form.billVOList[0].totalAmount='99';await assert.rejects(f.api.apply(p),/已变化/);assert.equal(f.form.activitys,undefined);
 const g=fixture(),q=g.api.prepare();g.replace();await assert.rejects(g.api.apply(q),/已变化/);
});
test('a failure restores existing arrays, rows and totals, and removes newly added subtotal fields',async()=>{
 const f=fixture({manual:true,fail:true}),activity=f.form.activitys[0],behavior=activity.behaviors[0],rows=behavior.behaviorDetail;
 await assert.rejects(f.api.apply(f.api.prepare()),/native failure/);
 assert.equal(behavior.behaviorDetail,rows);assert.equal(rows.length,1);assert.equal(rows[0],f.manualRow);assert.equal(f.form.totalAmount,'7.00');assert.equal(behavior.BSX060203,undefined);assert.equal(activity.ASX060301,undefined);
});
test('failure on an initially empty form removes the generated activity array',async()=>{
 const f=fixture({fail:true});await assert.rejects(f.api.apply(f.api.prepare()),/native failure/);assert.equal(Object.hasOwn(f.form,'activitys'),false);assert.equal(f.form.totalAmount,'0.00');
});
test('readonly templates and disabled totals cannot generate rows',()=>{
 for(const mode of ['readonly','disabled']){const f=fixture();if(mode==='readonly')f.main.setupState.isEdit.data=false;else f.api.bind({form:()=>f.form,settings:{enabled:true,totals:false}});assert.throws(()=>f.api.prepare(),/未就绪/)}
});
test('native invoice rows exclude negative payment screenshots and add allowance to total',async()=>{
 const f=fixture();f.form.billVOList.push({barcode:'shot',totalAmount:'-566.92',ticketName:'支付截图'});
 const p=f.api.prepare();p.allowance={enabled:true,confirmed:true,start:'2026-10-11',end:'2026-10-13',region:'outside',people:'测试人员'};
 const result=await f.api.apply(p);
 assert.equal(result.count,3);assert.equal(f.form.totalAmount,'550.05');
 const meal=f.form.activitys[0].behaviors.find(b=>b.behaviorMetaName==='用餐补贴').behaviorDetail[0];
 assert.equal(meal.BSX070306,300);assert.equal(meal.BSX071301,100);assert.equal(meal.BTSSX0409,3);assert.equal(meal.BTSSX0402,'测试人员');
 const second=f.api.prepare(undefined,'append');second.allowance=p.allowance;await assert.rejects(f.api.apply(second),/已生成/);
});
test('overlapping allowances for same person are rejected and other people can be added',async()=>{
 const f=fixture(),p=f.api.prepare(undefined,'append');p.allowance={enabled:true,confirmed:true,start:'2026-10-11',end:'2026-10-13',region:'hubei',people:'甲'};await f.api.apply(p);
 const q=f.api.prepare(undefined,'append');q.allowance={...p.allowance,start:'2026-10-13',end:'2026-10-14'};await assert.rejects(f.api.apply(q),/已生成/);
 q.allowance.people='乙';await f.api.apply(q);assert.equal(f.form.totalAmount,'760.05');
});
test('external personnel activity cannot apply employee allowance preset',async()=>{
 const f=fixture();f.main.setupState.activityOptionList[0].activityMetaName='校外人员差旅';const p=f.api.prepare();p.allowance={enabled:true};await assert.rejects(f.api.apply(p),/不适用/);
});
test('default updates the selected category instead of stacking on manual amounts; repeat is idempotent',async()=>{
 const f=fixture({manual:true}),p=f.api.prepare();assert.equal(p.mode,'replace');await f.api.apply(p);
 assert.equal(f.form.totalAmount,'10.05');assert.equal(f.form.activitys[0].behaviors[0].behaviorDetail.length,1);assert.notEqual(f.form.activitys[0].behaviors[0].behaviorDetail[0],f.manualRow);
 const q=f.api.prepare();assert.equal(q.rows[0].blocked,false);await f.api.apply(q);assert.equal(f.form.totalAmount,'10.05');assert.equal(f.form.activitys[0].behaviors[0].behaviorDetail.length,1);
});
test('real regression replaces 5133 traffic, 4088.50 lodging and old subsidy without inflating total',async()=>{
 const f=fixture({manual:true});f.form.billVOList=[{barcode:'traffic',totalAmount:'5133',ticketName:'铁路电子客票',billData:{trainNO:'G1'}},{barcode:'hotel-a',totalAmount:'3172.20',ticketName:'电子发票',billData:{hotel:[{}]}},{barcode:'hotel-b',totalAmount:'971.28',ticketName:'电子发票',billData:{hotel:[{}]}}];
 const activity=f.form.activitys[0];activity.behaviors[0].behaviorDetail[0].BSX070306='5133';
 for(const [name,value] of [['住宿','4088.50'],['用餐补贴','100'],['市内交通补贴','80']])activity.behaviors.push({behaviorMetaName:name,behaviorDetail:[{BSX070306:value}]});
 const p=f.api.prepare();assert.equal(invoices.projection(f.form,p.activityId,p.rows).amount,945648);
 p.allowance={enabled:true,confirmed:true,start:'2026-08-17',end:'2026-08-20',region:'outside',people:'测试人员'};await f.api.apply(p);
 assert.equal(f.form.totalAmount,'9996.48');assert.equal(activity.behaviors.find(b=>b.behaviorMetaName==='住宿').BSX060206,'4143.48');assert.equal(activity.behaviors.find(b=>b.behaviorMetaName==='城市间交通费').BSX060206,'5133.00');
 const q=f.api.prepare();q.allowance=p.allowance;await f.api.apply(q);assert.equal(f.form.totalAmount,'9996.48');
});
test('updates preserve other categories and activities and replace all-excluded allowances with zero',async()=>{
 const f=fixture({manual:true});const a=f.form.activitys[0];const untouched={behaviorMetaName:'其他',behaviorDetail:[{BSX070306:'12'}]};a.behaviors.push(untouched,{behaviorMetaName:'用餐补贴',behaviorDetail:[{BSX070306:100}]},{behaviorMetaName:'市内交通补贴',behaviorDetail:[{BSX070306:80}]});
 const other={activityMetaId:'other',behaviors:[{behaviorMetaName:'住宿',behaviorDetail:[{BSX070306:'20'}]}]};f.form.activitys.push(other);
 const p=f.api.prepare();p.allowance={enabled:true,confirmed:true,start:'2026-08-17',end:'2026-08-20',region:'outside',people:'测试人员',mealExcluded:4,transportExcluded:4};await f.api.apply(p);
 assert.equal(f.form.totalAmount,'42.05');assert.equal(a.behaviors.find(b=>b.behaviorMetaName==='用餐补贴').behaviorDetail.length,0);assert.equal(a.behaviors.find(b=>b.behaviorMetaName==='其他'),untouched);assert.equal(f.form.activitys[1],other);
});
const settle=()=>new Promise(setImmediate);
test('open preview refreshes changed selection and late rich data, preserving edited dates and choices',async()=>{
 const f=fixture({ui:true});f.form.billVOList=[{barcode:'old',totalAmount:'916.30',ticketName:'电子发票',billData:{hotel:[{}]}},{barcode:'stay',totalAmount:'971.28',ticketName:'酒店住宿流水单',billData:{dateOfArrive:'20260817',dateOfDeparture:'20260820'}}];
 f.api.mount();f.document.button('从票据生成明细').fire('click');assert.equal(f.document.dialog().open,true);assert.equal(f.document.control('出差开始日期').value,'2026-08-17');
 const start=f.document.control('出差开始日期');start.value='2026-08-16';start.fire('input');
 f.form.billVOList[0]={barcode:'new',totalAmount:'971.28',ticketName:'电子发票'};f.notify();await settle();assert.deepEqual(f.document.dialog().querySelectorAll('.re-invoice-amount').map(n=>n.textContent),['¥971.28','¥971.28']);
 f.setRich([{barcode:'new',billData:{hotel:[{}]}}]);f.api.mount();assert.equal(f.document.control('出差开始日期').value,'2026-08-16');assert.equal(f.document.control('费用分类：电子发票').value,'住宿');
 const select=f.document.control('费用分类：电子发票');select.value='城市间交通费';select.fire('change');f.form.billVOList[1].billData.dateOfDeparture='20260821';f.notify();await settle();assert.equal(f.document.control('费用分类：电子发票').value,'城市间交通费');assert.equal(f.document.control('出差结束日期').value,'2026-08-21');assert.equal(f.document.control('出差开始日期').value,'2026-08-16');
});
test('pending rich preview blocks generation until matching completion from the actual iframe',async()=>{
 const f=fixture({ui:true});f.api.mount();f.document.button('从票据生成明细').fire('click');
 const send=(phase,op,source='details')=>f.events.message({origin:'http://test',source,data:{type:'reimbursement-wallet-state',phase,operation:op}});
 send('preview-start',3);await settle();assert.equal(f.document.button('更新费用明细').disabled,true);await assert.rejects(f.api.apply(f.api.prepare()),/仍在更新/);
 send('ready',2);await settle();assert.equal(f.document.button('更新费用明细').disabled,true);send('ready',3,'unrelated');await settle();assert.equal(f.document.button('更新费用明细').disabled,true);send('ready',3);await settle();assert.equal(f.document.button('更新费用明细').disabled,false);
});
test('changing rich invoice metadata invalidates a prepared plan even when selection is unchanged',async()=>{
 const f=fixture({rich:[{barcode:'a',billData:{trainNO:'G1'}}]}),p=f.api.prepare();f.setRich([{barcode:'a',billData:{trainNO:'G2'}}]);await assert.rejects(f.api.apply(p),/已变化/);assert.equal(f.form.activitys,undefined);
});
test('undo restores replaced manual rows and original totals without saving the form',async()=>{
 const f=fixture({ui:true,manual:true}),activity=f.form.activitys[0],rows=activity.behaviors[0].behaviorDetail;f.api.mount();await f.api.apply(f.api.prepare());f.api.mount();const undo=f.document.button('撤销本次生成');assert.equal(undo.hidden,false);undo.fire('click');assert.equal(f.form.totalAmount,'7.00');assert.equal(activity.behaviors[0].behaviorDetail,rows);assert.equal(rows.length,1);assert.equal(rows[0],f.manualRow);assert.equal(undo.hidden,true);
});
