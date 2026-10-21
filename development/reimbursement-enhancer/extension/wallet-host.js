(() => {
 'use strict';
 let enabled=false,box,label,button,frame,started=0,phase='loading',timer,queued=false;const bound=new WeakSet();
 const route=()=>/^#\/mineFold(?:\?|$)/.test(location.hash);
 function text(n,t){if(n.textContent!==t)n.textContent=t}
 function update(){
  const active=enabled&&route(),next=active?document.querySelector('iframe.iframe-box'):null;
  if(!active||!next){box?.remove();box=null;frame=null;clearInterval(timer);timer=null;return}
  if(frame!==next){frame=next;started=Date.now();phase='loading';if(!bound.has(next)){bound.add(next);next.addEventListener('load',()=>{if(frame===next)next.contentWindow?.postMessage({type:'betterwbu-wallet-host-ready'},location.origin)})}next.contentWindow?.postMessage({type:'betterwbu-wallet-host-ready'},location.origin)}
  if(!box){box=document.createElement('div');box.className='bw-wallet-host-state';box.dataset.bwOwned='true';label=document.createElement('span');label.setAttribute('role','status');label.setAttribute('aria-live','polite');button=document.createElement('button');button.type='button';button.textContent='重新加载发票夹';button.addEventListener('click',()=>{if(!frame?.isConnected)return;const src=frame.getAttribute('src');if(!src)return;started=Date.now();phase='loading';frame.setAttribute('src',src);update()});box.append(label,button);next.before(box)}
  const slow=Date.now()-started>=12000;box.hidden=phase==='ready';button.hidden=!slow&&phase!=='error';
  text(label,phase==='error'?'发票夹加载失败，可重新加载后重试':slow?'发票夹响应较慢，正在等待票据服务…':'正在连接发票夹…');
  if(!timer)timer=setInterval(update,1000);
 }
 function queue(){if(!queued){queued=true;requestAnimationFrame(()=>{queued=false;update()})}}
 window.addEventListener('message',e=>{if(e.source!==frame?.contentWindow||e.origin!==location.origin||e.data?.type!=='betterwbu-wallet-view')return;const q=e.data.queries;phase=q?.folders?.phase==='error'||q?.bills?.phase==='error'?'error':e.data.ready&&q?.folders?.phase==='ready'&&q?.bills?.phase==='ready'?'ready':'loading';update()});
 async function configure(){try{const s=await chrome.storage.local.get({enabled:true,wallet:true,visual:true});enabled=s.enabled&&s.wallet&&s.visual}catch{enabled=false}update()}
 new MutationObserver(queue).observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('hashchange',()=>{frame=null;queue()});chrome.storage.onChanged.addListener(configure);configure();
})();
