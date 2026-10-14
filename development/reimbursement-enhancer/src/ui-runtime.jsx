import React, {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {Combobox} from '@base-ui/react/combobox';
import {Dialog} from '@base-ui/react/dialog';
import {Toast} from '@base-ui/react/toast';
import {Popover} from '@base-ui/react/popover';

const key=item=>String(item?.value??item?.id??item?.code??'');
const label=item=>item?.label??item?.name??'';
function Icon({name}){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={name==='close'?'M6 6l12 12M18 6 6 18':name==='check'?'m5 12 4 4L19 6':'m6 9 6 6 6-6'}/></svg>}
function portalFor(container){return container.closest?.('[data-bw-dialog]')|| (container.getRootNode() instanceof ShadowRoot?container.getRootNode():document.body)}
function focusedElement(){let node=document.activeElement;while(node?.shadowRoot?.activeElement)node=node.shadowRoot.activeElement;return node}
const roots=new Set();
function mount(container,render){const root=createRoot(container),unmount=root.unmount.bind(root);root.unmount=()=>{roots.delete(root);unmount()};roots.add(root);flushSync(()=>root.render(render()));return root}

// Own extension fields only. Native financial fields stay in their original Vue tree.
function SearchChoice({config,controller}){
 const [selected,setSelected]=useState(config.initialValue||null),[text,setText]=useState(label(config.initialValue)),[open,setOpen]=useState(false),[rows,setRows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[more,setMore]=useState(false),[hidden,setHidden]=useState(false);
 const token=useRef(0),timer=useRef(),page=useRef(1),textRef=useRef(text),queryRef=useRef(''),input=useRef(),selectedRef=useRef(selected),openRef=useRef(false),alive=useRef(true);
 function invalidate(){token.current++;clearTimeout(timer.current);setBusy(false)}
 async function search(term,nextPage=1){
  const serial=++token.current,inputAtStart=textRef.current;queryRef.current=term;setBusy(true);setError('');
  try{const result=await config.load(term,nextPage);if(!alive.current||serial!==token.current||!openRef.current||textRef.current!==inputAtStart)return;const items=result?.items||result?.banks||result?.choices||[];if(!result?.ok||!Array.isArray(items))throw Error('查询失败');
   setRows(before=>nextPage===1?items:[...new Map([...before,...items].map(item=>[key(item),item])).values()]);page.current=nextPage;setMore(!!result.hasMore);
  }catch{if(alive.current&&serial===token.current){setRows([]);setMore(false);setError('查询失败，请重试。')}}finally{if(alive.current&&serial===token.current)setBusy(false)}
 }
 function changeText(value){invalidate();textRef.current=value;setText(value);selectedRef.current=null;setSelected(null);setRows([]);setMore(false);config.onInput?.(value);openRef.current=true;setOpen(true);timer.current=setTimeout(()=>search(value),250)}
 function changeOpen(next){openRef.current=next;setOpen(next);if(next){clearTimeout(timer.current);const term=selectedRef.current&&textRef.current===label(selectedRef.current)?'':textRef.current;timer.current=setTimeout(()=>search(term),0)}else{invalidate();setError('')}}
 function choose(item){if(!item)return;invalidate();selectedRef.current=item;setSelected(item);textRef.current=label(item);setText(label(item));config.onValue?.(item);changeOpen(false)}
 useLayoutEffect(()=>{controller.getValue=()=>selectedRef.current;controller.setValue=item=>{invalidate();selectedRef.current=item;setSelected(item);textRef.current=label(item);setText(label(item));setRows([]);config.onValue?.(item)};controller.setHidden=value=>{setHidden(value);if(value)changeOpen(false)};controller.focus=()=>input.current?.focus();return()=>{alive.current=false;token.current++;clearTimeout(timer.current)}},[]);
 const items=selected&&!rows.some(row=>key(row)===key(selected))?[selected,...rows]:rows;
 return <div hidden={hidden} className="bw-choice" data-bw-owned="true">
  <Combobox.Root items={items} filteredItems={rows} filter={null} value={selected} inputValue={text} open={open} required={!!config.required&&!hidden}
   itemToStringLabel={label} itemToStringValue={key} isItemEqualToValue={(a,b)=>key(a)===key(b)} onOpenChange={changeOpen}
   onInputValueChange={(value,details)=>{if(['input-change','clear-press'].includes(details.reason))changeText(value)}}
   onValueChange={(item,details)=>{if(item&&details.reason==='item-press')choose(item)}}>
   <Combobox.InputGroup className="bw-choice-group">
    <Combobox.Input ref={input} aria-label={config.label} placeholder={config.placeholder||'搜索或选择'} maxLength={config.maxLength||250} required={!!config.required&&!hidden} disabled={!!config.disabled} autoComplete="off" onKeyDown={event=>{if(event.key==='Escape'&&!openRef.current&&config.onEscape){event.preventBaseUIHandler?.();event.preventDefault();event.stopPropagation();config.onEscape()}}}/>
    {selected&&!config.required&&<Combobox.Clear className="bw-choice-trigger" aria-label={'清除'+config.label}><Icon name="close"/></Combobox.Clear>}
    <Combobox.Trigger className="bw-choice-trigger" aria-label={'展开'+config.label}><Icon name="chevron"/></Combobox.Trigger>
   </Combobox.InputGroup>
   <Combobox.Portal container={portalFor(config.container)}>
    <Combobox.Positioner className="bw-popover-positioner" sideOffset={6} collisionPadding={12} positionMethod="fixed">
     <Combobox.Popup className="bw-choice-popup" data-bw-owned="true">
      <div className="bw-choice-status" role="status">{rows.length?(busy?'正在查询…':error):''}</div>
      <Combobox.Empty className="bw-choice-status" role="status">{busy?'正在查询…':error||'无匹配结果'}</Combobox.Empty>
      <Combobox.List className="bw-choice-list">{item=><Combobox.Item key={key(item)} value={item} className="bw-choice-option">
       <span><span className="bw-choice-name">{label(item)}</span>{item.code&&<small>{item.code}</small>}</span><Combobox.ItemIndicator><Icon name="check"/></Combobox.ItemIndicator>
      </Combobox.Item>}</Combobox.List>
      {error&&<button type="button" className="bw-choice-more" onClick={()=>search(textRef.current)}>重试</button>}
      {more&&<button type="button" className="bw-choice-more" disabled={busy} onClick={()=>search(queryRef.current,page.current+1)}>更多结果</button>}
     </Combobox.Popup>
    </Combobox.Positioner>
   </Combobox.Portal>
  </Combobox.Root>
 </div>;
}

function ExistingExtensionContent({node}){const ref=useRef();useLayoutEffect(()=>{ref.current.append(node);return()=>node.remove()},[node]);return <div className="bw-panel-content" ref={ref}/>}
function RecipientPicker({config,controller}){const [query,setQuery]=useState(''),input=useRef(),popup=useRef();useLayoutEffect(()=>{controller.contains=node=>!!popup.current?.contains(node)},[]);const rows=config.entries.filter(entry=>label(entry).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));return <Popover.Root open onOpenChange={next=>{if(!next)config.onClose?.()}}><Popover.Portal><Popover.Positioner anchor={config.anchor} sideOffset={6} collisionPadding={12} positionMethod="fixed" className="bw-popover-positioner"><Popover.Popup ref={popup} className="bw-choice-popup bw-recipient-popup" aria-label="已保存收款人" initialFocus={()=>input.current} finalFocus={false} data-bw-owned="true">
 <Combobox.Root inline open items={config.entries} filteredItems={rows} filter={null} value={null} inputValue={query} itemToStringLabel={label} itemToStringValue={key} onInputValueChange={(text,details)=>{if(details.reason==='input-change')setQuery(text)}} onValueChange={(entry,details)=>{if(entry&&details.reason==='item-press')config.onValue(entry)}}>
  <Combobox.InputGroup className="bw-choice-group"><Combobox.Input ref={input} aria-label="搜索收款人" placeholder="搜索收款人" autoComplete="off"/></Combobox.InputGroup><Combobox.List>{entry=><Combobox.Item key={key(entry)} value={entry} className="bw-choice-option">{entry.label}</Combobox.Item>}</Combobox.List><Combobox.Empty className="bw-choice-status">无匹配结果</Combobox.Empty>
 </Combobox.Root>
 </Popover.Popup></Popover.Positioner></Popover.Portal></Popover.Root>}
function Panel({config,controller}){
 const [open,setOpen]=useState(false),[narrow,setNarrow]=useState(innerWidth<=1100);
 useLayoutEffect(()=>{controller.setOpen=next=>setOpen(next);const resize=()=>setNarrow(innerWidth<=1100);window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)},[]);
 return <Dialog.Root open={open} modal={narrow} disablePointerDismissal onOpenChange={next=>{setOpen(next);config.onOpenChange(next)}}>
  <Dialog.Portal container={config.container} keepMounted>
   <Dialog.Popup className="bw-sidebar" data-bw-dialog="sidebar" aria-label="信息管理" aria-modal={narrow||undefined} initialFocus={()=>config.panel.querySelector('.close')} finalFocus={()=>config.trigger}>
    <Dialog.Title className="bw-sr-only">信息管理</Dialog.Title>
    <ExistingExtensionContent node={config.panel}/>
    <Dialog.Close className="bw-sr-only" tabIndex={-1} aria-label="关闭信息管理面板">关闭</Dialog.Close>
   </Dialog.Popup>
  </Dialog.Portal>
 </Dialog.Root>;
}
const toastManager=Toast.createToastManager();let toastRoot,lastToast,lastTitle,lastTime=0;
function ToastList(){const {toasts}=Toast.useToastManager();return toasts.map(item=><Toast.Root key={item.id} toast={item} className="bw-toast" data-type={item.type} swipeDirection="right"><Toast.Content className="bw-toast-content"><Icon name={item.type==='error'?'close':'check'}/><Toast.Title/>{item.type==='error'&&<Toast.Close className="bw-toast-close" aria-label="关闭提示"><Icon name="close"/></Toast.Close>}</Toast.Content></Toast.Root>)}
function ensureToast(){if(toastRoot)return;const host=document.createElement('div');host.dataset.bwOwned='true';document.body.append(host);toastRoot=mount(host,()=> <Toast.Provider toastManager={toastManager} limit={1} timeout={2600}><Toast.Portal><Toast.Viewport className="bw-toast-viewport" aria-label="提示"><ToastList/></Toast.Viewport></Toast.Portal></Toast.Provider>)}
function notify(title){if(!title)return;ensureToast();const now=Date.now();if(title===lastTitle&&now-lastTime<600)return;lastTitle=title;lastTime=now;const error=/失败|错误|请检查|未能/.test(title);lastToast=toastManager.add({id:'reimbursement-local-feedback',title,type:error?'error':'success',timeout:error?5000:2600})}

function ContentDialog({config,controller}){
 const [open,setOpen]=useState(false),[content,setContent]=useState(null),[title,setTitle]=useState('');
 const anchor=useRef(),closed=useRef();useLayoutEffect(()=>{controller.open=(nextTitle,node,source,onClose)=>{anchor.current=source;closed.current=onClose;setTitle(nextTitle);setContent(node);setOpen(true)};controller.close=()=>{setOpen(false);const fn=closed.current;closed.current=null;fn?.()}},[]);
 return <Dialog.Root open={open} onOpenChange={next=>{setOpen(next);if(!next){const fn=closed.current;closed.current=null;fn?.()}}}><Dialog.Portal><Dialog.Backdrop className="bw-dialog-backdrop"/><Dialog.Popup className="bw-detail-dialog" data-bw-dialog="detail" finalFocus={()=>anchor.current||true}>
  <div className="bw-dialog-heading"><Dialog.Title>{title}</Dialog.Title><Dialog.Close className="bw-button bw-icon-button" aria-label="关闭详情"><Icon name="close"/></Dialog.Close></div>
  {content&&<ExistingExtensionContent node={content}/>}
 </Dialog.Popup></Dialog.Portal></Dialog.Root>;
}
let detailController;
window.ReimbursementUI={
 version:'base-ui-1.9.0',
 mountChoice(config){const controller={};const root=mount(config.container,()=> <SearchChoice config={config} controller={controller}/>);controller.destroy=()=>root.unmount();return controller},
 openRecipientPicker(config){const controller={};const host=document.createElement('div');host.dataset.bwOwned='true';document.body.append(host);const root=mount(host,()=> <RecipientPicker config={config} controller={controller}/>);controller.destroy=()=>{const restore=controller.contains?.(document.activeElement);root.unmount();host.remove();if(restore&&config.anchor.isConnected)config.anchor.focus({preventScroll:true})};return controller},
 mountPanel(config){const controller={};const host=document.createElement('div');host.dataset.bwOwned='true';config.container.append(host);const root=mount(host,()=> <Panel config={config} controller={controller}/>);controller.destroy=()=>{root.unmount();host.remove()};return controller},
 notify,
 openDetail(title,content,anchor,options={}){if(!detailController){detailController={};const host=document.createElement('div');host.dataset.bwOwned='true';document.body.append(host);mount(host,()=> <ContentDialog config={options} controller={detailController}/>)}detailController.open(title,content,anchor,options.onClose);return detailController},
 confirm(title,description){return new Promise(resolve=>{const content=document.createElement('div');content.className='bw-confirm-content';const text=document.createElement('p');text.textContent=description;const actions=document.createElement('div');actions.className='bw-confirm-actions';const cancel=document.createElement('button'),accept=document.createElement('button');cancel.type=accept.type='button';cancel.className='bw-button';accept.className='bw-button bw-primary';cancel.textContent='取消';accept.textContent='确认';actions.append(cancel,accept);content.append(text,actions);let answer=false;const controller=window.ReimbursementUI.openDetail(title,content,focusedElement(),{onClose:()=>resolve(answer)});cancel.onclick=()=>controller.close();accept.onclick=()=>{answer=true;controller.close()}})},
 destroy(){feedbackObserver?.disconnect();for(const root of [...roots])root.unmount();toastRoot=null;detailController=null},
};
let nativeFeedbackEnabled=true,feedbackObserver;const forwarded=new WeakMap();
function nativeFeedback(){if(!nativeFeedbackEnabled)return;for(const node of document.querySelectorAll('.ant-message-notice-content')){const title=node.textContent.trim();if(!/^(暂存成功|保存成功|提交成功)[！!。.]?$/.test(title)||forwarded.get(node)===title)continue;forwarded.set(node,title);notify(title);node.dataset.bwFeedback='true'}}
function startFeedback(){feedbackObserver=new MutationObserver(nativeFeedback);feedbackObserver.observe(document.body,{childList:true,characterData:true,subtree:true})}
async function motion(){try{const s=await chrome.storage.local.get({motion:true,enabled:true,visual:true});document.documentElement?.setAttribute('data-bw-motion',String(s.motion));nativeFeedbackEnabled=s.enabled&&s.visual;if(!nativeFeedbackEnabled)for(const n of document.querySelectorAll('[data-bw-feedback]'))n.removeAttribute('data-bw-feedback')}catch{}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startFeedback,{once:true});else startFeedback();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',motion,{once:true});else motion();chrome.storage.onChanged.addListener(motion);
