(() => {
  'use strict';
  if (location.hostname !== 'wsbx.wbu.edu.cn' || window.__reimbursementEnhancer) return;
  const core = window.ReimbursementEnhancerCore;
  const status = window.__reimbursementEnhancer = { version: '0.13.9', bankInstances: 0, transferInstances: 0, summaryInstances: 0, compatible: false };
  let settings = { enabled: true, totals: true, aiGuard: true }, requireModule, vue, controller;
  const definitions = new WeakSet(), instances = new WeakSet(), scannedModules = new WeakSet();
  const stateMarker = Symbol('reimbursement-enhancer');
  const totalsBaseline = new WeakMap();
  let totalsWatching=false;
  window.addEventListener('message', event => {
    if (event.source === window && event.origin === location.origin && event.data?.type === 'reimbursement-enhancer-settings') {
      Object.assign(settings, event.data.settings);
    }
  });
  const value = v => vue.isRef(v) ? v.value : v;
  function put(state, key, next) { if (vue.isRef(state[key])) state[key].value = next; else state[key] = next; }
  function bank(state, props) {
    const info = props.componentInfo;
    if (info?.key !== 'branchBankName' || info.postUrl !== 'F0003' || info.dataSource !== 'post' || info.selectCondition?.length || info.associativeRule?.length) return;
    if (!state.page || !state.optionList || typeof state.onSearch !== 'function') return;
    const query = requireModule('f375').Q;
    if (typeof query !== 'function') return;
    status.bankInstances++;
    const old = {};
    for (const key of ['onSearch','handleEnter','onMouseLeave','dropdownVisibleChange','onChangePagination','onSelect','selectChange']) old[key] = state[key];
    let term = '', sequence = 0, timer, open = false;
    function cancel() { clearTimeout(timer); sequence++; put(state, 'spinning', false); }
    async function load() {
      clearTimeout(timer); const token = ++sequence;
      const page = value(state.page); put(state, 'spinning', true);
      try {
        const response = await query({ assetCode: 'F0003', queryParam: {}, currentPage: page.currentPage, pageSize: page.pageSize, customCondition: core.condition(term) });
        if (token !== sequence || !open || !settings.enabled) return;
        put(state, 'optionList', response.success && Array.isArray(response.data) ? response.data : []);
        page.totalPage = response.success ? Number(response.totalRecord || 0) : 0;
      } catch {
        if (token === sequence) { put(state, 'optionList', []); page.totalPage = 0; }
      } finally { if (token === sequence) put(state, 'spinning', false); }
    }
    state.onSearch = text => {
      if (!settings.enabled) return old.onSearch(text);
      term = String(text || ''); cancel(); value(state.page).currentPage = 1;
      put(state, 'optionList', []); value(state.page).totalPage = 0;
      timer = setTimeout(load, 250);
    };
    state.dropdownVisibleChange = visible => {
      if (!settings.enabled) return old.dropdownVisibleChange(visible);
      open = !!visible; cancel();
      if (!open) return;
      term = ''; value(state.page).currentPage = 1;
      put(state, 'showCols', (info.refTableShowField || []).map(f => ({ title: f.name, dataIndex: f.code, key: f.code, width: 100 })));
      load();
    };
    state.handleEnter = event => settings.enabled ? load() : old.handleEnter(event);
    state.onChangePagination = page => {
      if (!settings.enabled) return old.onChangePagination(page);
      value(state.page).currentPage = page; load();
    };
    state.onSelect = (...args) => { cancel(); open = false; return old.onSelect(...args); };
    state.selectChange = (...args) => { cancel(); return old.selectChange(...args); };
    state.onMouseLeave = (...args) => { if (!settings.enabled) return old.onMouseLeave(...args); };
  }
  function summary(state, props) {
    if (props.collapse?.option?.key !== 'paymentsAndReceipts' || !('totalActualReceivableCurrency' in state)) return;
    status.summaryInstances++;
    const original = Object.getOwnPropertyDescriptor(state,'totalActualReceivableCurrency')?.value ?? state.totalActualReceivableCurrency;
    const calculated = vue.computed(() => {
      if (!settings.enabled || !settings.totals) return value(original);
      try { return (core.sum(controller.form?.receivableInfo || [], 'actualReceivableCurrency') / 100).toFixed(2); }
      catch { return value(original); }
    });
    state.totalActualReceivableCurrency = calculated;
  }
  function transfers(state){
    if(typeof state.downFile!=='function'||typeof state.upFile!=='function'||typeof state.isBtnShow!=='function')return;
    const original=state.isBtnShow;
    state.isBtnShow=(...args)=>settings.enabled&&['importData','expData'].includes(args[1])?false:original.apply(state,args);
    status.transferInstances++;
  }
  function patchState(state, props) {
    if (state[stateMarker]) return false;
    state[stateMarker] = true;
    bank(state, props); transfers(state); summary(state, props);
    return true;
  }
  function definition(type) {
    if (!type || typeof type !== 'object' || definitions.has(type)) return;
    definitions.add(type);
    if (typeof type.setup === 'function' && (type.name === 'selectTextCmpt' || type.setup.toString().includes('totalActualReceivableCurrency') || (type.render?.toString().includes('importData')&&type.render?.toString().includes('expData')))) {
      const original = type.setup;
      type.setup = function (props, context) {
        const result = original.call(this, props, context);
        if (result && typeof result === 'object' && !result.then) patchState(result, props);
        return result;
      };
    }
    for (const child of Object.values(type.components || {})) definition(child);
  }
  function walk(node, visited) {
    if (!node || typeof node !== 'object' || visited.has(node)) return;
    visited.add(node);
    if (Array.isArray(node)) { for (const child of node) walk(child, visited); return; }
    if (node.component) {
      const instance = node.component;
      definition(instance.type);
      if (!instances.has(instance)) {
        instances.add(instance);
        // Future instances are handled in setup, existing ones are adapted in place.
        const adapted = patchState(instance.setupState || {}, instance.props || {});
        if (adapted && instance.isMounted && typeof instance.update === 'function' &&
            (instance.type.name === 'selectTextCmpt' || typeof instance.setupState?.downFile==='function' || instance.props?.collapse?.option?.key === 'paymentsAndReceipts')) instance.update();
      }
      walk(instance.subTree, visited);
      window.ReimbursementMemoryBridge?.register(instance);
      window.ReimbursementBasicBridge?.register(instance);
      window.ReimbursementExpenseTools?.mount(instance,controller.form,settings);
      window.ReimbursementInvoiceTools?.register(instance);
      window.ReimbursementFillCompat?.register(instance);
    }
    for (const key of ['children','dynamicChildren','ssContent','ssFallback','activeBranch','pendingBranch']) walk(node[key], visited);
    if (node.suspense) { walk(node.suspense.activeBranch, visited); walk(node.suspense.pendingBranch, visited); }
  }
  function updateTotals() {
    if (!settings.enabled || !settings.totals || !location.hash.startsWith('#/reimbursementCreate')) return;
    const form = controller.form;
    if (!form || String(form.state) !== '2') return;
    try {
      const plan = core.travelPlan(form); if (!plan) return;
      const signature = JSON.stringify(form.activitys.map(a => a.behaviors.map(b => b.behaviorDetail.map(d => d.BSX070306 ?? d.BSX070304 ?? 0))));
      if (!totalsBaseline.has(form)) { totalsBaseline.set(form, signature); return; }
      if (totalsBaseline.get(form) === signature) return;
      for (const item of plan) {
        if (!(item.key in item.target)) continue;
        const next = typeof item.target[item.key] === 'string' ? (item.amount / 100).toFixed(2) : item.amount / 100;
        if (item.target[item.key] !== next) item.target[item.key] = next;
      }
      totalsBaseline.set(form, signature);
    } catch { /* Unknown or invalid amount: preserve the original form. */ }
  }
  function watchedAmounts(){const form=controller.form,activities=Array.isArray(form?.activitys)?form.activitys:[];return JSON.stringify(activities.map(a=>(Array.isArray(a.behaviors)?a.behaviors:[]).map(b=>(Array.isArray(b.behaviorDetail)?b.behaviorDetail:[]).map(d=>d.BSX070306??d.BSX070304??0))))}
  function connect() {
    if (vue && controller) return true;
    if (!requireModule) {
      if (!Array.isArray(window.webpackJsonp) || window.webpackJsonp.push === Array.prototype.push) return false;
      const id = '__reimbursement_enhancer_' + Date.now();
      window.webpackJsonp.push([[id], { [id]: (module, exports, req) => { requireModule = req; } }, [[id]]]);
      if (requireModule?.c) delete requireModule.c[id];
      if (requireModule?.m) delete requireModule.m[id];
    }
    if(window.ReimbursementMemoryBridge&&requireModule){
      window.ReimbursementMemoryBridge.getQuery=()=>{try{return requireModule('f375').Q}catch{return null}};
    }
    if (!requireModule?.c?.f2bf || !requireModule.c.d3ae || !requireModule.c.f375) return false;
    vue = requireModule('f2bf');
    if (typeof vue.reactive !== 'function' || typeof vue.computed !== 'function') { vue = null; return false; }
    settings = vue.reactive(settings);
    controller = vue.reactive(requireModule('d3ae').a); status.compatible = true;
    window.ReimbursementFillCompat?.bind({form:()=>controller.form,enabled:()=>settings.enabled&&settings.totals,nextTick:vue.nextTick,refresh:tick,http:requireModule('d354')?.a,bills:()=>window.ReimbursementInvoiceTools?.readBills?.()||[],readDraft:id=>requireModule('351f').o({id}),readAudit:id=>requireModule('351f').k({reimbId:id})});
    window.ReimbursementInvoiceTools?.bind({
      form:()=>controller.form, settings, raw:vue.toRaw, nextTick:vue.nextTick, watch:vue.watch, refresh:tick,
      compute(form){
        const plan=core.travelPlan(form);if(!plan)throw Error('费用明细结构不兼容');
        for(const item of plan)item.target[item.key]=typeof item.target[item.key]==='string'?(item.amount/100).toFixed(2):item.amount/100;
        let originalTotal=0;
        for(const activity of form.activitys){let subtotal=0;for(const behavior of activity.behaviors){if(behavior.behaviorKey==='summary'||behavior.behaviorMetaName==='总览')continue;const amount=core.sum(behavior.behaviorDetail.map(d=>({amount:d.BSX070303??d.BSX070306??0})),'amount');behavior.BSX060203=(amount/100).toFixed(2);subtotal+=amount}if(!Number.isSafeInteger(subtotal))throw Error('amount');activity.ASX060301=(subtotal/100).toFixed(2);originalTotal+=subtotal}
        if(!Number.isSafeInteger(originalTotal))throw Error('amount');
        if('totalAmountOrigin'in form)form.totalAmountOrigin=typeof form.totalAmountOrigin==='string'?(originalTotal/100).toFixed(2):originalTotal/100;
        for(const activity of form.activitys)for(const b of activity.behaviors)if(b.behaviorKey==='summary'||b.behaviorMetaName==='总览')b.BSX060206=activity.ASX060401;
        totalsBaseline.set(form,watchedAmounts());
      }
    });
    updateTotals();
    if(typeof vue.watch==='function'){
      vue.watch(()=>[settings.enabled,settings.totals,controller.form,controller.form?.state,watchedAmounts()],updateTotals,{flush:'post'});
      totalsWatching=true;
    }
    if (window.ReimbursementMemoryBridge) {
      window.ReimbursementMemoryBridge.getForm = () => controller.form;
      window.ReimbursementMemoryBridge.getQuery = () => requireModule('f375').Q;
    }
    return true;
  }
  function tick() {
    try {
      if (!connect()) return;
      const app = document.querySelector('#app')?.__vue_app__;
      if (!app) return;
      for (const type of Object.values(app._context?.components || {})) definition(type);
      for (const module of Object.values(requireModule.c)) {
        if(scannedModules.has(module))continue;
        scannedModules.add(module);
        for (const type of Object.values(module.exports || {})) definition(type);
      }
      walk(app._instance?.subTree || app._container?._vnode || app._vnode, new WeakSet());
      window.ReimbursementInvoiceTools?.mount();
      if(!totalsWatching||!totalsBaseline.has(controller.form))updateTotals();
      window.ReimbursementMemoryBridge?.prune();
    } catch { status.compatible = false; }
  }
  let pending;
  new MutationObserver(()=>{if(!pending&&!document.hidden)pending=setTimeout(()=>{pending=null;tick()},80)}).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('hashchange',tick);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});
  setInterval(() => { if (!document.hidden) tick(); }, 2000); tick();
})();
