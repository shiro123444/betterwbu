(() => {
 'use strict';
 const core=window.ReimbursementBasicCore;
 window.ReimbursementBasicUI={mount({container,node,button,request,context,notify,openTemplates}){
  let editing=null,scope=null,libraryScope=null,database={},generation=0,shortcut;
  const list=node('div'),area=node('div'),add=button('新增模板',()=>edit());add.className='primary';area.hidden=true;container.append(add,area,list);
  const status=node('div',null,'muted');status.setAttribute('role','status');container.append(status);
  function close(){generation++;editing=null;area.replaceChildren();area.hidden=true;add.hidden=false}
  async function edit(previous,targetScope=scope){
   if(!core.scopeValid(targetScope))return;close();const token=++generation,draft=editing={previous,scope:targetScope};area.hidden=false;add.hidden=true;
   const form=node('form',null,'editor'),heading=node('h3',previous?'编辑模板':'新增模板');form.append(heading);
   function field(title,input){const label=node('label',null,'field');label.append(node('span',title),input);form.append(label);return input}
   const name=field('模板名称',node('input'));name.required=true;name.maxLength=40;name.value=previous?.name||'';
   const described=targetScope===scope?await request('basic-describe'):null;if(editing!==draft)return;
   const definitions=described?.ok?described.fields:Object.entries(core.fields).map(([key,d])=>({key,title:d.title,text:!!d.text})),controls=new Map(),writers=new Map();
   for(const d of definitions){
    const saved=previous?.values[d.key];if(d.text){const input=field(d.title,node('textarea'));input.maxLength=800;input.rows=3;input.value=saved?.value||'';controls.set(d.key,()=>input.value.trim()?{value:input.value.trim(),label:input.value.trim()}:null);writers.set(d.key,v=>input.value=v.value);continue}
    const select=field(d.title,node('select')),none=node('option','不填');none.value='';select.append(none);
    const choices=new Map();function append(rows){for(const row of rows||[]){if(choices.has(row.value))continue;choices.set(row.value,row);const option=node('option',row.label);option.value=row.value;select.append(option)}}
    append(saved?[saved]:[]);select.value=saved?.value||'';
    if(d.key==='SSQK')append(d.choices?.length?d.choices:['只包伙食','只包住宿','包食宿','不包食宿'].map(value=>({value,label:value})));
    else{
     const query=node('input');query.placeholder='搜索'+d.title;query.setAttribute('aria-label','搜索'+d.title);query.type='search';select.parentNode.insertBefore(query,select);
     let seq=0,timer,page=1,term='';const more=button('更多',()=>search(page+1));more.className='link';more.hidden=true;select.parentNode.append(more);
     async function search(nextPage=1){const s=++seq,pageTerm=query.value.trim();select.disabled=true;const result=await request('basic-options',{key:d.key,page:nextPage,term:pageTerm,expectedScope:libraryScope});if(editing!==draft||s!==seq)return;select.disabled=false;if(!result?.ok){status.textContent='选项加载失败，请重试。';return}if(nextPage===1){const current=choices.get(select.value);choices.clear();select.replaceChildren(none);append(current?[current]:[]);select.value=current?.value||''}append(result.choices);page=nextPage;term=pageTerm;more.hidden=!result.hasMore}
     query.addEventListener('input',()=>{clearTimeout(timer);seq++;timer=setTimeout(()=>search(),250)});search();
    }
    controls.set(d.key,()=>choices.get(select.value)||null);
    writers.set(d.key,v=>{append([v]);select.value=v.value});
   }
   if(described?.ok){const capture=button('使用当前值',async()=>{const fresh=await request('basic-describe');if(editing!==draft||fresh?.scope!==draft.scope)return;for(const d of fresh.fields||[])if(d.current)writers.get(d.key)?.(d.current)});capture.className='link';form.append(capture);
   }
   const actions=node('div',null,'actions'),save=button('保存',()=>{});save.type='submit';save.className='primary';actions.append(save,button('取消',()=>{close();status.textContent=''}));form.append(actions);area.append(form);name.focus();
   form.addEventListener('submit',async e=>{e.preventDefault();if(save.disabled)return;const values={};for(const [key,read]of controls){const v=read();if(v)values[key]=v}const entry=core.clean({id:previous?.id||core.newId(crypto),name:name.value,values});if(!entry){status.textContent='请填写名称并至少选择一项。';return}if(context().libraryScope!==libraryScope)return;save.disabled=true;const r=await chrome.runtime.sendMessage({type:'basic-template-save',scope:draft.scope,entry,previous}).catch(()=>null);if(editing!==draft)return;save.disabled=false;if(r?.ok){close();notify('模板已保存。');await load()}else status.textContent='保存失败，请重试。'});
  }
  async function apply(entry,targetScope,overwrite=false){if(scope!==targetScope||!context().settings.enabled)return;const d=await request('basic-describe');if(!d?.ok||d.scope!==targetScope)return notify('请打开可编辑报销单。');const r=await request('basic-apply',{entry,expectedScope:targetScope,expected:d.snapshot,overwrite});notify(r?.ok?(r.count?'已填充 '+r.count+' 项。':'没有空项。'):'填充失败，请检查选项是否仍有效。');return r}
  function quick(){
   if(shortcut&&!shortcut.isConnected)shortcut=null;
   const header=[...document.querySelectorAll('.reimbursementCreate .ant-collapse-header')].find(n=>[...n.childNodes].some(x=>x.nodeType===3&&x.textContent.trim()==='基本信息'));
   if(!header||!scope||!context().settings.enabled){shortcut?.remove();shortcut=null;return}
   if(!shortcut){shortcut=node('div',null,'re-basic-shortcut');shortcut.addEventListener('click',e=>e.stopPropagation());shortcut.addEventListener('keydown',e=>e.stopPropagation());header.querySelector('.ant-collapse-extra')?.append(shortcut)}
   const rows=core.library(database,libraryScope).filter(x=>x.scope===scope),signature=JSON.stringify(rows);if(shortcut.dataset.signature===signature)return;shortcut.dataset.signature=signature;shortcut.replaceChildren();
   if(rows.length){const select=node('select');select.setAttribute('aria-label','基本信息模板');const empty=node('option','选择模板');empty.value='';select.append(empty);for(const {entry}of rows){const option=node('option',entry.name);option.value=entry.id;select.append(option)}const result=node('span');result.setAttribute('role','status');const use=button('填充',async()=>{const item=rows.find(x=>x.entry.id===select.value);if(!item||use.disabled)return;use.disabled=true;const r=await apply(item.entry,scope);result.textContent=r?.ok?(r.count?'已填充':'无空项'):'未填充';use.disabled=false});use.disabled=true;select.addEventListener('change',()=>use.disabled=!select.value);shortcut.append(select,use,result)}
   shortcut.append(button('模板',openTemplates,'管理基本信息模板'));
  }
  let queued=false;new MutationObserver(()=>{if(!queued){queued=true;requestAnimationFrame(()=>{queued=false;quick()})}}).observe(document.documentElement,{childList:true,subtree:true});
  async function load(){const c=context();if(c.libraryScope!==libraryScope||c.scope!==scope)close();libraryScope=c.libraryScope;scope=core.scopeValid(c.scope)?c.scope:null;database=c.settings.basicTemplateDatabase||{};add.disabled=!scope;list.replaceChildren();status.textContent=scope?'':'打开报销单可新建模板。';
   const records=core.library(database,libraryScope);for(const {entry,scope:s}of records){const row=node('div',null,'record'),body=node('div',null,'record-body');body.append(node('div',entry.name,'value recipient-name'),node('div',Object.keys(entry.values).map(k=>core.fields[k].title).join(' · '),'muted'));const use=button('填空项',()=>apply(entry,s)),overwrite=button('覆盖填充',()=>{if(confirm('用模板替换所选基本信息？'))apply(entry,s,true)}),modify=button('编辑',()=>edit(entry,s));use.disabled=overwrite.disabled=s!==scope||!c.settings.enabled;use.className=overwrite.className=modify.className='link';body.append(use,overwrite,modify);const remove=button('×',async()=>{const r=await chrome.runtime.sendMessage({type:'basic-template-delete',scope:s,entry}).catch(()=>null);notify(r?.ok?'模板已删除。':'删除失败，请重试。');await load()},'删除模板'+entry.name);row.append(body,remove);list.append(row)}if(!records.length)list.append(node('p','暂无模板','muted'));quick();}
  return {load,close,apply};
 }};
})();
