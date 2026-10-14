(() => {
  'use strict';
  if(document[Symbol.for('betterwbu.recognition-ui')])return;document[Symbol.for('betterwbu.recognition-ui')]=true;
  const labels={processing:'识别中',delayed:'等待超时',recognized:'已识别',duplicate:'重复票待确认',unconfirmed:'结果未确认'};
  let panel,list,refreshButton,enabled=true,canRefresh=false,rows=[];const decorated=new Map();
  function restore(){for(const [node,r]of decorated){if(node.isConnected&&node.textContent===r.label)node.textContent=r.before;r.card.removeAttribute('data-re-recognition-delayed')}decorated.clear()}
  function send(action){window.postMessage({type:'reimbursement-recognition-command',action},location.origin)}
  function render(){
    restore();const host=document.querySelector('.file-content-wrap')||document.querySelector('main');if(!enabled||!rows.length||!host){panel?.remove();return}
    if(!panel){panel=document.createElement('section');panel.className='re-recognition-results';panel.setAttribute('aria-label','票据识别状态');const title=document.createElement('strong');title.textContent='识别状态';list=document.createElement('div');list.setAttribute('role','status');list.setAttribute('aria-live','polite');const actions=document.createElement('div');for(const [label,action]of [['重新查询','refresh'],['清除已结束提示','clear']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',()=>send(action));if(action==='refresh')refreshButton=b;actions.append(b)}panel.append(title,list,actions)}
    if(!panel.isConnected)host.prepend(panel);refreshButton.disabled=!canRefresh;refreshButton.title=canRefresh?'仅查询列表，不重新上传或识别':'上传、选择或查询中，请稍后';list.replaceChildren();
    for(const r of rows){const line=document.createElement('div');line.className='re-recognition-row';const name=document.createElement('span');name.textContent=r.name;name.title=r.name;const state=document.createElement('strong');state.textContent=(r.reason?.startsWith('查询失败')?'查询失败':labels[r.phase]||'结果未确认')+(r.present?' · '+Math.floor(r.seconds/60)+'分'+r.seconds%60+'秒':'');line.append(name,state);if(r.reason||r.phase==='delayed'){const reason=document.createElement('small');reason.textContent=r.reason||(r.phase==='delayed'?'后台尚未返回结果，可重新查询':'');line.append(reason)}list.append(line);
      if(r.phase==='delayed'&&r.barcode){const anchor=[...document.querySelectorAll('em')].find(n=>n.textContent.trim()===r.barcode);for(let card=anchor?.parentElement,depth=0;card&&depth<4;card=card.parentElement,depth++){const rect=card.getBoundingClientRect();if(rect.width>700||rect.height>650)break;const native=[...card.querySelectorAll('*')].find(n=>!n.children.length&&n.textContent.trim()==='识别中');if(native){decorated.set(native,{before:native.textContent,label:'等待超时',card});native.textContent='等待超时';card.setAttribute('data-re-recognition-delayed','true');break}}}
    }
  }
  window.addEventListener('message',e=>{if(e.source!==window||e.origin!==location.origin||e.data?.type!=='reimbursement-recognition-state')return;rows=Array.isArray(e.data.rows)?e.data.rows:[];canRefresh=e.data.canRefresh===true;render()});
  async function configure(){try{const s=await chrome.storage.local.get({enabled:true,wallet:true});enabled=s.enabled&&s.wallet;render()}catch{enabled=false;render()}}
  chrome.storage.onChanged.addListener(configure);window.addEventListener('hashchange',()=>{rows=[];render()});configure();
})();
