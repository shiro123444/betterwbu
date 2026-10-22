(() => {
  'use strict';
  if(document[Symbol.for('betterwbu.recognition-ui')])return;document[Symbol.for('betterwbu.recognition-ui')]=true;
  const labels={processing:'识别中',delayed:'等待超时',recognized:'已识别',duplicate:'重复票待确认',unconfirmed:'结果未确认'};
  let panel,list,refreshButton,summary,toggle,body,sizer,enabled=true,canRefresh=false,rows=[],expanded=false,height=140,observer;const decorated=new Map();
  function restore(){for(const [node,r]of decorated){if(node.isConnected&&node.textContent===r.label)node.textContent=r.before;r.card.removeAttribute('data-re-recognition-delayed')}decorated.clear()}
  function send(action){window.postMessage({type:'reimbursement-recognition-command',action},location.origin)}
  function render(){
    restore();const host=document.querySelector('.file-content-wrap')||document.querySelector('main');if(!enabled||!rows.length||!host){observer?.disconnect();observer=null;sizer?.destroy();sizer=null;panel?.remove();panel=null;return}
    if(!panel){
      panel=document.createElement('section');panel.className='re-recognition-results';panel.setAttribute('aria-label','票据识别状态');
      const header=document.createElement('div');header.className='re-recognition-header';const title=document.createElement('strong');title.textContent='识别状态';summary=document.createElement('span');summary.className='re-recognition-summary';summary.setAttribute('role','status');summary.setAttribute('aria-live','polite');
      body=document.createElement('div');body.className='re-recognition-body';body.id='bw-recognition-details';list=document.createElement('div');list.className='re-recognition-list';body.append(list);
      const actions=document.createElement('div');actions.className='re-recognition-actions';
      for(const [label,action]of [['重新查询','refresh'],['清除已结束提示','clear']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',()=>send(action));if(action==='refresh')refreshButton=b;actions.append(b)}
      toggle=document.createElement('button');toggle.type='button';toggle.setAttribute('aria-controls',body.id);toggle.addEventListener('click',()=>{expanded=!expanded;layout()});actions.append(toggle);header.append(title,summary,actions);panel.append(header,body);
      if(window.ReimbursementWalletPanels){const handle=document.createElement('div');handle.className='re-recognition-resizer';handle.setAttribute('aria-label','调整识别详情高度');handle.title='拖动调整高度；方向键微调，双击恢复';body.append(handle);sizer=window.ReimbursementWalletPanels.separator(handle,{axis:'y',value:height,reset:140,bounds:limits,onValue:n=>{body.style.height=n+'px'},onCommit:n=>{height=n;try{Promise.resolve(chrome.storage.local.set?.({walletRecognitionHeight:n})).catch(()=>{})}catch{}}})}
    }
    if(!panel.isConnected){host.prepend(panel);if(typeof ResizeObserver==='function'){observer=new ResizeObserver(layout);observer.observe(host);observer.observe(panel.querySelector('.re-recognition-header'))}}refreshButton.disabled=!canRefresh;refreshButton.title=canRefresh?'仅查询列表，不重新上传或识别':'上传、选择或查询中，请稍后';
    const pending=rows.filter(r=>r.phase==='processing').length,done=rows.filter(r=>r.phase==='recognized').length,issues=rows.length-pending-done;
    const text=[pending?pending+'项识别中':'',done?done+'项已完成':'',issues?issues+'项待核对':''].filter(Boolean).join(' · ');if(summary.textContent!==text)summary.textContent=text;
    const scroll=list.scrollTop;list.replaceChildren();layout();
    for(const r of rows){const line=document.createElement('div');line.className='re-recognition-row';const name=document.createElement('span');name.textContent=r.name;name.title=r.name;const state=document.createElement('strong');state.textContent=(r.reason?.startsWith('查询失败')?'查询失败':labels[r.phase]||'结果未确认')+(r.present?' · '+Math.floor(r.seconds/60)+'分'+r.seconds%60+'秒':'');line.append(name,state);if(r.reason||r.phase==='delayed'){const reason=document.createElement('small');reason.textContent=r.reason||(r.phase==='delayed'?'后台尚未返回结果，可重新查询':'');line.append(reason)}list.append(line);
      if(r.phase==='delayed'&&r.barcode){const anchor=[...document.querySelectorAll('em')].find(n=>n.textContent.trim()===r.barcode);for(let card=anchor?.parentElement,depth=0;card&&depth<4;card=card.parentElement,depth++){const rect=card.getBoundingClientRect();if(rect.width>700||rect.height>650)break;const native=[...card.querySelectorAll('*')].find(n=>!n.children.length&&n.textContent.trim()==='识别中');if(native){decorated.set(native,{before:native.textContent,label:'等待超时',card});native.textContent='等待超时';card.setAttribute('data-re-recognition-delayed','true');break}}}
    }
    list.scrollTop=scroll;
  }
  function room(){const host=panel?.parentElement,available=host?.getBoundingClientRect().height||innerHeight,tools=host?.querySelector('.file-tabs')?.getBoundingClientRect().height||96,header=panel?.querySelector('.re-recognition-header')?.getBoundingClientRect().height||34;return available-tools-header-Math.min(180,innerHeight*.3)-40}
  function limits(){return [64,Math.max(64,Math.min(260,Math.floor(innerHeight*.28),room()))]}
  function layout(){if(!panel||!body)return;const fits=room()>=64,open=expanded&&fits;body.hidden=!open;toggle.textContent=open?'收起详情':'展开详情';toggle.disabled=!fits;toggle.title=fits?'展开识别详情，拖动底边调整高度':'窗口空间不足，放大窗口后可展开详情';toggle.setAttribute('aria-expanded',String(open));panel.dataset.expanded=String(open);if(!body.querySelector('[data-dragging]'))sizer?.set(height)}
  window.addEventListener('resize',layout);
  window.addEventListener('message',e=>{if(e.source!==window||e.origin!==location.origin||e.data?.type!=='reimbursement-recognition-state')return;rows=Array.isArray(e.data.rows)?e.data.rows:[];canRefresh=e.data.canRefresh===true;render()});
  async function configure(){try{const s=await chrome.storage.local.get({enabled:true,wallet:true,walletRecognitionHeight:140});enabled=s.enabled&&s.wallet;if(Number.isFinite(s.walletRecognitionHeight))height=s.walletRecognitionHeight;render();sizer?.set(height)}catch{enabled=false;render()}}
  chrome.storage.onChanged.addListener(configure);window.addEventListener('hashchange',()=>{rows=[];expanded=false;render()});configure();
})();
