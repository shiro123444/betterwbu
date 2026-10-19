const test = require('node:test'), assert = require('node:assert/strict');
const preflight = require('../extension/expense-preflight.js');
const formId = 'c3771358d145490f9e363790c0519fde';
const fee = (category,row) => ({behaviorMetaName:category,behaviorDetail:[row]});
const form = behaviors => ({formId,activitys:[{activityMetaName:'常规差旅',behaviors}]});
const link = (used='159.00') => ({BSX070802:'invoice',BSX070807:'barcode',BSX070803:'0',BSX070804:used,BSX070809:'train',BSX070811:'1'});
const allowance = () => ({BSX070306:'300.00',BTSSX0402:'测试人员',BTSSX0406_BTSSX0407_BTSSX0408:['340000','340100',''],BSX071301:100,BTSSX0409:3,BTSSX0403:'2026-07-17',BTSSX0404:'2026-07-19',BTSSX0412:0});

test('reproduces the four reported problems without changing the draft', () => {
  const f = form([fee('城市间交通费',{BSX070306:1296,BSX0709:[]}),fee('改签、退票费',{BSX070306:2,BSX0709:[]}),...['用餐补贴','市内交通补贴'].map((category,i)=>fee(category,{BSX070306:i?240:300,BTSSX0402:'测试人员',BTSSX0403:'2026-07-17',BTSSX0404:'2026-07-19',BTSSX0412:0}))]);
  const before = structuredClone(f), issues = preflight.inspect(f);
  assert.deepEqual(issues.map(i=>i.code),['invoice-missing','invoice-missing','allowance-basis-missing','allowance-basis-missing']);
  assert.match(issues[0].message,/城市间交通费.*1296.00/);
  assert.match(issues[2].message,/补贴地、标准、补贴天数/);
  assert.deepEqual(f,before);
});
test('valid native links and complete allowance basis pass, with zero support links ignored', () => {
  const f = form([fee('城市间交通费',{BSX070306:159,BSX0709:[link(),{BSX070811:'0',BSX070804:0}]}),fee('用餐补贴',allowance()),{behaviorKey:'summary',behaviorMetaName:'总览',behaviorDetail:[{BSX070306:9999}]}]);
  assert.deepEqual(preflight.inspect(f),[]);
  assert.deepEqual(preflight.inspect(JSON.stringify(f)),[]);
  const a=allowance();delete a.BTSSX0406_BTSSX0407_BTSSX0408;a.BTSSX0406='340000';a.BTSSX0407='340100';assert.deepEqual(preflight.inspect(form([fee('用餐补贴',a)])),[]);
});
test('missing invoice line, zero use and shortfall are distinct from uploaded cards', () => {
  for (const bad of [{...link(),BSX070803:''},{...link(),BSX070804:0},{...link(),BSX070807:''}]) assert.equal(preflight.inspect(form([fee('城市间交通费',{BSX070306:159,BSX0709:[bad]})]))[0].code,'invoice-incomplete');
  assert.equal(preflight.inspect(form([fee('改签、退票费',{BSX070306:2,BSX0709:[link('1.00')]})]))[0].code,'invoice-shortfall');
});
test('catches invoice reuse across categories using selected source totals and exact cents', () => {
  const f=form([fee('城市间交通费',{BSX070306:'158.99',BSX0709:[link('158.99')]}),fee('改签、退票费',{BSX070306:'0.02',BSX0709:[link('0.02')]})]);
  f.billVOList=[{dataType:5,subBillCards:[{dataId:'invoice',barcode:'barcode',totalAmount:'159.00'}]}];
  assert.equal(preflight.inspect(f)[0].code,'invoice-reused');
  f.activitys[0].behaviors[1].behaviorDetail[0].BSX070306='0.01';f.activitys[0].behaviors[1].behaviorDetail[0].BSX0709[0].BSX070804='0.01';assert.deepEqual(preflight.inspect(f),[]);
});
test('allowance checks actual native basis, deductions, calendar dates and overlap without inventing a policy rate', () => {
  const scan=row=>preflight.inspect(form([fee('用餐补贴',row)])).map(i=>i.code);
  assert.ok(scan({...allowance(),BSX071301:' '}).includes('allowance-basis-missing'));
  assert.ok(scan({...allowance(),BTSSX0409:' '}).includes('allowance-basis-missing'));
  assert.ok(scan({...allowance(),BTSSX0409:2}).includes('allowance-days'));
  assert.ok(scan({...allowance(),BTSSX0412:100}).includes('allowance-over-limit'));
  assert.ok(scan({...allowance(),BTSSX0412:-1}).includes('allowance-deduction'));
  assert.ok(scan({...allowance(),BTSSX0403:'2026-02-30'}).includes('allowance-dates'));
  assert.ok(scan({...allowance(),BTSSX0402:''}).includes('allowance-person'));
  assert.deepEqual(scan({...allowance(),BSX070306:150,BSX071301:50}),[]);
  const f=form([fee('用餐补贴',allowance()),fee('用餐补贴',{...allowance(),BTSSX0403:'2026-07-19',BTSSX0404:'2026-07-21'})]);
  assert.ok(preflight.inspect(f).some(i=>i.code==='allowance-overlap'));
  f.activitys[0].behaviors[1].behaviorDetail[0].BTSSX0402='另一人员';assert.deepEqual(preflight.inspect(f),[]);
});
test('zero rows and other form schemas are not blocked', () => {
  assert.deepEqual(preflight.inspect(form([fee('用餐补贴',{BSX070306:0})])),[]);
  assert.deepEqual(preflight.inspect({...form([fee('城市间交通费',{BSX070306:2})]),formId:'other'}),[]);
});

test('native unused category rows are ignored but partially entered expenses still require an amount', () => {
  const f=form(['过路过桥','交通意外险','燃油费','车辆租赁','其他'].map(category=>fee(category,{id:'native-row',BSX070109:'默认人员',BSX070306:' ',BSX0709:[]})));
  assert.deepEqual(preflight.inspect(f),[]);
  f.activitys[0].behaviors[0].behaviorDetail[0].BSX070110='已填写费用说明';
  assert.equal(preflight.inspect(f)[0].code,'amount-invalid');
  assert.equal(preflight.inspect(form([fee('其他',{BSX070306:'abc'})]))[0].code,'amount-invalid');
});
