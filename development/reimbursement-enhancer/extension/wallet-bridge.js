(() => {
  'use strict';
  let enabled = true, queued = false, observedList, listVm, pendingPreview, previewSequence = 0;
  const patched = new WeakSet();
  const origin = location.origin;
  function emit(phase, count = 0, operation) {
    const message = {type:'reimbursement-wallet-state', phase, count};
    if (operation != null) message.operation = operation;
    window.postMessage(message, origin);
    if (window.parent !== window) window.parent.postMessage(message, origin);
  }
  function visible(vm) { return vm?.$el?.isConnected && vm.$el.getClientRects?.().length && !vm._isDestroyed; }
  function bindPicker(vm) {
    if (patched.has(vm) || typeof vm.onSubmit !== 'function' || typeof vm.$http !== 'function' || !Array.isArray(vm.checkedValues)) return;
    patched.add(vm);
    const submit = vm.onSubmit;
    let busy = false;
    vm.onSubmit = function (...args) {
      // Vue 2 render handlers call onSubmit.apply(null, arguments).
      // Capture the component rather than depending on the handler receiver.
      if (!enabled) return submit.apply(vm, args);
      if (busy || !visible(vm) || !vm.checkedValues.length) return;
      const http = vm.$http, descriptor = Object.getOwnPropertyDescriptor(vm, '$http');
      let requested = false, failed = false;
      const observeRequest = function (...requestArgs) {
        const config = requestArgs[0];
        if (!/\/bill\/manage\/confirmSelectBills2\.json(?:\?|$)/.test(String(config?.url || ''))) return http.apply(vm, requestArgs);
        requested = true;
        const result = http.apply(vm, requestArgs);
        return Promise.resolve(result).then(response => {
          // The wallet HTTP client unwraps Axios responses before returning them.
          const success = typeof response?.success === 'boolean' ? response.success : response?.data?.success;
          emit(success === true ? 'rendering' : 'error', vm.checkedValues.length);
          setTimeout(() => { busy = false; emit('picker-idle', vm.checkedValues.length); }, 0);
          return response;
        }, error => { busy = false; emit('error', vm.checkedValues.length); throw error; });
      };
      // $http is an inherited getter without a setter in the actual Vue app.
      // Temporarily shadow it on this instance; never modify the prototype.
      // An incompatible/non-extensible instance falls back to its native method.
      try { Object.defineProperty(vm, '$http', {configurable:true, writable:true, value:observeRequest}); }
      catch { return submit.apply(vm, args); }
      busy = true; emit('confirming', vm.checkedValues.length);
      try { return submit.apply(vm, args); }
      catch (error) { failed = true; busy = false; emit('error', vm.checkedValues.length); throw error; }
      finally {
        if (descriptor) Object.defineProperty(vm, '$http', descriptor);
        else delete vm.$http;
        if (!requested && !failed) { busy = false; emit('idle', vm.checkedValues.length); }
      }
    };
    vm.$forceUpdate?.();
  }
  const resize = new ResizeObserver(() => measure());
  function measure() {
    if (!enabled || !observedList?.isConnected || !listVm || listVm._isDestroyed) return;
    // A resize of the old list is not completion of a new preview update.
    if (pendingPreview && listVm.sourceData === pendingPreview.before) return;
    const count = listVm.sourceData?.length || 0;
    if (!count) {
      window.parent.postMessage(JSON.stringify({action:'showIframe', value:false}), origin);
      if (pendingPreview) { emit('ready', 0, pendingPreview.operation); pendingPreview = null; }
      return;
    }
    const height = observedList.offsetHeight;
    if (height > 0) {
      window.parent.postMessage(JSON.stringify({action:'billHeight', value:height}), origin);
      if (pendingPreview) { emit('ready', count, pendingPreview.operation); pendingPreview = null; }
    }
  }
  function scan() {
    queued = false;
    const root = document.querySelector('#app')?.__vue__;
    const queue = root ? [root] : [], seen = new Set();
    while (queue.length) {
      const vm = queue.shift(); if (!vm || seen.has(vm)) continue; seen.add(vm);
      if (location.hash.startsWith('#/bill/listDetails') && Array.isArray(vm.sourceData)) {
        listVm = vm;
        const list = vm.$refs?.fileList;
        if (list?.nodeType === 1 && list !== observedList) { resize.disconnect(); observedList = list; resize.observe(list); }
        if (pendingPreview && vm.sourceData !== pendingPreview.before && vm.sourceData.length) window.parent.postMessage(JSON.stringify({action:'showIframe', value:true}), origin);
        measure();
      } else if (location.hash.startsWith('#/bill/list')) bindPicker(vm);
      queue.push(...(vm.$children || []));
    }
  }
  function schedule() { if (!queued) { queued = true; requestAnimationFrame(scan); } }
  window.addEventListener('message', e => {
    if (!window.ReimbursementSite.messageOrigin(e.origin,location)) return;
    if (e.source === window && e.data?.type === 'reimbursement-wallet-settings') { enabled = e.data.enabled === true; if (enabled) schedule(); return; }
    if (e.source !== window.parent || !location.hash.startsWith('#/bill/listDetails')) return;
    let data; try { data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
    if (!enabled || !['billDetails','billDetailsPost'].includes(data?.action)) return;
    pendingPreview = {before:listVm?.sourceData, operation:++previewSequence};
    emit('preview-start', Array.isArray(data.data) ? data.data.length : 0, pendingPreview.operation);
    // Run after all native message handlers and Vue's update microtasks.
    // Scanning/measurement will complete only when the source array changes.
    schedule();
  });
  window.addEventListener('hashchange', schedule);
  new MutationObserver(schedule).observe(document.documentElement, {childList:true, subtree:true});
  schedule();
})();
