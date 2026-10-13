const test=require('node:test'),assert=require('node:assert/strict'),core=require('../extension/invoice-core.js');
const categories=['用餐补贴','市内交通补贴'];
const input={enabled:true,confirmed:true,start:'2026-10-11',end:'2026-10-13',region:'outside',people:'甲'};
test('outside province three inclusive calendar days adds 300 meals plus 240 transit',()=>{const p=core.allowances(input,categories);assert.equal(p.days,3);assert.equal(p.amount,54000);assert.deepEqual(p.rows.map(r=>r.amountCents),[30000,24000])});
test('Hubei, special provinces and Wuhan use distinct documented standards',()=>{for(const [region,expected]of [['hubei',45000],['special',60000],['wuhan',0]])assert.equal(core.allowances({...input,region},categories).amount,expected)});
test('ineligible days are deducted independently for hosted meals and conference transit',()=>{const p=core.allowances({...input,mealExcluded:1,transportExcluded:2},categories);assert.equal(p.amount,28000);const v=core.rowValues(p.rows[1],['BSX070306','BTSSX0409','BTSSX0412','BSX071301']);assert.equal(v.BSX070306,80);assert.equal(v.BTSSX0409,3);assert.equal(v.BTSSX0412,160);assert.equal(v.BSX071301,80)});
test('each person gets separate rows and all excluded days create no expenses',()=>{assert.equal(core.allowances({...input,people:'甲，乙'},categories).amount,108000);assert.equal(core.allowances({...input,mealExcluded:3,transportExcluded:3},categories).rows.length,0)});
test('calendar validation handles leap day, cross month and same day without timezone rounding',()=>{assert.equal(core.allowances({...input,start:'2024-02-28',end:'2024-03-01'},categories).days,3);assert.equal(core.allowances({...input,start:'2026-10-13'},categories).days,1);assert.throws(()=>core.allowances({...input,start:'2026-02-29'},categories),/日期无效/)});
test('missing confirmation, people, dates, unknown region and invalid exclusions reject calculations',()=>{for(const changes of [{confirmed:false},{people:''},{people:'甲,甲'},{start:''},{start:'2026-10-14'},{region:'unknown'},{mealExcluded:4},{mealExcluded:0.5},{transportExcluded:-1}])assert.throws(()=>core.allowances({...input,...changes},categories));assert.throws(()=>core.allowances(input,['用餐补贴']),/对应分类/);assert.equal(core.allowances({enabled:false},[]).amount,0)});

test('stay date suggestion uses explicit hotel dates, including supporting statements, never issue dates',()=>{
 const rows=[{category:'住宿',blocked:false,amountCents:317220,bill:{ticketName:'电子发票',billData:{issueDate:'20261010',hotel:[{issueDate:'20261010',daysOfStay:3}]}}},{category:'住宿',blocked:true,amountCents:97128,bill:{ticketName:'酒店住宿流水单',billData:{dateOfArrive:'20260817',dateOfDeparture:'20260820'}}}];
 assert.equal(core.stayPeriod(rows.slice(0,1)).start,'');assert.deepEqual(core.stayPeriod(rows),{start:'2026-08-17',end:'2026-08-20',sources:['住宿流水单'],reason:''});
});
test('stay ranges merge overlapping dates and refuse incomplete or discontinuous trips',()=>{
 const row=(start,end)=>({category:'住宿',blocked:false,amountCents:100,bill:{ticketName:'住宿发票',billData:{hotel:[{checkInDate:start,checkOutDate:end}]}}});
 assert.equal(core.stayPeriod([row('2026-08-17','2026-08-20'),row('2026-08-19','2026-08-22')]).end,'2026-08-22');
 assert.match(core.stayPeriod([row('2026-08-17','2026-08-20'),row('2026-09-01','2026-09-03')]).reason,/不连续/);
 assert.equal(core.stayPeriod([row('20260230','20260302')]).start,'');assert.equal(core.stayPeriod([row('20260820','20260817')]).start,'');
 assert.match(core.stayPeriod([row('20260817','20260820'),row('20260901','')]).reason,/不完整/);
});
