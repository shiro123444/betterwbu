const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const dir=path.join(__dirname,'../extension'),manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
test('memory core uses distinct resources for main and isolated worlds, and initializes both',()=>{
 const entries=manifest.content_scripts.filter(s=>s.matches.some(m=>m.includes('/workbench-web/'))),seen=new Set();
 for(const entry of entries){
  const window={},context=vm.createContext({window});
  for(const file of entry.js){if(!/^memory-core(?:-isolated)?\.js$/.test(file)||seen.has(file))continue;seen.add(file);vm.runInContext(fs.readFileSync(path.join(dir,file),'utf8'),context)}
  assert.equal(typeof window.ReimbursementMemoryCore?.clean,'function',entry.world||'ISOLATED');
 }
 assert.equal(seen.size,2);
 assert.equal(fs.readFileSync(path.join(dir,'memory-core-isolated.js'),'utf8'),fs.readFileSync(path.join(dir,'memory-core.js'),'utf8'));
});
test('service-worker import installs the memory API on its global self',()=>{
 const context=vm.createContext({});context.self=context;
 vm.runInContext(fs.readFileSync(path.join(dir,'memory-core.js'),'utf8'),context);
 assert.equal(typeof context.ReimbursementMemoryCore?.replace,'function');
});
test('basic template core initializes distinct main and isolated resources and the worker global',()=>{
 const seen=new Set();for(const entry of manifest.content_scripts.filter(s=>s.matches.some(m=>m.includes('/workbench-web/')))){
  const context=vm.createContext({window:{}});for(const file of entry.js){if(!/^basic-core(?:-http-isolated)?\.js$/.test(file)||seen.has(file))continue;seen.add(file);vm.runInContext(fs.readFileSync(path.join(dir,file),'utf8'),context)}assert.equal(typeof context.window.ReimbursementBasicCore?.save,'function');
 }
 assert.equal(seen.size,2);assert.equal(fs.readFileSync(path.join(dir,'basic-core-http-isolated.js'),'utf8'),fs.readFileSync(path.join(dir,'basic-core.js'),'utf8'));
 const worker=vm.createContext({});worker.self=worker;vm.runInContext(fs.readFileSync(path.join(dir,'basic-core.js'),'utf8'),worker);assert.equal(typeof worker.ReimbursementBasicCore?.save,'function');
});
