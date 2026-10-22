(() => {
 'use strict';
 if(window.ReimbursementWalletPanels)return;
 // Only extension-owned panels. Financial fields and native card records are untouched.
 function separator(handle,{axis='x',value=224,bounds=()=>[180,360],onValue=()=>{},onCommit=()=>{},reset=value}){
  let current=value,drag,dead=false;
  handle.setAttribute('role','separator');handle.setAttribute('tabindex','0');handle.setAttribute('aria-orientation',axis==='x'?'vertical':'horizontal');
  function set(next,commit=false){const [min,max]=bounds();current=Math.min(Math.max(min,Number(next)||min),Math.max(min,max));for(const [k,v]of Object.entries({'aria-valuemin':min,'aria-valuemax':Math.max(min,max),'aria-valuenow':Math.round(current)}))handle.setAttribute(k,String(v));onValue(current);if(commit)onCommit(current);return current}
  function end(event,commit=true){if(!drag||event.pointerId!==drag.id)return;const start=drag;drag=null;window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',cancel);handle.removeAttribute('data-dragging');if(commit)onCommit(current);try{handle.releasePointerCapture?.(start.id)}catch{}}
  function cancel(event){if(!drag||event.pointerId!==drag.id)return;const original=drag.value;end(event,false);set(original)}
  function move(event){if(!drag||event.pointerId!==drag.id)return;event.preventDefault();set(drag.value+(axis==='x'?event.clientX:event.clientY)-drag.start)}
  function down(event){if(event.button!==0||dead||drag||event.isPrimary===false)return;event.preventDefault();drag={id:event.pointerId,start:axis==='x'?event.clientX:event.clientY,value:current};handle.setAttribute('data-dragging','true');handle.focus({preventScroll:true});try{handle.setPointerCapture?.(event.pointerId)}catch{}window.addEventListener('pointermove',move);window.addEventListener('pointerup',end);window.addEventListener('pointercancel',cancel)}
  function key(event){const step=event.shiftKey?30:10;let next;if(event.key==='Home')next=bounds()[0];else if(event.key==='End')next=bounds()[1];else if(event.key===(axis==='x'?'ArrowLeft':'ArrowUp'))next=current-step;else if(event.key===(axis==='x'?'ArrowRight':'ArrowDown'))next=current+step;else return;event.preventDefault();set(next,true)}
  const restore=()=>set(reset,true);handle.addEventListener('pointerdown',down);handle.addEventListener('keydown',key);handle.addEventListener('dblclick',restore);set(value);
  return {set,sync:()=>set(current),destroy(){dead=true;if(drag)cancel({pointerId:drag.id});handle.removeEventListener('pointerdown',down);handle.removeEventListener('keydown',key);handle.removeEventListener('dblclick',restore)}};
 }
 window.ReimbursementWalletPanels={separator};
 let enabled=false,saved=224,sidebar,sizer,handle,queued=false;
 function bounds(){const page=sidebar?.closest('.file-page'),width=page?.getBoundingClientRect().width||innerWidth,style=page?getComputedStyle(page):null,content=width-(parseFloat(style?.paddingLeft)||0)-(parseFloat(style?.paddingRight)||0),narrow=innerWidth<=850;return [168,Math.max(168,Math.min(narrow?280:360,Math.floor(content*(narrow ? 0.35 : 0.38)+1e-6),content-400))]}
 function update(){
  const next=enabled&&document.documentElement.hasAttribute('data-bw-wallet-modern')&&innerWidth>560?document.querySelector('.bw-wallet-sidebar'):null;
  if(next!==sidebar){sizer?.destroy();handle?.remove();sidebar?.closest('.file-page')?.style.removeProperty('--bw-wallet-sidebar-width');sidebar=next;sizer=handle=null;
   if(sidebar){handle=document.createElement('div');handle.className='bw-wallet-sidebar-resizer';handle.setAttribute('aria-label','调整文件夹栏宽度');handle.title='拖动调整宽度；方向键微调，双击恢复';sidebar.append(handle);sizer=separator(handle,{value:saved,bounds,onValue:n=>{const p=sidebar?.closest('.file-page');if(p)p.style.setProperty('--bw-wallet-sidebar-width',n+'px')},onCommit:n=>{saved=n;try{Promise.resolve(chrome.storage.local.set?.({walletSidebarWidth:n})).catch(()=>{})}catch{}}})}
  }else if(!handle?.hasAttribute('data-dragging'))sizer?.set(saved);
 }
 function queue(){if(!queued){queued=true;requestAnimationFrame(()=>{queued=false;update()})}}
 async function configure(){try{const s=await chrome.storage.local.get({enabled:true,wallet:true,visual:true,walletSidebarWidth:224});enabled=s.enabled&&s.wallet&&s.visual;if(Number.isFinite(s.walletSidebarWidth))saved=s.walletSidebarWidth}catch{enabled=false}update();if(sizer)sizer.set(saved)}
 new MutationObserver(queue).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['data-bw-wallet-modern']});window.addEventListener('resize',queue);window.addEventListener('hashchange',queue);chrome.storage.onChanged.addListener(configure);configure();
})();
