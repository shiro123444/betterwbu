const test=require('node:test'),assert=require('node:assert/strict');
const memory=require('../extension/memory-core.js');
const desc=(key,context='')=>({scope:'teacher-a|travel',key,context});
test('recipient library is available across form types, preserves legacy records and isolates users',()=>{
 const entry={name:'Person',bank:{id:'bank',name:'Full bank',code:'123'},account:'1234567890123456'},scope='teacher-a|@recipients',d={scope,key:'recipient',context:''};
 let db=memory.remember({},desc('recipient'),entry);db=memory.remember(db,{...desc('recipient'),scope:'teacher-a|other-form'},entry);
 db=memory.remember(db,{...desc('recipient'),scope:'teacher-ab|travel'},{...entry,name:'Other user'});
 assert.equal(memory.library(db,scope).length,1);assert.equal(memory.library(db,null).length,0);
 const updated={...entry,name:'Updated'};db=memory.saveRecipient(db,d,updated,entry);assert.ok(db);assert.equal(memory.library(db,scope).length,1);assert.equal(memory.library(db,scope)[0].name,'Updated');
 assert.equal(memory.library(db,'teacher-ab|@recipients')[0].name,'Other user');
 assert.equal(memory.saveRecipient(db,d,entry,entry),null);
 db=memory.remember(db,desc('applyReason'),{value:'Keep reason'});db=memory.remember(db,desc('bankAccount','Person|123'),{value:'1234567890123456'});
 db=memory.clearRecipients(db,scope);assert.equal(memory.library(db,scope).length,0);assert.equal(memory.library(db,'teacher-ab|@recipients').length,1);assert.equal(memory.recall(db,desc('bankAccount','Person|123')).length,0);assert.equal(memory.recall(db,desc('applyReason'))[0].value,'Keep reason');
});
test('manually maintained recipients do not expire or become ordinary history on automatic capture',()=>{
 const d=desc('recipient'),entry={name:'Person',bank:{id:'bank',name:'Full bank',code:'123'},account:'1234567890123456'};
 let db=memory.replace({},d,entry);assert.ok(db);assert.equal(memory.recall(db,d,Date.now()+100*86400000).length,1);
 db=memory.remember(db,d,entry);assert.equal(memory.recall(db,d,Date.now()+100*86400000).length,1);
 for(let i=0;i<80;i++)db=memory.remember(db,d,{...entry,name:'Recent '+i});
 assert.ok(memory.recall(db,d).some(e=>e.name==='Person'));assert.equal(memory.recall(db,d).length,60);
 for(let i=0;i<130;i++)db=memory.remember(db,{scope:'other-form-'+i,key:'applyReason',context:''},{value:'Reason'},Date.now()+i);
 assert.ok(memory.recall(db,d).some(e=>e.name==='Person'));
});
test('history is partitioned by signed-in user, form, recipient and selected bank',()=>{
 const d=desc('bankAccount','recipient|bank-a');const db=memory.remember({},d,{value:'1234 5678 9012 3456'},100);
 assert.equal(memory.recall(db,d,101)[0].value,'1234567890123456');
 assert.equal(memory.recall(db,{...d,scope:'teacher-b|travel'},101).length,0);
 assert.equal(memory.recall(db,{...d,context:'other-recipient|bank-a'},101).length,0);
 assert.equal(memory.recall(db,{...d,context:'recipient|bank-b'},101).length,0);
 assert.equal(memory.recall(db,desc('bankAccount'),101).length,0);
 assert.equal(memory.recall(db,d,101)[0].label,'•••• 3456');
});
test('recipient remembers a complete masked combination, consolidates matching field histories and forgets one combination',()=>{
 const d=desc('recipient'),entry={name:'Recipient',bank:{id:'bank-id',name:'Full bank',code:'123'},account:'1234 5678 9012 3456'};
 let db=memory.remember({},desc('bankAccount','Recipient|123'),{value:entry.account},100);
 db=memory.remember(db,desc('branchBankName','Recipient'),{value:'bank-id',record:entry.bank},100);
 db=memory.remember(db,d,entry,101);const saved=memory.recall(db,d,102)[0];
 assert.equal(saved.account,'1234567890123456');assert.ok(saved.label.endsWith('•••• 3456'));assert.ok(!saved.label.includes(saved.account));
 assert.equal(memory.recall(db,desc('bankAccount','Recipient|123'),102).length,0);assert.equal(memory.recall(db,desc('branchBankName','Recipient'),102).length,0);
 assert.equal(memory.recall(db,{...d,scope:'other|travel'},102).length,0);
 db=memory.forget(db,d,saved);assert.equal(memory.recall(db,d,102).length,0);
 assert.equal(memory.clean('recipient',{...entry,account:''}),null);
});
test('history de-duplicates, bounds records, and expires after 90 days',()=>{
 const d=desc('applyReason');let db={};for(let i=0;i<20;i++)db=memory.remember(db,d,{value:'reason '+i},i);
 assert.equal(memory.recall(db,d,30).length,12);db=memory.remember(db,d,{value:'reason 19'},31);assert.equal(memory.recall(db,d,32).length,12);
 assert.equal(memory.recall(db,d,91*86400000).length,0);
 assert.deepEqual(memory.recall({},d),[]);
});
test('memory rejects arbitrary fields, malformed accounts and incomplete bank records',()=>{
 for(const key of ['password','token','totalAmount'])assert.equal(memory.clean(key,{value:'123'}),null);
 assert.equal(memory.clean('bankAccount',{value:'javascript:evil'}),null);
 assert.equal(memory.clean('bankAccount',{value:'-1234567890123456'}),null);
 assert.equal(memory.clean('bankAccount',{value:'1234567890123456-'}),null);
 assert.equal(memory.clean('branchBankName',{value:'id',record:{name:'free text'}}),null);
 const entry={value:'bank-id',record:{id:'bank-id',name:'Full bank name',code:'123456'}};
 assert.equal(memory.clean('branchBankName',entry).record.name,'Full bank name');
});

test('explicit manual banks preserve native names without inventing dictionary IDs or clearing codes',()=>{
 const bank={kind:'manual',name:'交通银行武汉分行',code:''},entry={name:'Synthetic person',bank,account:'1234567890123456'},d=desc('recipient');
 const saved=memory.clean('recipient',entry);assert.deepEqual(saved.bank,bank);assert.equal(saved.bank.id,undefined);
 let db=memory.replace({},d,entry);assert.deepEqual(memory.recall(db,d)[0].bank,bank);
 db=memory.saveRecipient(db,d,{...entry,bank:{...bank,name:'另一家手填支行'}},entry);assert.equal(memory.recall(db,d).length,1);
 assert.equal(memory.recall(db,d)[0].bank.name,'另一家手填支行');
 for(const invalid of [{...bank,id:'fake-id'},{...bank,code:'123'},{...bank,name:'\nBad bank'},{...bank,name:''}])assert.equal(memory.clean('recipient',{...entry,bank:invalid}),null);
});
test('manual bank consolidation preserves other manual banks and dictionary identities',()=>{
 const bank={kind:'manual',name:'Manual branch',code:''},d=desc('branchBankName','Person'),r=desc('recipient');
 let db=memory.remember({},d,{value:bank.name,record:bank});db=memory.remember(db,d,{value:'Other branch',record:{...bank,name:'Other branch'}});
 db=memory.remember(db,desc('bankAccount','Person|Manual branch'),{value:'1234567890123456'});
 db=memory.remember(db,r,{name:'Person',bank,account:'1234567890123456'});
 assert.deepEqual(memory.recall(db,d).map(e=>e.value),['Other branch']);assert.equal(memory.recall(db,desc('bankAccount','Person|Manual branch')).length,0);
 const dictionary={id:'legacy-id',name:'Same named bank',code:'Manual branch'};
 db=memory.remember(db,r,{name:'Person',bank:dictionary,account:'1234567890123456'});assert.equal(memory.recall(db,r).length,2);
 assert.deepEqual(memory.clean('recipient',{name:'Person',bank:dictionary,account:'1234567890123456'}).bank,dictionary);
});
