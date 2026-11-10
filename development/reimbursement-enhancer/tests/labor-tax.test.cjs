const test = require('node:test'), assert = require('node:assert/strict');
const tax = require('../extension/labor-tax.js');
const draft = () => ({formId:'56b47a2292324bb59be137ff748e3826', reimbursementId:'labor-draft', state:2, totalAmount:'7200.00',
  activitys:[{behaviors:[{behaviorMetaName:'其他学生劳务',behaviorDetail:[
    {BSX070306:'2400',BTSSX1313:'2080',BTSSX1311:''},
    {BSX070306:'4800',BTSSX1313:'4032',BTSSX1311:''}
  ]}]}],receivableInfo:[{receivableCurrency:'6112',actualReceivableCurrency:'6112'}]});
function fixture(answer=true) {
  const form=draft(),location={hash:'#/reimbursementCreate?formEditId=labor-draft'};
  let listener,enabled=true,nativeCalls=0,confirmCalls=0,stopped=0,confirm=()=>answer;
  const document={addEventListener(type,fn,capture){assert.equal(type,'click');assert.equal(capture,true);listener=fn},removeEventListener(type,fn,capture){assert.equal(listener,fn);assert.equal(capture,true);listener=null}};
  const button={disabled:false,isConnected:true,textContent:'提 交',getAttribute:()=>null,click(){const event={target:{closest:()=>button},preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true;stopped++}};listener?.(event);if(!event.stopped)nativeCalls++}};
  const window={confirm(message){confirmCalls++;assert.match(message,/1088\.00 元/);return confirm(message)}};
  const dispose=tax.install({document,window,location,form:()=>form,enabled:()=>enabled});
  return {form,location,button,dispose,configure(fn){confirm=fn},disable(){enabled=false},counts:()=>({nativeCalls,confirmCalls,stopped})};
}
test('gross/net difference is reported in cents without filling blank taxes or changing the draft',()=>{
  const form=draft(),before=structuredClone(form),r=tax.describe(form);
  assert.deepEqual(r,{gross:720000,net:611200,difference:108800,recordedTax:0,missingTax:true,total:720000,receivable:611200,actual:611200});
  assert.match(tax.message(r),/个税栏未填写/);assert.match(tax.message(r),/确认.*继续提交/);assert.deepEqual(form,before);
  form.activitys[0].behaviors[0].behaviorDetail[0].BTSSX1311=320;
  form.activitys[0].behaviors[0].behaviorDetail[1].BTSSX1311=768;
  assert.equal(tax.describe(form).recordedTax,108800);assert.equal(tax.describe(form).missingTax,false);
});
test('confirmed tax difference invokes the untouched native button once and preserves every amount',()=>{
  const f=fixture(),before=structuredClone(f.form);f.button.click();
  assert.deepEqual(f.counts(),{nativeCalls:1,confirmCalls:1,stopped:1});assert.deepEqual(f.form,before);
  f.button.click();assert.equal(f.counts().nativeCalls,2);assert.equal(f.counts().confirmCalls,2);
});
test('cancel does not submit, and retry can continue after one fresh confirmation',()=>{
  const f=fixture(false);f.button.click();assert.equal(f.counts().nativeCalls,0);
  f.configure(()=>true);f.button.click();assert.equal(f.counts().nativeCalls,1);assert.equal(f.counts().confirmCalls,2);
});
test('other forms, no tax, readonly state, route changes and disabled extension retain native behavior',()=>{
  for(const change of [f=>f.form.formId='other',f=>f.form.state=6,f=>f.location.hash='#/reimbursementList',f=>f.location.hash='#/reimbursementCreate?formEditId=other',f=>f.disable(),f=>{for(const r of f.form.activitys[0].behaviors[0].behaviorDetail)r.BTSSX1313=r.BSX070306}]){
    const f=fixture();change(f);f.button.click();assert.equal(f.counts().nativeCalls,1);assert.equal(f.counts().confirmCalls,0);
  }
});
test('confirmation applies to the reviewed draft and recipients only',()=>{
  for(const change of [f=>f.form.receivableInfo[0].actualReceivableCurrency=1,f=>f.form.receivableInfo[0].bankAccountName='changed',f=>f.location.hash='#/reimbursementList',f=>f.button.isConnected=false]){
    const f=fixture();f.configure(()=>{change(f);return true});f.button.click();assert.equal(f.counts().nativeCalls,0);
  }
});
test('an unavailable confirmation does not lock submission and disposal restores native clicks',()=>{
  const f=fixture();f.configure(()=>{throw Error('dialog unavailable')});f.button.click();assert.equal(f.counts().nativeCalls,1);
  // No HTTP or validation hook is installed: the native click owns its result.
  f.dispose();f.button.click();assert.equal(f.counts().nativeCalls,2);
});
test('an explicitly recorded tax still prompts when gross and net have not been separated',()=>{
  const f=draft();for(const row of f.activitys[0].behaviors[0].behaviorDetail)row.BTSSX1313=row.BSX070306;
  f.activitys[0].behaviors[0].behaviorDetail[0].BTSSX1311=320;
  assert.equal(tax.describe(f).recordedTax,32000);
});
test('saved labor report treats the tax difference as confirmation information while preserving unrelated errors',()=>{
  const core=require('../extension/fill-compat-core.js'),form=draft(),before=structuredClone(form);
  let report=core.serverReport({success:true,data:{id:'labor-draft',totalAmount:'7200',reimbData:form}},null);
  assert.deepEqual(report.issues,[]);assert.equal(report.laborTax.difference,108800);assert.deepEqual(form,before);
  form.receivableInfo[0].actualReceivableCurrency='6000';
  report=core.serverReport({success:true,data:{id:'labor-draft',totalAmount:'7200',reimbData:form}},null);
  assert.deepEqual(report.issues,['实收金额与报销总额不一致']);assert.equal(report.laborTax,undefined);
});
test('blank rows, summary duplicates and exact fractional amounts do not inflate the report',()=>{
  const f=draft();f.activitys[0].behaviors.push({behaviorKey:'summary',behaviorDetail:[{BSX070306:'7200',BTSSX1313:'6112'}]});
  f.activitys[0].behaviors[0].behaviorDetail.push({});assert.equal(tax.describe(f).difference,108800);
  const rows=f.activitys[0].behaviors[0].behaviorDetail;rows.splice(0,rows.length,{BSX070306:'0.30',BTSSX1313:'0.20'});
  assert.equal(tax.describe(f).difference,10);
  for(const value of ['invalid','-1','999999999999999999']){rows[0].BTSSX1313=value;assert.equal(tax.describe(f),null)}
});
