import React, {useSyncExternalStore, useState, useLayoutEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import {Menu} from '@base-ui/react/menu';
import './ui-runtime.jsx';
import {createWorkspaceModel} from './workspace-model.cjs';
import {createSidebarToggle} from './sidebar-toggle.jsx';
import {createFillReview} from './fill-review.jsx';

const paths = {
  chevron:'m6 9 6 6 6-6', more:'M5 12h.01M12 12h.01M19 12h.01',
  plus:'M12 5v14M5 12h14', copy:'M9 9h12v12H9zM5 15H3V3h12v2',
  trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
};
function Icon({name, ...props}) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]}/></svg>;
}
function Heading({section, model}) {
  useLayoutEffect(()=>{model.presentHeader(section);return()=>section.header.removeAttribute('data-bw-ready')},[section.header,model]);
  return <div className="bw-heading">
    <h2><button type="button" className="bw-heading-toggle" aria-expanded={section.expanded}
      onClick={event=>{event.stopPropagation();model.invoke(section.header)}}>
      <span>{section.title}</span><Icon name="chevron" className={section.expanded?'bw-chevron-open':''}/>
    </button></h2>
    {section.amount && <span className="bw-section-amount">{section.amount}</span>}
  </div>;
}
function RowActions({row, model}) {
  useLayoutEffect(()=>{row.cell.dataset.bwRowReady='true';return()=>row.cell.removeAttribute('data-bw-row-ready')},[row.cell,row.id]);
  return <div className="bw-row-actions" onClick={event=>event.stopPropagation()}>
    <button type="button" className="bw-button bw-button-quiet" disabled={row.disabled}
      onClick={()=>model.invoke(row.detail)}>详情</button>
    {!!row.menu.length && <Menu.Root>
      <Menu.Trigger className="bw-button bw-icon-button" aria-label="明细更多操作"><Icon name="more"/></Menu.Trigger>
      <Menu.Portal><Menu.Positioner sideOffset={6} align="end" collisionPadding={12} className="bw-popover-positioner"><Menu.Popup className="bw-menu">
        {row.menu.map(item=><Menu.Item key={item.label} disabled={item.disabled} className={'bw-menu-item '+(item.label==='删除此行'?'bw-menu-danger':'')}
          onClick={()=>model.invoke(item.node)}><Icon name={item.label==='新增一行'?'plus':item.label==='复制此行'?'copy':'trash'}/>{item.label}</Menu.Item>)}
      </Menu.Popup></Menu.Positioner></Menu.Portal>
    </Menu.Root>}
  </div>;
}
function Workspace({model}) {
  const state=useSyncExternalStore(model.subscribe,model.snapshot,model.snapshot);
  const [selected,setSelected]=useState('');
  const navigation=state.root?.querySelector('[data-bw-navigation]');
  return <>
    {navigation && createPortal(<nav className="bw-section-nav" aria-label="报销表单章节">
      {state.sections.map(s=><a key={s.id} href={'#'+s.id} aria-current={selected===s.id?'location':undefined}
        onClick={e=>{e.preventDefault();setSelected(s.id);if(!s.expanded)model.invoke(s.header);s.section.scrollIntoView({block:'start',behavior:'instant'})}}>{s.title.replace(/（.*$/, '')}</a>)}
    </nav>,navigation)}
    {state.sections.map(s=>createPortal(<Heading section={s} model={model}/>,s.host,s.id))}
    {state.rows.map(r=>createPortal(<RowActions row={r} model={model}/>,r.host,r.id))}
  </>;
}

const marker=Symbol.for('betterwbu.react-workspace');
if(!document[marker]) {
  const model=createWorkspaceModel(document);
  const sidebar=createSidebarToggle(document);
  const fillReview=createFillReview(document);
  let reactRoot, mount, navigation, nativeRoot, frame, stopped=false;
  function tick(){
    frame=null;if(stopped)return;
    const state=model.scan();
    if(nativeRoot!==state.root || (navigation&&!navigation.isConnected)) {
      navigation?.remove();nativeRoot=state.root;navigation=null;
      if(nativeRoot){navigation=document.createElement('div');navigation.dataset.bwOwned='true';navigation.dataset.bwNavigation='true';nativeRoot.prepend(navigation)}
      // Only the tiny React-owned mount is recreated; native form nodes stay put.
      reactRoot?.unmount();mount?.remove();reactRoot=null;
    }
    if(state.root&&!reactRoot){mount=document.createElement('div');mount.dataset.bwOwned='true';mount.hidden=true;document.body.append(mount);reactRoot=createRoot(mount);reactRoot.render(<Workspace model={model}/>)}
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(tick)}
  const observer=new MutationObserver(records=>{
    if(records.some(r=>!r.target.closest?.('[data-bw-owned]') || r.type==='attributes'))schedule();
  });
  async function configure(){try{const s=await chrome.storage.local.get({enabled:true,visual:true});model.enable(s.enabled&&s.visual);sidebar.enable(s.enabled&&s.visual);fillReview.enable(s.enabled);schedule()}catch{model.enable(false);sidebar.enable(false);fillReview.enable(false);schedule()}}
  function start(){observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','aria-expanded','aria-disabled','disabled','data-re-visual']});sidebar.start();fillReview.start();configure();schedule()}
  document[marker]={model,refresh:tick,destroy(){stopped=true;observer.disconnect();if(frame)cancelAnimationFrame(frame);reactRoot?.unmount();mount?.remove();navigation?.remove();sidebar.destroy();fillReview.destroy();model.destroy()}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  chrome.storage.onChanged.addListener(configure);window.addEventListener('hashchange',schedule);
}
