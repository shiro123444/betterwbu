const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'../extension',name),'utf8');
const vpn='http://wsbx-wbu-edu-cn.webvpn.wbu.edu.cn:8118';
function fixture(origin=vpn){
 const calls=[],messages=[],listeners={},frames=[];
 const component={folderData:[{folderId:'0000',name:'发票夹'}],sourceData:[],condition:{folderId:'0000'},totalRecord:0,checkedValues:[],init:true,spinning:false,activeEdit:'',$children:[],$watch:()=>()=>{},
  async $http(config){calls.push(config);this.folderData.push({folderId:'new',name:config.data.folderName});return{success:true}},
  async getFolder(){},getInfo(){},tabChange(folder){this.condition.folderId=folder.folderId}};
 const document={documentElement:{},querySelector:()=>({__vue__:component})};
 const context=vm.createContext({URL,Symbol,Map,Set,WeakMap,document,location:new URL(origin+'/bill-wallet-web/#/bill/file'),setTimeout,clearTimeout,
  requestAnimationFrame:fn=>frames.push(fn),MutationObserver:class{observe(){}},XMLHttpRequest:class extends EventTarget{open(){}send(){}complete(status,body){this.status=status;this.responseText=JSON.stringify(body);this.dispatchEvent(new Event('loadend'))}}});
 context.window=context;context.parent={};context.addEventListener=(type,fn)=>(listeners[type]||=[]).push(fn);context.postMessage=m=>messages.push(m);context.parent.postMessage=()=>{};
 vm.runInContext(read('site.js'),context);vm.runInContext(read('wallet-manager.js'),context);
 // Use the actual VM global as MessageEvent.source (not its external wrapper).
 const self=vm.runInContext('window',context);
 const send=(data,messageOrigin=origin,source=self)=>listeners.message.forEach(fn=>fn({origin:messageOrigin,source,data}));
 const flush=async()=>{while(frames.length)frames.shift()();await new Promise(r=>setImmediate(r));while(frames.length)frames.shift()()};
 return{calls,messages,send,flush,component,self,XHR:context.XMLHttpRequest};
}
for(const [label,origin,messageOrigin]of [['direct','http://wsbx.wbu.edu.cn','http://wsbx.wbu.edu.cn'],['proxy',vpn,vpn],['WebVPN rewritten',vpn,'http://wsbx.wbu.edu.cn']]){
 test(label+' create reaches the native save once and clears busy state',async()=>{
  const f=fixture(origin);f.send({type:'betterwbu-wallet-config',enabled:true},messageOrigin);await f.flush();
  f.send({type:'betterwbu-wallet-command',id:'create-1',action:'create',name:'事前审批'},messageOrigin);await f.flush();
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].url,'/bill-wallet/folder/manage/saveOrUpdateFolder.json');assert.equal(f.calls[0].data.folderName,'事前审批');
  assert.equal(f.messages.find(m=>m.type==='betterwbu-wallet-result'&&m.id==='create-1')?.ok,true);
  assert.equal(f.messages.filter(m=>m.type==='betterwbu-wallet-view').at(-1).creating,false);assert.equal(f.component.condition.folderId,'new');
 });
}
test('unrelated origins and foreign Windows cannot issue folder writes',async()=>{
 const f=fixture();f.send({type:'betterwbu-wallet-config',enabled:true});await f.flush();
 for(const origin of ['null','https://evil.example','http://wsbx.wbu.edu.cn.evil.example','http://wsbx.wbu.edu.cn:8118'])f.send({type:'betterwbu-wallet-command',id:origin,action:'create',name:'bad'},origin);
 for(const origin of [vpn,'http://wsbx.wbu.edu.cn'])f.send({type:'betterwbu-wallet-command',id:'foreign-window',action:'create',name:'bad'},origin,{});
 await f.flush();assert.equal(f.calls.length,0);
});
test('WebVPN upstream read URLs receive bounded timeouts and real failure states',async()=>{
 const f=fixture();f.send({type:'betterwbu-wallet-config',enabled:true});await f.flush();
 const x=new f.XHR();x.open('POST','http://wsbx.wbu.edu.cn/bill-wallet/folder/manage/getMyFolderByCondition.json');x.send();await f.flush();
 assert.equal(x.timeout,20000);assert.equal(f.messages.at(-1).queries.folders.phase,'loading');x.complete(502,{});await f.flush();assert.equal(f.messages.at(-1).queries.folders.phase,'error');
 const foreign=new f.XHR();foreign.open('POST','http://foreign.example/bill-wallet/folder/manage/getMyFolderByCondition.json');foreign.send();assert.equal(foreign.timeout,undefined);
});
test('uncertain saves are reported separately from explicit server rejection',async()=>{
 for(const uncertain of [true,false]){
  const f=fixture();f.send({type:'betterwbu-wallet-config',enabled:true});await f.flush();
  f.component.$http=async config=>{assert.equal(config.timeout,20000);if(uncertain)throw Error('timeout');return{success:false,message:'服务拒绝'}};
  f.send({type:'betterwbu-wallet-command',id:'save',action:'create',name:'测试文件夹'});await f.flush();
  const result=f.messages.find(m=>m.id==='save');assert.equal(result.ok,false);assert.equal(result.uncertain,uncertain);assert.equal(f.messages.filter(m=>m.type==='betterwbu-wallet-view').at(-1).creating,false);
 }
});
test('a successful save followed by refresh failure is never reported as an unsaved folder',async()=>{
 const f=fixture();f.send({type:'betterwbu-wallet-config',enabled:true});await f.flush();f.component.getFolder=async()=>{throw Error('list failed')};
 f.send({type:'betterwbu-wallet-command',id:'save',action:'create',name:'测试文件夹'});await f.flush();
 const result=f.messages.find(m=>m.id==='save');assert.equal(result.ok,true);assert.match(result.message,/已保存/);assert.equal(f.calls.length,1);
});
test('all MAIN-world message listeners use the WebVPN origin helper and load it first',()=>{
 const manifest=JSON.parse(read('manifest.json'));
 for(const entry of manifest.content_scripts.filter(e=>e.world==='MAIN')){
  assert.equal(entry.js[0],'site.js');
  for(const file of entry.js){const source=read(file);if(/addEventListener\(['"]message['"]/.test(source)){assert.match(source,/ReimbursementSite\.messageOrigin/,file);assert.doesNotMatch(source,/(?:e|event)\.origin\s*[!=]==?\s*location\.origin/,file)}}
 }
});
