(() => {
  'use strict';
  let enabled=false,queued=false,toggle;
  const wallet=location.pathname.startsWith('/bill-wallet-web/');
  function attr(node,name,value){if(node&&node.getAttribute(name)!==value)node.setAttribute(name,value)}
  function update(){
    const root=document.documentElement;if(!root)return;
    if(!wallet){
      attr(root,'data-re-wallet-modal',String(enabled));
      for(const frame of document.querySelectorAll('iframe.iframe-box'))attr(frame.closest('.ant-modal'),'data-re-wallet-dialog','true');
      return;
    }
    const active=enabled&&/^#\/bill\/(?:list|file)(?:\?|$)/.test(location.hash);
    attr(root,'data-re-wallet-picker',String(active));
    attr(root,'data-re-wallet-management',String(active&&/^#\/bill\/file(?:\?|$)/.test(location.hash)));
    if(!active){toggle?.remove();toggle=null;root.removeAttribute('data-re-wallet-filters');return}
    const toolbar=document.querySelector('.file-tabs .tabs-tool');if(!toolbar)return;
    if(toggle?.isConnected&&toggle.parentElement&&toggle.parentElement!==toolbar){toggle.remove();toggle=null}
    if(!toggle?.isConnected){
      toggle?.remove();
      toggle=document.createElement('button');toggle.type='button';toggle.className='re-wallet-filter-toggle';toggle.setAttribute('aria-label','展开票据筛选');
      toggle.addEventListener('click',()=>{const open=root.getAttribute('data-re-wallet-filters')!=='true';attr(root,'data-re-wallet-filters',String(open));update()});toolbar.prepend(toggle);
    }
    const open=root.getAttribute('data-re-wallet-filters')==='true';const label=open?'收起筛选':'筛选';if(toggle.textContent!==label)toggle.textContent=label;attr(toggle,'aria-expanded',String(open));attr(toggle,'aria-label',open?'收起票据筛选':'展开票据筛选');
  }
  async function configure(){const s=await chrome.storage.local.get({enabled:true,wallet:true,visual:true});enabled=s.enabled&&s.wallet&&s.visual;update()}
  function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;update()})}
  function start(){new MutationObserver(queue).observe(document.documentElement,{childList:true,subtree:true});configure()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  chrome.storage.onChanged.addListener(configure);window.addEventListener('hashchange',queue);
})();
