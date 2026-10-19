const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const site=require('../extension/site.js');
const vpn='http://wsbx-wbu-edu-cn.webvpn.wbu.edu.cn:8118';

test('direct and WebVPN workbench URLs retain native paths and hash routes',()=>{
 for(const origin of ['http://wsbx.wbu.edu.cn','https://wsbx.wbu.edu.cn',vpn,vpn.replace('http:','https:')]){
  for(const route of ['#/workbench','#/reimbursementCreate?formEditId=synthetic','#/jumpTransitionComponent?ticket=synthetic'])
   assert.equal(site.workbench(origin+'/workbench-web/'+route),true);
  assert.equal(site.supported(origin+'/bill-wallet-web/#/bill/list'),true);
  assert.equal(site.workbench(origin+'/bill-wallet-web/'),false);
 }
 assert.equal(site.workbench({origin:vpn,pathname:'/workbench-web/'}),true);
});

test('lookalike hosts, portal pages and URLs with an embedded target are rejected',()=>{
 for(const value of ['not a URL',null,'file:///workbench-web/','ftp://wsbx.wbu.edu.cn/workbench-web/',
  'http://wsbx.wbu.edu.cn.evil.example/workbench-web/','http://wsbx-wbu-edu-cn.webvpn.wbu.edu.cn.evil.example/workbench-web/',
  'https://webvpn.wbu.edu.cn/portal/','https://xxmh-wbu-edu-cn-s.webvpn.wbu.edu.cn:8118/workbench-web/',
  'http://wsbx.wbu.edu.cn@evil.example/workbench-web/','http://user@wsbx.wbu.edu.cn/workbench-web/',
  'https://example.com/?next='+vpn+'/workbench-web/',vpn+'/other/#/workbench-web/'])
  assert.equal(site.workbench(value),false,String(value));
});

test('manifest covers both workbench worlds and embedded wallets without a WebVPN wildcard',()=>{
 const m=JSON.parse(fs.readFileSync(__dirname+'/../extension/manifest.json','utf8'));
 assert.ok(m.host_permissions.includes('http://wsbx-wbu-edu-cn.webvpn.wbu.edu.cn/*'));
 for(const entry of m.content_scripts){
  for(const scheme of ['http','https'])assert.ok(entry.matches.includes(scheme+'://wsbx-wbu-edu-cn.webvpn.wbu.edu.cn'+(entry.matches[0].includes('/workbench-web/')?'/workbench-web/*':'/bill-wallet-web/*')));
  if(entry.matches[0].includes('/bill-wallet-web/'))assert.equal(entry.all_frames,true);
  else assert.equal(entry.js[0],entry.world==='MAIN'?'site.js':'site-isolated.js');
 }
 assert.ok(m.host_permissions.every(p=>!p.includes('://*.')));
 assert.equal(fs.readFileSync(__dirname+'/../extension/site-isolated.js','utf8'),fs.readFileSync(__dirname+'/../extension/site.js','utf8'));
 const worker=vm.createContext({URL});worker.self=worker;vm.runInContext(fs.readFileSync(__dirname+'/../extension/site.js','utf8'),worker);
 assert.equal(worker.ReimbursementSite.workbench(vpn+'/workbench-web/'),true);
 const popup=fs.readFileSync(__dirname+'/../extension/popup.html','utf8');assert.ok(popup.indexOf('src="site.js"')<popup.indexOf('src="popup.js"'));
});

test('request guard covers both hosts and the WebVPN port without blocking saves or commits',()=>{
 const re=new RegExp(site.aiRequestPattern);
 for(const origin of ['http://wsbx.wbu.edu.cn','https://wsbx.wbu.edu.cn',vpn,vpn.replace('http:','https:')]){
  for(const action of ['ai','ai-again','ai?synthetic=1'])assert.equal(re.test(origin+'/reimburse-service/api/v1/reimbursement/'+action),true);
  for(const action of ['save','commit','ai-other','ai-again-other'])assert.equal(re.test(origin+'/reimburse-service/api/v1/reimbursement/'+action),false);
 }
 assert.equal(re.test('http://wsbx-wbu-edu-cn.webvpn.wbu.edu.cn.evil.example:8118/reimburse-service/api/v1/reimbursement/ai'),false);
});

test('message origin mapping is limited to this WebVPN host and its actual upstream HTTP origin',()=>{
 assert.equal(site.messageOrigin(vpn,vpn+'/workbench-web/'),true);
 assert.equal(site.messageOrigin('http://wsbx.wbu.edu.cn',vpn+'/workbench-web/'),true);
 for(const origin of ['https://wsbx.wbu.edu.cn','http://wsbx.wbu.edu.cn:8118','https://webvpn.wbu.edu.cn','null','http://foreign.example'])
  assert.equal(site.messageOrigin(origin,vpn+'/workbench-web/'),false);
 assert.equal(site.messageOrigin(vpn,'http://wsbx.wbu.edu.cn/workbench-web/'),false);
 assert.equal(site.messageOrigin('http://wsbx.wbu.edu.cn','https://foreign.example/workbench-web/'),false);
});
