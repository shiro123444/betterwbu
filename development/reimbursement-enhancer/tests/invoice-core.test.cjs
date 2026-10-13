const test = require('node:test'), assert = require('node:assert/strict');
const core = require('../extension/invoice-core.js');
const available = core.categories;
const invoice = (id, amount, fields = {}) => ({barcode:id, totalAmount:amount, ticketName:'电子发票（铁路电子客票）', billTitle:'车票', billData:{trainNO:'G123', ...fields}});
test('recognized train and accommodation invoices classify and sum in integer cents', () => {
  const bills = [invoice('a','0.10'),invoice('b','0.20'),{barcode:'c',totalAmount:'20.05',ticketName:'增值税普通发票',billData:{hotel:[{hotelName:'酒店'}]}}];
  const p = core.plan(bills,[],available);
  assert.deepEqual(p.rows.map(r=>r.category),['城市间交通费','城市间交通费','住宿']);
  assert.ok(p.rows.every(r=>r.selected)); assert.equal(core.total(p.rows),2035);
});
test('rich details join by identity, never by card order', () => {
  const selected = [{barcode:'a',totalAmount:'12.30'},{barcode:'b',totalAmount:'20.00'}];
  const rich = [{barcode:'b',ticketName:'增值税发票',billData:{hotel:[{}]}},invoice('a','999')];
  const p = core.plan(selected,rich,available);
  assert.equal(p.rows[0].category,'城市间交通费'); assert.equal(p.rows[0].amountCents,1230);
  assert.equal(p.rows[1].category,'住宿'); assert.equal(core.total(p.rows),3230);
});
test('air ticket accident insurance is classified as insurance while mixed fare invoices require review', () => {
  const insurance=(id)=>({barcode:id,totalAmount:'120',ticketName:'电子发票（普通发票）',billData:{business:'金融服务',details:[{content:'*金融服务*国内机票航空意外险'}]}});
  const p=core.plan([insurance('outbound'),insurance('return')],[],available);
  assert.deepEqual(p.rows.map(r=>r.category),['交通意外险','交通意外险']);assert.ok(p.rows.every(r=>r.selected));assert.equal(core.total(p.rows),24000);
  const mixed=insurance('mixed');mixed.billData.details.push({content:'机票费'});
  const row=core.plan([mixed],[],available).rows[0];assert.equal(row.category,null);assert.equal(row.selected,false);assert.match(row.reason,/多个分类/);
});
test('bundled children and duplicate invoice identities are counted only once', () => {
  const a=invoice('a','10',{invoiceCode:'01',invoiceNO:'123'}), copy=invoice('other','10',{invoiceCode:'01',invoiceNO:'123'});
  const p=core.plan([{barcode:'folder',dataType:'5',totalAmount:'1000',subBillCards:[a,invoice('b','20')]},copy],[],available);
  assert.equal(p.rows.length,2); assert.equal(p.duplicateCount,1); assert.equal(p.containerCount,1); assert.equal(core.total(p.rows),3000);
});
test('statements, supporting docs, zero and invalid amounts cannot generate expenses', () => {
  const p=core.plan([{barcode:'s',ticketName:'情况说明',totalAmount:'100'}, {barcode:'h',ticketName:'酒店住宿流水单',totalAmount:'100'}, invoice('zero','0'),invoice('bad','12.345'), {barcode:'folder',dataType:'5',totalAmount:'100'}],[],available);
  assert.ok(p.rows.every(r=>r.blocked&&!r.selected)); assert.equal(core.total(p.rows),0);
});
test('payment screenshots and negative records do not offset invoice total', () => {
  const p=core.plan([invoice('train','2000'),{barcode:'hotel',ticketName:'增值税普通发票',totalAmount:'844',billData:{hotel:[{}]}},...['-566.92','-634.92','-840.00','50'].map((totalAmount,i)=>({barcode:'shot'+i,ticketName:'支付截图',totalAmount})),invoice('red','-100'),invoice('fx','100',{currency:'USD'})],[],available);
  assert.equal(core.total(p.rows),284400);assert.ok(p.rows.slice(2).every(r=>r.blocked&&!r.selected));
  for(const row of p.rows.slice(2)){row.category='住宿';row.selected=true}
  assert.equal(core.total(p.rows),284400);assert.equal(core.balance(p.rows).net,284400);
});
test('mixed goods, unsupported categories and manual titles do not silently choose a category', () => {
  const mixed=invoice('mixed','50',{details:[{content:'酒店住宿'},{content:'汽油'}]});
  const p=core.plan([mixed,{barcode:'guess',billTitle:'火车票',ticketName:'普通发票',totalAmount:'10',billData:{}}],[],['住宿']);
  assert.ok(p.rows.every(r=>!r.selected&&!r.category)); assert.match(p.rows[0].reason,/多个分类/);
});
test('native row fields retain face value and claim total, without inventing tax or allowance data', () => {
  const row=core.plan([invoice('a','113',{totalTax:'13',name:'测试',origin:'甲站',dest:'乙站'})],[],available).rows[0];
  const values=core.rowValues(row,['BSX070201','BSX070202','BSX070203','BSX070301','BSX070304','BSX070305','BSX070306','BTSSX0102','BTSSX0113','BTSSX0118']);
  assert.equal(values.BSX070306,113); assert.equal(values.BSX070201,100); assert.equal(values.BSX070202,13); assert.equal(values.BSX070301,100); assert.equal(values.BSX070305,13); assert.equal(values.BTSSX0118,'乙站');
  const noTax=core.rowValues({...row,bill:{billData:{}}},['BSX070301','BSX070305','BSX070306']);
  assert.equal(noTax.BSX070301,undefined); assert.equal(noTax.BSX070305,undefined); assert.equal(noTax.BSX070306,113);
});
test('unsafe sums fail instead of rounding a monetary total',()=>{
  assert.throws(()=>core.total([{selected:true,category:'住宿',amountCents:Number.MAX_SAFE_INTEGER},{selected:true,category:'住宿',amountCents:1}]),/范围/);
});
test('typographic minus signs remain negative rather than losing their sign',()=>{assert.equal(core.amount('−566.92'),-56692);assert.equal(core.amount('－840.00'),-84000)});

test('invoice issue date is not substituted for train departure date',()=>{const row=core.plan([invoice('a','10',{issueDate:'2026-10-10'})],[],available).rows[0];assert.equal(core.rowValues(row,['BTSSX0104']).BTSSX0104,undefined);row.bill.billData.cfrq='2026-10-11';assert.equal(core.rowValues(row,['BTSSX0104']).BTSSX0104,'2026-10-11')});
