const test=require('node:test'),assert=require('node:assert/strict');
const invoices=require('../extension/invoice-core.js');
const rows=bills=>invoices.plan(bills,[],invoices.categories).rows;
function bill(id,total='120',category='insurance'){
 return {id:'record-'+id,dataId:'record-'+id,barcode:id,ticketCode:'1-024',totalAmount:total,ticketName:'电子发票（普通发票）',
  billData:{invoiceNO:'invoice-'+id,totalTax:'6.79',details:[{inx:'0',content:category==='insurance'?'航空意外险':'住宿费',amount:String(Number(total)-6.79),taxAmount:'6.79'}]}};
}
const names=['测试甲','测试乙','测试丙'];

test('ordinary service invoices use financial details rather than auxiliary passenger air records',()=>{
 const b=bill('ancillary','112.98');
 b.billData.totalAmount='112.98';b.billData.totalTax='6.40';
 b.billData.details=[{inx:'0',content:'代订附加产品',amount:'106.58',taxAmount:'6.40'}];
 b.billData.air=[{inx:'0',transportation:'飞机',taxAmount:'6.40'},...names.map((name,i)=>({inx:String(i+1),payingCorp:name,amount:'0',totalAmount:'0',taxAmount:'0'}))];
 const r=rows([b])[0];r.category='其他';r.selected=true;r.allocations=invoices.associations.evenSplit(11298,names);
 const generated=invoices.associations.compile([r]);
 assert.deepEqual(generated.map(r=>r.amountCents),[3766,3766,3766]);
 assert.ok(generated.every(r=>r.links[0].BSX070808==='details'));
});
test('two 120 insurance invoices allocate to three 80 expenses with two real 40 links per person',()=>{
 const p=rows([bill('out'),bill('back')]);
 for(const r of p)r.allocations=names.map(person=>({person,amountCents:4000}));
 const generated=invoices.associations.compile(p);
 assert.equal(generated.length,3);
 for(const r of generated){assert.equal(r.amountCents,8000);assert.equal(r.person,names[generated.indexOf(r)]);assert.equal(r.links.length,2);assert.deepEqual(r.links.map(l=>l.BSX070804),[40,40]);}
 assert.equal(generated.reduce((n,r)=>n+r.taxCents,0),1358);
 assert.equal(generated.flatMap(r=>r.links).filter(l=>l.BSX070807==='out').reduce((n,l)=>n+Math.round(l.BSX070804*100),0),12000);
});
test('lodging puts invoices and explicitly selected zero-value supporting links on named paid rows',()=>{
 const water={id:'record-water',dataId:'record-water',barcode:'water',ticketCode:'4-081',ticketName:'酒店住宿流水单',totalAmount:'807',fileType:'1',billData:{dateOfArrive:'2026-08-17',dateOfDeparture:'2026-08-20'}};
 const p=rows([bill('room-a','807','hotel'),bill('room-b','807','hotel'),bill('room-c','807','hotel'),water]);
 for(let i=0;i<3;i++){p[i].allocations=[{person:names[i],amountCents:80700}];p[i].supportIdentities=[p[3].identity];}
 const generated=invoices.associations.compile(p);
 assert.equal(generated.length,3);assert.equal(generated.reduce((n,r)=>n+r.amountCents,0),242100);
 for(const r of generated){assert.ok(r.person);assert.equal(r.links.length,2);assert.equal(r.links[1].BSX070804,0);assert.equal(r.links[1].BSX070811,'0');assert.equal(r.links[0].BSX070804,807);}
 assert.equal(p[3].selected,false);
});
test('odd-cent even allocation is explicit, deterministic and exact',()=>{
 assert.deepEqual(invoices.associations.evenSplit(100,names).map(a=>a.amountCents),[34,33,33]);
 assert.throws(()=>invoices.associations.evenSplit(1,names),/金额|分摊/);
});
test('underallocation, overallocation, duplicate people, unknown records and ambiguous lines reject before generation',()=>{
 for(const amounts of [[3999,4000,4000],[4001,4000,4000]]){const p=rows([bill('a')]);p[0].allocations=names.map((person,i)=>({person,amountCents:amounts[i]}));assert.throws(()=>invoices.associations.compile(p),/分摊/)}
 const p=rows([bill('a')]);p[0].allocations=[{person:'甲',amountCents:6000},{person:'甲',amountCents:6000}];assert.throws(()=>invoices.associations.compile(p),/重复/);
 const missing=bill('missing');delete missing.dataId;delete missing.id;const q=rows([missing]);q[0].allocations=[{person:'甲',amountCents:12000}];assert.throws(()=>invoices.associations.compile(q),/标识/);
 const bad=bill('lines');bad.billData.details.push({inx:'0',amount:'10',taxAmount:'0',content:'航空意外险'});const z=rows([bad]);z[0].allocations=[{person:'甲',amountCents:12000}];assert.throws(()=>invoices.associations.compile(z),/明细/);
});
test('multiple invoice lines preserve both person and per-line gross/tax budgets through JSON serialization',()=>{
 const b=bill('multi','10.01');b.billData.totalTax='0.91';b.billData.details=[{inx:'a',amount:'3.00',taxAmount:'0.30',content:'航空意外险'},{inx:'b',amount:'6.10',taxAmount:'0.61',content:'航空意外险'}];
 const p=rows([b]);p[0].allocations=invoices.associations.evenSplit(1001,names);
 const g=JSON.parse(JSON.stringify(invoices.associations.compile(p)));
 assert.equal(g.reduce((n,r)=>n+r.amountCents,0),1001);assert.equal(g.reduce((n,r)=>n+r.taxCents,0),91);
 for(const [inx,expected]of [['a',330],['b',671]])assert.equal(g.flatMap(r=>r.links).filter(l=>l.BSX070803===inx).reduce((n,l)=>n+Math.round(l.BSX070804*100),0),expected);
});
test('append and updates check invoice use retained in other categories and activities',()=>{
 const p=rows([bill('a')]);p[0].allocations=[{person:'甲',amountCents:12000}];const g=invoices.associations.compile(p);
 const old={BSX070306:120,BSX0709:[{BSX070802:'record-a',BSX070807:'a',BSX070803:'0',BSX070804:120,BSX070811:'1'}]};
 const form={activitys:[{activityMetaId:'travel',behaviors:[{behaviorMetaName:'交通意外险',behaviorDetail:[old]}]}]};
 assert.throws(()=>invoices.associations.assertRetained(form,'travel','append',['交通意外险'],g),/重复|超出/);
 assert.doesNotThrow(()=>invoices.associations.assertRetained(form,'travel','replace',['交通意外险'],g));
 form.activitys[0].activityMetaId='elsewhere';assert.throws(()=>invoices.associations.assertRetained(form,'travel','replace',['交通意外险'],g),/重复|超出/);
});
test('native generated payload cannot silently lose an association or alter use amounts',()=>{
 const p=rows([bill('a')]);p[0].allocations=[{person:'甲',amountCents:12000}];const g=invoices.associations.compile(p);
 const record={BSX070306:120,BSX0709:g[0].links};
 assert.doesNotThrow(()=>invoices.associations.assertRecord(record,g[0]));
 delete record.BSX0709;assert.throws(()=>invoices.associations.assertRecord(record,g[0]),/关联/);
 record.BSX0709=structuredClone(g[0].links);record.BSX0709[0].BSX070804=240;assert.throws(()=>invoices.associations.assertRecord(record,g[0]),/关联|金额/);
});
test('stale header amounts, placeholder identifiers and canceled receipts cannot be linked',()=>{
 for(const change of [b=>b.billData.totalAmount='119',b=>b.dataId='0',b=>b.billData.cancel='是']){const b=bill('invalid');change(b);const p=rows([b]);p[0].allocations=[{person:'甲',amountCents:12000}];assert.throws(()=>invoices.associations.compile(p),/不一致|标识|作废/)}
});
test('different lodging invoices for the same person remain separate, with no invented stay range',()=>{
 const p=rows([bill('hotel-a','807','hotel'),bill('hotel-b','807','hotel')]);for(const r of p)r.allocations=[{person:'甲',amountCents:80700}];const g=invoices.associations.compile(p);assert.equal(g.length,2);assert.ok(g.every(r=>r.links.length===1&&r.amountCents===80700));
});

test('native links retain the real invoice detail model so the backend can resolve invoice content',()=>{
 for(const [model,code] of [['details','1-024'],['air','1-033'],['hotel','1-024']]){
  const b=bill('model-'+model);b.ticketCode=code;
  if(model==='hotel')b.billData.details[0].content='住宿费';
  if(model==='air'){b.ticketName='电子发票（航空运输电子客票行程单）';b.billData.details[0].content='航空运输';}
  if(model!=='details')b.billData[model]=structuredClone(b.billData.details);
  const p=rows([b]);p[0].allocations=[{person:'测试甲',amountCents:12000}];
  const g=invoices.associations.compile(p);
  assert.equal(g[0].links[0].BSX070808,model);
 }
});

test('only source supplied native tax classification is preserved and cannot silently disappear',()=>{
 const b=bill('native-code');b.nativeAssociationMetadata={model:'details',taxCode:'3060301AA0000000000'};
 const p=rows([b]);p[0].allocations=[{person:'测试甲',amountCents:12000}];const g=invoices.associations.compile(p);
 assert.equal(g[0].links[0].BSX070810,'3060301AA0000000000');
 const record={BSX070306:120,BSX0709:structuredClone(g[0].links)};
 delete record.BSX0709[0].BSX070808;
 assert.throws(()=>invoices.associations.assertRecord(record,g[0]),/关联/);
});

test('native metadata is reused only for the exact record and barcode, with conflicts rejected',()=>{
 const b=bill('existing');const link={BSX070802:b.id,BSX070807:b.barcode,BSX070808:'details',BSX070810:'3060301AA0000000000'};
 const f={activitys:[{behaviors:[{behaviorDetail:[{BSX0709:[link]}]}]}]};
 assert.deepEqual(invoices.associations.nativeMetadata(f,b),{model:'details',taxCode:'3060301AA0000000000'});
 assert.deepEqual(invoices.associations.nativeMetadata(f,{...b,barcode:'another'}),{});
 assert.deepEqual(invoices.associations.nativeMetadata(f,{...b,id:'other',dataId:'other'}),{});
 f.activitys[0].behaviors[0].behaviorDetail[0].BSX0709.push({...link,BSX070808:'hotel'});
 assert.throws(()=>invoices.associations.nativeMetadata(f,b),/不一致/);
});
