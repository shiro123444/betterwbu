(function(root) {
  'use strict';
  const hosts=['wsbx.wbu.edu.cn','wsbx-wbu-edu-cn.webvpn.wbu.edu.cn'];
  function url(value) {
    try { return new URL(typeof value==='string'?value:value.href||value.origin+(value.pathname||'/')); }
    catch { return null; }
  }
  function supported(value) {
    const parsed=url(value);
    return !!parsed&&/^https?:$/.test(parsed.protocol)&&!parsed.username&&!parsed.password&&hosts.includes(parsed.hostname);
  }
  function workbench(value) { return supported(value)&&url(value).pathname.startsWith('/workbench-web/'); }
  function messageOrigin(origin,value) {
    const current=url(value);
    if(!current)return false;
    if(origin===current.origin)return true;
    // Sangfor restores MessageEvent.origin to the upstream HTTP origin in
    // MAIN, while isolated scripts see the real proxy origin. Callers still
    // require the exact sender Window; this is not a general cross-site allowlist.
    return supported(value)&&current.hostname===hosts[1]&&origin==='http://'+hosts[0];
  }
  // Chrome match patterns cover all ports. Keep the request guard aligned with
  // those exact hosts, including the school's WebVPN port, without URL rewriting.
  const escaped=hosts.map(host=>host.replace(/\./g,'\\.')).join('|');
  const aiRequestPattern='^https?://(?:'+escaped+')(?::[0-9]+)?/reimburse-service/api/v1/reimbursement/ai(?:-again)?(?:\\?|$)';
  const api=Object.freeze({supported,workbench,messageOrigin,aiRequestPattern});
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ReimbursementSite=api;
})(typeof window==='object'?window:typeof self==='object'?self:globalThis);
