/* Native loading lifetime and status; CSS motion and one visible elapsed clock. */
(() => {
 'use strict';
 let overlay,status,title,hint,elapsed,current,suppressed,priorFocus,timer,observedHost,observedStarted;
 function active(host){return document.documentElement.dataset.reLoader==='true'&&host.isConnected&&!!host.closest('.ant-spin-spinning')&&host.closest('.ant-spin-dot')?.getClientRects().length>0}
 function region(host){const n=host.closest('.ant-spin-nested-loading');if(!n)return null;const b=n.getBoundingClientRect();return b.width>=240&&b.height>=120&&b.bottom>0&&b.right>0&&b.top<innerHeight&&b.left<innerWidth?{node:n,bounds:b}:null}
 function position(){if(!current?.local)return;const b=current.local.node.getBoundingClientRect();for(const [key,value]of Object.entries({left:b.left+'px',top:b.top+'px',width:b.width+'px',height:b.height+'px'}))if(overlay.style[key]!==value)overlay.style[key]=value}

 function visible(node){return node.getClientRects().length>0&&getComputedStyle(node).visibility!=='hidden'&&node.getAttribute('aria-hidden')!=='true'}
 function dialogOpen(){
  const selector='.ant-modal-wrap,.viewer-container.viewer-in,[role="alertdialog"]';
  if([...document.querySelectorAll(selector)].some(visible))return true;
  for(const iframe of document.querySelectorAll('iframe')){if(!visible(iframe))continue;try{if([...iframe.contentDocument.querySelectorAll(selector)].some(visible))return true}catch{}}
  return false;
 }
 function phase(text){
  if(/审查|审核|检查|合规|合法|小审/.test(text))return ['正在审查单据','核对金额、票据与关联信息'];
  if(/提交|推送/.test(text))return ['正在提交单据','等待系统返回提交结果'];
  if(/保存|暂存/.test(text))return ['正在保存草稿','等待系统确认保存结果'];
  if(/票据|发票|影像|预览/.test(text))return ['正在处理票据','等待票据与预览更新'];
  if(/加载/.test(text))return ['正在加载页面','正在加载页面内容'];
  return ['系统处理中','等待系统返回结果'];
 }
 function make(tag,className,text){const n=document.createElement(tag);n.className=className;if(text)n.textContent=text;return n}
 function makeOverlay(){
  overlay=make('div','re-wait-overlay');overlay.hidden=true;overlay.tabIndex=-1;
  overlay.setAttribute('role','status');overlay.setAttribute('aria-live','polite');overlay.setAttribute('aria-atomic','true');
  const scene=make('div','re-wait-scene'),orbit=make('div','re-wait-orbit');orbit.setAttribute('aria-hidden','true');
  for(let i=0;i<3;i++)orbit.append(make('span','re-wait-satellite'));
  orbit.append(make('span','re-wait-center'));title=make('h2','re-wait-title');hint=make('p','re-wait-hint');
  const line=make('div','re-wait-line');line.setAttribute('aria-hidden','true');line.append(make('span','re-wait-mark'));
  elapsed=make('span','re-wait-elapsed');elapsed.setAttribute('aria-hidden','true');
  const detail=make('details','re-wait-detail');detail.append(make('summary','','处理详情'));status=make('p','re-wait-status');detail.append(status);
  scene.append(orbit,title,hint,line,elapsed,detail);overlay.append(scene);document.body.append(overlay);
 }
 function tick(){
  if(!current)return;const seconds=Math.max(0,Math.floor((Date.now()-current.started)/1000));
  const clock='已等待 '+String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
  if(elapsed.textContent!==clock)elapsed.textContent=clock;
  const next=seconds>=60?'等待较久，系统尚未返回结果':seconds>=15?'仍在等待系统返回，请勿重复提交':current.hint;
  if(hint.textContent!==next)hint.textContent=next;
 }
 function hide(){
  if(timer!==undefined){clearInterval(timer);timer=undefined}
  if(!current)return;
  const indicator=current.indicator;current=null;document.documentElement.dataset.reWaiting='false';overlay.hidden=true;
  if(indicator.originalMarker===null)indicator.node.removeAttribute('data-re-wait-indicator');else indicator.node.setAttribute('data-re-wait-indicator',indicator.originalMarker);
  if(indicator.originalAria===null)indicator.node.removeAttribute('aria-hidden');else indicator.node.setAttribute('aria-hidden',indicator.originalAria);
  if(document.activeElement===overlay&&priorFocus?.isConnected&&!dialogOpen())priorFocus.focus({preventScroll:true});priorFocus=null;
 }
 function inspect(){
  if(suppressed&&!active(suppressed))suppressed=null;
  const custom=[...document.querySelectorAll('.ant-spin-spinning .loadingBG')].find(active);
  const host=custom||[...document.querySelectorAll('.ant-spin-spinning .ant-spin-dot')].find(n=>active(n)&&region(n));
  if(host!==observedHost){observedHost=host;observedStarted=Date.now()}
  if(!host||host===suppressed||document.hidden||dialogOpen()){hide();return}
  const indicator=host.closest('.ant-spin-dot'),text=indicator?.querySelector('.loadingText')?.textContent.trim()||host.closest('.ant-spin-spinning')?.querySelector('.ant-spin-text')?.textContent.trim()||(custom?'系统处理中':(/bill-wallet-web/.test(location.pathname)?'正在加载票据':'正在加载页面'));
  if(!indicator||!text){hide();return}if(!overlay)makeOverlay();
  if(current?.host!==host){hide();current={host,started:observedStarted,local:custom?null:region(host),indicator:{node:indicator,originalAria:indicator.getAttribute('aria-hidden'),originalMarker:indicator.getAttribute('data-re-wait-indicator')}};priorFocus=current.local?null:document.activeElement;
   indicator.setAttribute('aria-hidden','true');indicator.setAttribute('data-re-wait-indicator','true');document.documentElement.dataset.reWaiting='true';overlay.setAttribute('data-re-local',String(!!current.local));
   if(!current.local)for(const key of ['left','top','width','height'])overlay.style[key]='';
   overlay.hidden=false;if(!current.local)overlay.focus({preventScroll:true});timer=setInterval(tick,1000);
  }
  position();const step=phase(text);if(title.textContent!==step[0])title.textContent=step[0];current.hint=step[1];if(status.textContent!==text)status.textContent=text;tick();
 }
 let scheduled=false;const observer=new MutationObserver(()=>{if(!scheduled){scheduled=true;queueMicrotask(()=>{scheduled=false;inspect()})}});
 function start(){observer.observe(document.documentElement,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','aria-hidden','data-re-loader']});inspect()}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();document.addEventListener('visibilitychange',inspect);
 window.addEventListener('resize',inspect);window.addEventListener('scroll',inspect,true);
 document.addEventListener('keydown',event=>{if(!current)return;if(dialogOpen()){hide();return}if(event.key==='Escape'){suppressed=current.host;hide();event.preventDefault();event.stopPropagation()}else if(event.key==='Tab'&&!current.local){event.preventDefault();overlay.focus({preventScroll:true})}},true);
})();
