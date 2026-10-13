const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('../extension/core.js');
class Node{constructor(tag){this.tagName=tag;this.nodeType=1;this.isConnected=true;this.children=[];this.dataset={};this.style={};this.events={};this.classList={contains:k=>k==='table-level2-box'}}append(...nodes){this.children.push(...nodes)}prepend(n){this.children.unshift(n)}replaceChildren(){this.children=[]}setAttribute(){}addEventListener(k,f){this.events[k]=f}}
function fixture(){
 const activity={activityMetaId:'travel',ASX060401:0.3,behaviors:[{behaviorMetaId:'transport',behaviorMetaName:'Transport',BSX060206:0.3,behaviorDetail:[{BSX070306:'0.10'},{BSX070306:'0.20'}]}]};
 const form={formId:'c3771358d145490f9e363790c0519fde',state:2,totalAmount:0.3,activitys:[activity]},templates=[{activityMetaId:'travel',behaviors:[{behaviorMetaId:'transport',behaviorMetaName:'Transport'},{behaviorMetaId:'hotel',behaviorMetaName:'Hotel',BSX060206:0,behaviorDetail:[{BSX070306:999}]}]}];
 const root=new Node('div'),state={tabActiveKey:0,isEdit:{data:true},onAddBehaviorList:c=>activity.behaviors.push(c),tabChange:i=>state.selected=Number(i),onAddTableList:c=>c.behaviorDetail.push({key:'blank'})};
 const instance={subTree:{el:root},props:{tableRecord:activity},setupState:state,parent:{setupState:{activityListApi:templates}}},settings={enabled:true},window={};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../extension/expenses.js','utf8'),{window,document:{createElement:t=>new Node(t)}});window.ReimbursementExpenseTools.mount(instance,form,settings);
 return {window,form,activity,state,settings,instance,root,select:root.children[0].children[0]};
}
test('adding a configured category opens its own blank row, leaves existing expenses intact and totals precisely',()=>{
 const f=fixture();f.select.value='hotel';f.select.events.change();
 assert.equal(f.activity.behaviors.length,2);assert.equal(f.state.selected,1);assert.equal(f.state.tabActiveKey,1);assert.equal(f.activity.behaviors[1].behaviorDetail.length,1);assert.equal(f.activity.behaviors[1].behaviorDetail[0].BSX070306,undefined);
 f.activity.behaviors[1].behaviorDetail[0].BSX070306='20.05';const plan=core.travelPlan(f.form);assert.equal(plan.at(-1).amount,2035);
 f.select.value='hotel';f.select.events.change();assert.equal(f.activity.behaviors.length,2);assert.equal(f.activity.behaviors[0].behaviorDetail[1].BSX070306,'0.20');
});
test('readonly, disabled and stale activity targets cannot receive new expense categories',()=>{
 for(const mode of ['readonly','disabled','stale']){const f=fixture();if(mode==='readonly')f.state.isEdit.data=false;if(mode==='disabled')f.settings.enabled=false;if(mode==='stale')f.form.activitys=[];f.select.value='hotel';f.select.events.change();assert.equal(f.activity.behaviors.length,1)}
});
