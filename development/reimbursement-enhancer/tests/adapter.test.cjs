const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const core=require('../extension/core.js');
const settle=()=>new Promise(setImmediate);
function fixture(saved=10,nativeWatch=false){
 const pending=[],timers=new Map(),intervals=[],watchers=[];let serial=0;
 const form={formId:'c3771358d145490f9e363790c0519fde',state:2,totalAmount:saved,activitys:[{ASX060401:saved,behaviors:[{BSX060206:saved,behaviorDetail:[{BSX070306:10}]}]}],receivableInfo:[{actualReceivableCurrency:10}]};
 const ref=v=>({__ref:true,value:v});
 const vue={isRef:v=>!!v?.__ref,reactive:v=>v,computed:f=>({__ref:true,get value(){return f()}})};
 if(nativeWatch)vue.watch=(get,callback)=>watchers.push({get,callback});
 const modules={f2bf:vue,d3ae:{a:{form}},f375:{Q:body=>new Promise(resolve=>pending.push({body,resolve}))}};
 const requireModule=id=>modules[id];requireModule.c=Object.fromEntries(Object.entries(modules).map(([k,v])=>[k,{exports:v}]));
 const props={componentInfo:{key:'branchBankName',postUrl:'F0003',dataSource:'post',refTableShowField:[{name:'支行名称',code:'branch_bank_name'}]},formProps:{branchBankName:'original',branchBankName_object:[{id:'original'}]}};
 const oldState=()=>({page:ref({currentPage:1,pageSize:20,totalPage:0}),optionList:ref([]),showCols:ref([]),spinning:ref(false),onSearch:()=>{},handleEnter:()=>{},onMouseLeave:()=>{},dropdownVisibleChange:()=>{props.formProps.branchBankName=''},onChangePagination:()=>{},onSelect:(id,row)=>{props.formProps.branchBankName=id;props.formProps.branchBankName_object=[row]},selectChange:()=>{}});
 const bank={name:'selectTextCmpt',setup:oldState};
 const app={config:{},_context:{components:{bank}},_vnode:{}};
 const events={};const window={ReimbursementEnhancerCore:core,addEventListener:(type,fn)=>events[type]=fn,webpackJsonp:[]};
 window.webpackJsonp.push=item=>{Object.values(item[1])[0]({}, {}, requireModule)};
 const sandbox={window,document:{documentElement:{},addEventListener(){},querySelector:()=>({__vue_app__:app})},MutationObserver:class{observe(){}},location:{hostname:'wsbx.wbu.edu.cn',origin:'http://wsbx.wbu.edu.cn',hash:'#/reimbursementCreate'},setInterval:f=>intervals.push(f),setTimeout:f=>{timers.set(++serial,f);return serial},clearTimeout:id=>timers.delete(id),Symbol,console};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../extension/enhance.js','utf8'),sandbox);
 const state=bank.setup(props,{});
 return {state,props,pending,form,intervals,watchers,app,vue,window,configure(settings){events.message({source:window,origin:'http://wsbx.wbu.edu.cn',data:{type:'reimbursement-enhancer-settings',settings}})},notify(){watchers[0].get();watchers[0].callback()},flush(){for(const [id,f]of [...timers]){timers.delete(id);f()}},tick(){intervals[0]()}};
}
test('native bank adapter keeps original selection, debounces and ignores old responses',async()=>{
 const f=fixture();f.state.dropdownVisibleChange(true);assert.equal(f.props.formProps.branchBankName,'original');
 f.pending[0].resolve({success:true,data:[],totalRecord:0});await settle();
 f.state.onSearch('工行 武汉');assert.equal(f.pending.length,1);f.flush();assert.equal(f.pending.length,2);
 assert.deepEqual(JSON.parse(JSON.stringify(f.pending[1].body.customCondition)),core.condition('工行 武汉'));
 f.state.onSearch('邮储 松滋');f.flush();
 f.pending[2].resolve({success:true,data:[{id:'new'}],totalRecord:1});await settle();
 f.pending[1].resolve({success:true,data:[{id:'old'}],totalRecord:1});await settle();
 assert.equal(f.state.optionList.value[0].id,'new');
 f.state.onMouseLeave();assert.equal(f.props.formProps.branchBankName,'original');
 f.state.onSelect('new',{id:'new',branch_bank_name:'full name'});assert.equal(f.props.formProps.branchBankName,'new');
});
test('native import and export icons are hidden without invoking file handlers; attachment upload remains',()=>{
 const f=fixture(),state={downFile(){throw Error('must not download')},upFile(){throw Error('must not import')},isBtnShow:()=>true};
 f.app._vnode={component:{type:{name:'table'},props:{},setupState:state,isMounted:true,update(){}}};f.tick();
 assert.equal(state.isBtnShow({},'importData'),false);assert.equal(state.isBtnShow({},'expData'),false);assert.equal(state.isBtnShow({},'uploadAttachment'),true);
 f.configure({enabled:false});assert.equal(state.isBtnShow({},'expData'),true);
});
test('mounted summary keeps the native computed ref when automatic summing is disabled',()=>{
 const f=fixture(),native=f.vue.computed(()=> 'native:'+f.form.receivableInfo.reduce((n,r)=>n+Number(r.actualReceivableCurrency),0));
 const raw={totalActualReceivableCurrency:native},state=new Proxy(raw,{get:(obj,key)=>obj[key]?.__ref?obj[key].value:obj[key]});
 f.app._vnode={component:{type:{name:'summary'},props:{collapse:{option:{key:'paymentsAndReceipts'}}},setupState:state,isMounted:true,update(){}}};
 f.tick();assert.equal(state.totalActualReceivableCurrency,'10.00');
 f.form.receivableInfo[0].actualReceivableCurrency=14;assert.equal(state.totalActualReceivableCurrency,'14.00');
 f.configure({totals:false});assert.equal(state.totalActualReceivableCurrency,'native:14');
});
test('native amount watcher updates immediately without rewriting a mismatched saved total on opening',()=>{
 const f=fixture(99,true);assert.equal(f.form.totalAmount,99);assert.equal(f.watchers.length,1);
 f.form.activitys[0].behaviors[0].behaviorDetail=[{BSX070306:'0.10'},{BSX070306:'0.20'}];f.notify();assert.equal(f.form.totalAmount,0.3);
 assert.equal(f.form.receivableInfo[0].actualReceivableCurrency,10);
 f.form.activitys[0].behaviors[0].behaviorDetail=[];f.notify();assert.equal(f.form.totalAmount,0);
});
test('closing bank dropdown invalidates in-flight query',async()=>{
 const f=fixture();f.state.dropdownVisibleChange(true);f.state.dropdownVisibleChange(false);
 f.pending[0].resolve({success:true,data:[{id:'late'}],totalRecord:1});await settle();
 assert.equal(f.state.optionList.value.length,0);assert.equal(f.state.spinning.value,false);
});
test('travel adapter does not rewrite initial saved amount; edits and clearing synchronize totals',()=>{
 const f=fixture();assert.equal(f.form.totalAmount,10);
 f.form.activitys[0].behaviors[0].behaviorDetail[0].BSX070306='0.10';f.tick();
 assert.equal(f.form.totalAmount,0.1);assert.equal(f.form.activitys[0].behaviors[0].BSX060206,0.1);
 f.form.activitys[0].behaviors[0].behaviorDetail=[];f.tick();assert.equal(f.form.totalAmount,0);
 assert.equal(f.form.receivableInfo[0].actualReceivableCurrency,10);
});
test('multiple classified expenses update their subtotals and form total while keeping payees unchanged',()=>{
 const f=fixture(99,true),a=f.form.activitys[0];
 a.behaviors=[{behaviorMetaName:'Transport',BSX060206:0,behaviorDetail:[{BSX070304:'20.05'}]},{behaviorMetaName:'Hotel',BSX060206:0,behaviorDetail:[{BSX070306:'30.10'},{BSX070306:'0.20'}]},{behaviorMetaName:'Allowance',BSX060206:0,behaviorDetail:[{BSX070306:'10.00'}]},{behaviorKey:'summary',BSX060206:1000,behaviorDetail:[{BSX070306:1000}]}];
 f.notify();assert.equal(f.form.totalAmount,60.35);assert.equal(a.behaviors[0].BSX060206,20.05);assert.equal(a.behaviors[1].BSX060206,30.3);assert.equal(a.behaviors[2].BSX060206,10);assert.equal(a.ASX060401,60.35);assert.equal(f.form.receivableInfo[0].actualReceivableCurrency,10);
 f.configure({totals:false});a.behaviors[0].behaviorDetail[0].BSX070304=100;f.notify();assert.equal(f.form.totalAmount,60.35);
});
