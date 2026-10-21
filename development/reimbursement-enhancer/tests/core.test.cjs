const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../extension/core.js');
test('money uses integer cents, validates formatting and preserves signs', () => {
  assert.equal(core.sum([{n:'0.10'},{n:'0.20'}], 'n'), 30);
  assert.equal(core.cents('￥9,266.16'), 926616);
  assert.equal(core.cents('-9266.16'), -926616);
  for (const v of ['1,23.00','1.234','NaN','Infinity','1e3']) assert.throws(() => core.cents(v));
});
test('empty payment rows total zero', () => {
  assert.equal(core.sum([{actualReceivableCurrency:'10.00'}], 'actualReceivableCurrency'), 1000);
  assert.equal(core.sum([], 'actualReceivableCurrency'), 0);
});
test('bank aliases and multiple keywords use AND matching', () => {
  const result = core.condition('  工行  武汉  ');
  assert.deepEqual([...result.and[0].or,...result.and[0].and].map(x=>x.branch_bank_name), ['中国工商银行','武汉']);
  assert.equal(core.condition(' '), null);
});
test('verified travel schema totals only expense detail, does not count invoices again', () => {
  const form={formId:'c3771358d145490f9e363790c0519fde',totalAmount:0,billVOList:[{totalAmount:-9266.16}],activitys:[{ASX060401:'0.00',behaviors:[{BSX060206:0,behaviorDetail:[{BSX070306:100},{BSX070306:80},{BSX070306:9266.16}]}]}]};
  const plan=core.travelPlan(form);assert.equal(plan.at(-1).amount,944616);
  form.activitys[0].behaviors[0].behaviorDetail=[];
  assert.equal(core.travelPlan(form).at(-1).amount,0);
  form.formId='other';assert.equal(core.travelPlan(form),null);
});

test('only the verified travel and conference forms share invoice totals',()=>{
 for(const formId of ['c3771358d145490f9e363790c0519fde','c16d61165e9745b096bd0f1edac339e0']){
 const form={formId,activitys:[{behaviors:[{behaviorMetaName:'会议服务',behaviorDetail:[{BSX070306:'2500.01'}]},{behaviorKey:'summary',behaviorDetail:[{BSX070306:999}]}]}]};
 assert.equal(core.supportsInvoiceForm(form),true);assert.equal(core.travelPlan(form).at(-1).amount,250001);
 }
 assert.equal(core.supportsInvoiceForm({formId:'other'}),false);
});
