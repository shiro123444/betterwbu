(() => {
 'use strict';
 const mounted=new WeakMap();
 function templates(instance){
  for(let p=instance,n=0;p&&n<64;p=p.parent,n++){
   const list=p.setupState?.activityListApi;
   if(Array.isArray(list)){const activity=list.find(a=>a.activityMetaId===instance.props?.tableRecord?.activityMetaId);if(Array.isArray(activity?.behaviors))return activity.behaviors}
  }return [];
 }
 function root(instance){const el=instance.subTree?.el;if(el?.nodeType===1&&el.classList.contains('table-level2-box'))return el;const next=el?.nextElementSibling;return next?.classList.contains('table-level2-box')?next:null}
 const tools=window.ReimbursementExpenseTools={mount(instance,form,settings){
  if(typeof instance.setupState?.onAddBehaviorList!=='function'||typeof instance.setupState?.tabChange!=='function'||!Array.isArray(instance.props?.tableRecord?.behaviors))return;
  const box=root(instance);if(!box?.isConnected)return;
  let entry=mounted.get(box);
  if(!entry){
   const bar=document.createElement('div'),select=document.createElement('select');bar.dataset.reExpenseCategories='true';bar.style.cssText='display:inline-flex;gap:0;margin:0';
   select.setAttribute('aria-label','添加费用分类');select.className='re-category-select';bar.append(select);box.prepend(bar);
   entry={bar,select,instance,form,settings,signature:''};mounted.set(box,entry);
   select.addEventListener('change',()=>{
    const {instance:i,form:f,settings:s}=entry,id=select.value,activity=i.props.tableRecord;
    if(!s.enabled||String(f?.state)!=='2'||f.formId!=='c3771358d145490f9e363790c0519fde'||!f.activitys?.includes(activity)||i.setupState.isEdit?.data===false||!box.isConnected||i.isUnmounted||i.isDeactivated)return;
    const template=templates(i).find(b=>b.behaviorMetaId===id);if(!template||activity.behaviors.some(b=>b.behaviorMetaId===id))return;
    const category=JSON.parse(JSON.stringify(template));category.behaviorDetail=[];
    // Use the application's original category, tab and blank-row handlers.
    i.setupState.onAddBehaviorList(category);
    const index=activity.behaviors.indexOf(category);if(index<0)return;
    const tabKey=typeof i.setupState.tabActiveKey==='number'?index:String(index);
    i.setupState.tabActiveKey=tabKey;i.setupState.tabChange(tabKey);
    if(typeof i.setupState.onAddTableList==='function')i.setupState.onAddTableList(activity.behaviors[index]);
    select.value='';entry.signature='';tools.mount(i,f,s);
   });
  }
  const toolbar=box.querySelector?.('.ant-tabs-extra-content .btn'),original=toolbar?.querySelector('.anticon-plus-circle');
  if(toolbar&&entry.bar.parentNode!==toolbar)toolbar.insertBefore(entry.bar,original||toolbar.firstChild);else if(!entry.bar.isConnected)box.prepend(entry.bar);
  Object.assign(entry,{instance,form,settings});
  const editable=settings.enabled&&String(form?.state)==='2'&&form.formId==='c3771358d145490f9e363790c0519fde'&&form.activitys?.includes(instance.props.tableRecord)&&instance.setupState.isEdit?.data!==false;
  const available=templates(instance).filter(b=>typeof b.behaviorMetaId==='string'&&b.behaviorMetaName&&!instance.props.tableRecord.behaviors.some(e=>e.behaviorMetaId===b.behaviorMetaId));
  entry.bar.hidden=!editable||!available.length;
  entry.bar.style.display=editable&&available.length?'flex':'none';
  if(original)original.dataset.reCategoryOriginal=String(!!(editable&&available.length));
  const signature=JSON.stringify(available.map(b=>[b.behaviorMetaId,b.behaviorMetaName]));if(signature===entry.signature)return;entry.signature=signature;entry.select.replaceChildren();
  const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='添加分类';placeholder.disabled=true;placeholder.selected=true;entry.select.append(placeholder);
  for(const category of available){const option=document.createElement('option');option.value=category.behaviorMetaId;option.textContent=category.behaviorMetaName;entry.select.append(option)}
 }};
})();
