(() => {
  'use strict';
  const core = window.ReimbursementInvoiceCore;
  let runtime, feeInstance, button, status, dialog, preview, undo, stopWatching;
  let syncing = false, syncQueued = false, forceSync = false, applying = false, previewPending = false, pendingOperation, applyInFlight=false;
  const detailInstances = new Set(), imported = new WeakMap();
  function nativeRoot(i) { const n = i?.subTree?.el; return n?.nodeType === 1 ? n : n?.nextElementSibling; }
  function alive(i) {
    const n = nativeRoot(i);
    return !!(i && !i.isUnmounted && !i.isDeactivated && n?.isConnected && !n.closest?.('.ant-tabs-tabpane-inactive'));
  }
  function same(a,b) { return runtime?.raw ? runtime.raw(a) === runtime.raw(b) : a === b; }
  function current() {
    const form = runtime?.form(), native = feeInstance?.setupState?.form;
    if (!runtime?.settings.enabled || !runtime.settings.totals || !location.hash.startsWith('#/reimbursementCreate') || String(form?.state) !== '2' || !core.supportsForm(form) || !alive(feeInstance) || feeInstance.setupState.isEdit?.data === false) return null;
    if (!native || native.formId !== form.formId || native.reimbursementId !== form.reimbursementId || String(native.state) !== '2') return null;
    return {form, native};
  }
  function templates() { return feeInstance?.setupState?.activityOptionList || []; }
  function snapshot(form) { return JSON.stringify([form.reimbursementId,form.formId,form.state,form.billVOList,form.activitys || [],form.totalAmount,form.totalAmountOrigin]); }
  function richBills() {
    try {
      const frame = document.querySelector('iframe.iframe-box1');
      const q = [frame?.contentDocument?.querySelector('#app')?.__vue__], seen = new Set();
      while (q.length) { const v = q.shift(); if (!v || seen.has(v)) continue; seen.add(v); if (Array.isArray(v.sourceData)) return v.sourceData; q.push(...(v.$children || [])); }
    } catch { /* An unavailable iframe leaves invoices needing review. */ }
    return [];
  }
  function richSignature(bills = richBills()) {
    // Compare fields used for identity, classification, amount and generated rows.
    // Image URLs and unrelated OCR fields must not trigger constant rerenders.
    function entry(b, depth = 0) {
      if (!b || depth > 16) return null;
      const d=b.billData || {}, data={};
      for(const key of ['invoiceCode','invoiceNO','totalAmount','totalTax','currency','currencyCode','templateGroupName','business','summary','content','itemName','feeName','feeType','chargeType','expenseType','billTitle','billTypeCode','cancel','details','processDetail','air','hotel','train','trainNO','name','seatClass','origin','dest','cfrq','dateOfArrive','dateOfDeparture','checkInDate','checkOutDate']) data[key]=d[key];
      return [core.identifiers(b),b.realityId,b.ticketCode,b.delStatus,b.ticketName,b.billTitle,b.fileName,b.fileType,b.dataType,b.totalAmount,data,(b.subBillCards || []).map(child=>entry(child,depth+1))];
    }
    return JSON.stringify(bills.map(b=>entry(b)));
  }
  function note(row) { if (row.kind === 'allowance') return '由补贴计算生成：' + row.title + '；标准：' + row.rate + '元/天；不补贴：' + row.excludedDays + '天；地区：' + row.region; return '由票据生成：' + row.title + (row.person?'；归属：'+row.person:'') + '；票据编号：' + (row.sources?.map(s=>s.barcode).join('、') || row.bill.barcode || row.bill.billData?.invoiceNO || row.identity); }
  function existing(form,row, excludeActivityId) {
    for (const a of form.activitys || []) for (const b of a.behaviors || []) for (const d of b.behaviorDetail || []) {
      if (excludeActivityId !== undefined && a.activityMetaId === excludeActivityId) continue;
      if (imported.get(form)?.get(d) === row.identity || d.BSX070110 === note(row)) return true;
      if (row.kind === 'allowance') {
        if (b.behaviorMetaName === row.category && d.BTSSX0402 === row.person && d.BTSSX0403 && d.BTSSX0404 && String(d.BTSSX0403).slice(0,10) <= row.end && String(d.BTSSX0404).slice(0,10) >= row.start) return true;
        continue;
      }
      if ([d.billBarcode,d.barcode].some(v => v && core.identifiers(row.bill).includes(String(v)))) return true;
      if ((d.BSX0709||[]).some(l=>String(l.BSX070811)!=='0'&&[l.BSX070802,l.BSX070807].some(v=>v&&core.identifiers(row.bill).includes(String(v))))) return true;
    }
    return false;
  }
  function prepare(activityId, mode = 'replace') {
    if (!['replace','append'].includes(mode)) throw Error('请选择明细更新方式');
    const c = current(); if (!c) throw Error('当前费用模板尚未就绪，请展开费用明细后重试。');
    const template = templates().find(a => a.activityMetaId === activityId) || templates()[0];
    if (!template) throw Error('未读取到费用分类模板。');
    const available = (template.behaviors || []).filter(b => b.behaviorKey !== 'summary' && !/补贴/.test(b.behaviorMetaName)).map(b => b.behaviorMetaName);
    const rich = richBills(), result = core.plan(c.form.billVOList || [], rich, available);
    for(const row of result.rows)row.bill={...row.bill,nativeAssociationMetadata:core.associations.nativeMetadata(c.form,row.bill)};
    for (const row of result.rows) if (existing(c.form,row,mode === 'replace' ? template.activityMetaId : undefined)) { row.selected = false; row.blocked = true; row.reason = '已存在对应费用明细，不重复生成'; }
    for(const row of result.rows)if(!row.blocked&&row.category){try{core.associations.source(row.bill)}catch(e){row.associationError=e.message}}
    core.autoAllocate(result.rows);
    return {...result, mode, richSignature:richSignature(rich), allowanceCategories:(template.behaviors || []).map(b=>b.behaviorMetaName), allowanceAllowed:template.activityMetaName === '常规差旅', form:c.form, native:c.native, expected:snapshot(c.form), activityId:template.activityMetaId, available};
  }
  function syncPreview(force = false) {
    if (!dialog?.open || !preview || applying || syncing) return;
    syncing = true;
    try {
      const next = prepare(preview.activityId, preview.mode), sameForm = same(next.form,preview.form);
      if (!force && sameForm && next.expected === preview.expected && next.richSignature === preview.richSignature) return;
      if (sameForm && next.activityId === preview.activityId) {
        next.allowance = preview.allowance;
        const choices = new Map(preview.rows.filter(r=>r.touched).map(r=>[r.identity,r]));
        for (const row of next.rows) {
          const old = choices.get(row.identity);
          if (!old || row.blocked || old.amountCents !== row.amountCents) continue;
          row.allocations=old.allocations?.map(a=>({...a}));row.supportIdentities=old.supportIdentities?.slice();row.allocationPeople=old.allocationPeople;
          if (!old.category || next.available.includes(old.category)) {row.category = old.category;if(row.category)row.reason='';}
          row.selected = old.selected && !!row.category; row.touched = true;
        }
      }
      next.notice = force ? '已重新读取本报销单已确认的票据。' : '票据或表单已更新，预览已重新核对。';
      preview = next; renderPreview();
    } catch (error) { tell(error.message); dialog.close(); }
    finally { syncing = false; }
  }
  function queueSync(force = false) {
    forceSync ||= force;
    if (syncQueued) return;
    syncQueued = true;
    Promise.resolve().then(()=>runtime?.nextTick?.()).then(()=>{
      syncQueued=false;const force=forceSync;forceSync=false;syncPreview(force);
    });
  }
  function fields(template) { return [...new Set((template.behaviorDetail || []).flatMap(d => (d.option?.list || []).map(c => c.option?.key).filter(Boolean)))]; }
  function keepChoices(next,old){
    const choices=new Map(old.rows.filter(r=>r.touched).map(r=>[r.identity,r]));
    for(const row of next.rows){const prior=choices.get(row.identity);if(!prior||row.amountCents!==prior.amountCents||row.blocked)continue;const category=next.available.includes(prior.category)?prior.category:null;Object.assign(row,{touched:true,category,selected:prior.selected&&!!category,allocations:prior.allocations?.map(a=>({...a})),allocationPeople:prior.allocationPeople,supportIdentities:prior.supportIdentities?.slice()})}
    next.allowance=old.allowance;return next;
  }
  function personFields(template,row,values){
    if(!row.person)return;
    const descriptors=(template.behaviorDetail||[]).flatMap(d=>d.option?.list||[]).map(c=>c.option).filter(Boolean);
    for(const d of descriptors)if(['姓名','行为人','住宿人员','住宿行为人','入住人','出差人员'].includes(d.title))values[d.key]=row.person;
    if(fields(template).includes('BSX070109'))values.BSX070109=row.person;
    if(row.category==='交通意外险'&&fields(template).includes('BTSSX0102'))values.BTSSX0102=row.person;
    if(row.category==='住宿'){
      const bills=[...(row.sources||[]).map(s=>s.bill),...(row.supportBills||[])];
      const period=core.stayPeriod(bills.map(bill=>({bill,category:'住宿',amountCents:core.amount(bill.totalAmount)||0})));
      if(period.start)for(const d of descriptors){if(['入住日期','入住时间','住宿开始日期','住宿起始日期'].includes(d.title))values[d.key]=period.start;if(['离店日期','离店时间','住宿结束日期'].includes(d.title))values[d.key]=period.end}
    }
  }
  function child(activity) { return [...detailInstances].find(i => alive(i) && same(i.props?.tableRecord,activity) && typeof i.setupState?.onAddTableList === 'function'); }
  async function apply(plan) {
    if(applyInFlight)throw Error('正在生成费用，请等待本次更新完成');
    applyInFlight=true;try{return await applyInternal(plan)}finally{applyInFlight=false}
  }
  async function applyInternal(plan) {
    const c = current();
    if (previewPending) throw Error('票据识别详情仍在更新，请稍候再生成。');
    if (!c || !same(c.form,plan.form) || snapshot(c.form) !== plan.expected || richSignature() !== plan.richSignature) throw Error('表单或票据已变化，请刷新票据后再生成。');
    if (plan.allowance?.enabled && !plan.allowanceAllowed) throw Error('当前费用活动不适用教职工普通差旅补贴');
    if (!['replace','append'].includes(plan.mode)) throw Error('请选择明细更新方式');
    const allowanceRows = core.allowances(plan.allowance,plan.allowanceCategories || []).rows;
    const expenses=core.associations.compile(plan.rows);
    const rows = [...expenses,...allowanceRows].filter(r => r.selected && !r.blocked && r.category && Number.isSafeInteger(r.amountCents));
    const categories = core.replacementCategories(rows,plan.allowance,plan.allowanceCategories);
    if (!rows.length && !(plan.mode === 'replace' && categories.length)) throw Error('请先选择分类和有效票据。');
    const reclassified=core.associations.assertRetained(c.form,plan.activityId,plan.mode,categories,expenses);
    const projected = core.projection(c.form,plan.activityId,rows,plan.mode,categories,reclassified);
    core.total(rows);
    const template = templates().find(a => a.activityMetaId === plan.activityId);
    if (!template) throw Error('费用模板已变化，请重新预览。');
    for (const row of rows) {
      const t = template.behaviors.find(b => b.behaviorMetaName === row.category);
      if (!t || !fields(t).includes('BSX070306') || existing(c.form,row,plan.mode === 'replace' ? plan.activityId : undefined)) throw Error('费用分类不兼容或票据已生成，请重新预览。');
    }
    const preparedLinks=new Map(expenses.map(row=>[row,row.links.map(l=>({...l,id:core.associations.newId(window.crypto)}))]));
    const linkIds=[...preparedLinks.values()].flat().map(l=>l.id);if(new Set(linkIds).size!==linkIds.length)throw Error('票据关联编号重复，已取消生成');
    if (c.native.activitys?.length && !same(c.native.activitys,c.form.activitys)) throw Error('费用明细状态不同步，请重新进入此表单后再生成。');
    const restorers = [], captured = new WeakMap();
    function capture(obj,key) {
      let keys = captured.get(obj); if (!keys) { keys = new Set(); captured.set(obj,keys); } if (keys.has(key)) return; keys.add(key);
      const present = Object.hasOwn(obj,key), old = obj[key], items = Array.isArray(old) ? old.slice() : null;
      restorers.push(() => { if (items) old.splice(0,old.length,...items); if (present) obj[key] = old; else delete obj[key]; });
    }
    const rollback = () => { for (const restore of restorers.slice().reverse()) restore(); runtime.refresh(); };
    for (const f of new Set([c.form,c.native])) for (const k of ['activitys','totalAmount','totalAmountOrigin']) capture(f,k);
    for (const a of c.form.activitys || []) { capture(a,'behaviors'); for (const k of new Set(['ASX060301','ASX060401',...Object.keys(a).filter(k => /^ASX06/.test(k))])) capture(a,k); for (const b of a.behaviors || []) { capture(b,'behaviorDetail'); for (const k of new Set(['BSX060203','BSX060206',...Object.keys(b).filter(k => /^BSX06/.test(k))])) capture(b,k); } }
    const expectedBills = JSON.stringify(c.form.billVOList);
    const active = () => { const now = current(); return !previewPending && now && same(now.form,c.form) && same(now.native,c.native) && JSON.stringify(c.form.billVOList) === expectedBills && richSignature() === plan.richSignature; };
    const created=[];
    try {
      if (c.form.activitys) c.native.activitys = c.form.activitys;
      let activity = c.form.activitys?.find(a => a.activityMetaId === plan.activityId);
      if (!activity) {
        const clean = JSON.parse(JSON.stringify(template));
        for (const b of clean.behaviors || []) b.behaviorDetail = [];
        feeInstance.setupState.onAddTableList(clean);
        if (!Array.isArray(c.native.activitys)) throw Error('原系统未初始化费用活动。');
        c.form.activitys = c.native.activitys;
        activity = c.form.activitys.find(a => a.activityMetaId === plan.activityId);
      }
      await runtime.nextTick(); runtime.refresh();
      if (!active() || !activity) throw Error('表单已切换，生成已取消。');
      const target = child(activity); if (!target || target.setupState.isEdit?.data === false) throw Error('原系统费用行尚未就绪，请展开费用明细后重试。');
      for(const move of reclassified){
        const index=move.behavior.behaviorDetail.indexOf(move.record);
        if(index<0)throw Error('跨分类原费用行已变化，生成已取消');
        capture(move.behavior,'behaviorDetail');move.behavior.behaviorDetail.splice(index,1);
      }
      capture(activity,'behaviors');
      if (!imported.has(c.form)) imported.set(c.form,new WeakMap());
      if (plan.mode === 'replace') for (const behavior of activity.behaviors || []) {
        if (!categories.includes(behavior.behaviorMetaName) || behavior.behaviorKey === 'summary') continue;
        capture(behavior,'behaviorDetail');
        if (!Array.isArray(behavior.behaviorDetail)) throw Error('原系统费用分类未就绪');
        behavior.behaviorDetail.splice(0,behavior.behaviorDetail.length);
      }
      for (const row of rows) {
        let behavior = activity.behaviors.find(b => b.behaviorMetaName === row.category);
        if (!behavior) {
          const copy = JSON.parse(JSON.stringify(template.behaviors.find(b => b.behaviorMetaName === row.category))); copy.behaviorDetail = [];
          target.setupState.onAddBehaviorList(copy);
          behavior = activity.behaviors.find(b => b.behaviorMetaName === row.category);
        }
        if (!behavior) throw Error('原系统未添加费用分类。');
        capture(behavior,'behaviorDetail');
        const before = behavior.behaviorDetail?.length || 0;
        target.setupState.onAddTableList(behavior);
        if (behavior.behaviorDetail?.length !== before + 1) throw Error('原系统未初始化费用行。');
        const record = behavior.behaviorDetail[before];
        if(!record.id)record.id=core.associations.newId(window.crypto);
        const rowTemplate=template.behaviors.find(b=>b.behaviorMetaName===row.category);
        const values = core.rowValues(row,fields(rowTemplate));personFields(rowTemplate,row,values);
        if(row.person&&record.BSX070108&&record.BSX070109!==row.person&&fields(rowTemplate).includes('BSX070108'))values.BSX070108='';
        if (Object.hasOwn(values,'BSX070110')) values.BSX070110 = note(row);
        if(row.kind==='invoice')values.BSX0709=preparedLinks.get(row);
        Object.assign(record,values); imported.get(c.form).set(record,row.identity);
        if(row.kind==='invoice'){const expected={...row,links:preparedLinks.get(row),recordId:record.id};core.associations.assertRecord(record,expected);created.push({record,row:expected})}
      }
      runtime.compute(c.form);
      await runtime.nextTick();
      if (!active()) throw Error('表单已切换，生成已取消。');
      for(const {record,row}of created){if(!c.form.activitys?.some(a=>a.behaviors?.some(b=>b.behaviorDetail?.some(r=>same(r,record)))))throw Error('原费用行已变化，生成已取消');core.associations.assertRecord(record,row)}
      if (core.amount(c.form.totalAmount) !== projected.amount) throw Error('原系统合计与预览不一致，已取消更新');
      const after = snapshot(c.form);
      undo = {form:c.form, expected:after, rollback};
      return {count:rows.length, amount:core.total(rows), total:projected.amount};
    } catch (error) { rollback(); throw error; }
  }
  function el(tag,text) { const n = document.createElement(tag); if (text != null) n.textContent = text; return n; }
  function tell(text) { if (status) status.textContent = text; }
  function renderPreview() {
    if (!dialog) {
      dialog = el('dialog'); dialog.className = 're-invoice-dialog'; dialog.setAttribute('aria-label','生成费用明细'); document.body.append(dialog);
    }
    dialog.replaceChildren();
    const head=el('div');head.className='re-invoice-heading';
    head.append(el('h2','生成费用明细'));
    const close=el('button','×');close.type='button';close.className='re-invoice-close';close.setAttribute('aria-label','关闭费用预览');close.addEventListener('click',()=>dialog.close());head.append(close);
    const toolbar=el('div');toolbar.className='re-invoice-toolbar';
    const activitySelect=el('select');activitySelect.setAttribute('aria-label','费用活动');
    for(const t of templates()){const o=el('option',t.activityMetaName);o.value=t.activityMetaId;activitySelect.append(o)}activitySelect.value=preview.activityId;
    activitySelect.addEventListener('change',()=>{try{preview=prepare(activitySelect.value,preview.mode);renderPreview()}catch(e){tell(e.message);dialog.close()}});
    const mode=el('select');mode.setAttribute('aria-label','明细更新方式');
    for(const [value,label] of [['replace','更新所选分类'],['append','仅追加明细']]){const o=el('option',label);o.value=value;mode.append(o)}mode.value=preview.mode;
    mode.addEventListener('change',()=>{try{preview=keepChoices(prepare(preview.activityId,mode.value),preview);renderPreview()}catch(e){tell(e.message);dialog.close()}});
    const reload=el('button','刷新票据');reload.type='button';reload.className='re-invoice-refresh';reload.addEventListener('click',()=>queueSync(true));toolbar.append(activitySelect,mode,reload);
    const metrics=el('div');metrics.className='re-invoice-metrics';
    function metric(label,primary=false){const box=el('div');box.className='re-invoice-metric'+(primary?' re-invoice-metric--primary':'');const value=el('strong');box.append(el('span',label),value);metrics.append(box);return value}
    const invoiceMetric=metric('所选发票'),allowanceMetric=metric('差旅补贴'),totalMetric=metric('更新后总额',true);
    const summary=el('div');summary.className='re-invoice-summary';summary.setAttribute('role','status');
    const updateStatus=el('div');updateStatus.className='re-invoice-update-status';updateStatus.setAttribute('role','status');
    updateStatus.hidden=!previewPending&&!preview.notice;updateStatus.textContent=previewPending?'正在更新票据…':preview.notice || '';
    const body=el('div');body.className='re-invoice-body';
    const list=el('div');list.className='re-invoice-list';const columns=el('div');columns.className='re-invoice-columns';columns.append(el('span','票据'),el('span','分类'),el('span','金额'));list.append(columns);
    const excluded=el('details');excluded.className='re-invoice-excluded';const excludedList=el('div');excludedList.className='re-invoice-list';
    const excludedCount=preview.rows.filter(r=>r.blocked).length;excluded.append(el('summary','未计入 '+excludedCount+' 张'),excludedList);excluded.hidden=!excludedCount;
    const allowanceBox=el('section');allowanceBox.className='re-allowance-box';
    const saved=preview.allowance || {},stay=core.stayPeriod(preview.rows);
    if(!saved.startManual)saved.start=stay.start;if(!saved.endManual)saved.end=stay.end;preview.allowance=saved;
    const includeLabel=el('label'),include=el('input');include.type='checkbox';include.checked=!!saved.enabled;include.disabled=!preview.allowanceAllowed;include.setAttribute('aria-label','计算差旅补贴');includeLabel.append(include,el('span','差旅补贴'));allowanceBox.append(includeLabel);
    const controls=el('div');controls.className='re-allowance-controls';
    function field(label,type,value){const l=el('label',label),n=el('input');n.type=type;n.value=value;n.setAttribute('aria-label',label);if(type==='number'){n.min='0';n.step='1'}l.append(n);controls.append(l);return n}
    const startDate=field('出差开始日期','date',saved.start || ''),endDate=field('出差结束日期','date',saved.end || ''),people=field('出差人员姓名（多人用逗号分隔）','text',saved.people || '');
    for(const [input,key] of [[startDate,'startManual'],[endDate,'endManual']])for(const event of ['input','change'])input.addEventListener(event,()=>{preview.allowance[key]=true});
    const regionLabel=el('label','出差地区'),region=el('select');region.setAttribute('aria-label','出差地区');
    for(const [value,label] of [['outside','省外普通地区'],['hubei','湖北省内（武汉以外）'],['special','青海、西藏、新疆'],['wuhan','武汉市内']]){const o=el('option',label);o.value=value;region.append(o)}region.value=saved.region || 'outside';regionLabel.append(region);controls.append(regionLabel);
    controls.append(el('p','这里的出差地区仅用于补贴估算，不能代替原生补贴地。生成后请逐行选择补贴地，等待标准、补贴天数计算，再用“填报助手 → 状态与预检”核对。'));
    const mealExcluded=field('不发餐补天数','number',saved.mealExcluded ?? '0'),transportExcluded=field('不发交通补贴天数','number',saved.transportExcluded ?? '0');
    const dateHint=el('div',stay.start?stay.sources.join('、')+' · '+stay.start+' 至 '+stay.end:stay.reason || '未识别到入住、离店日期，请填写');dateHint.className='re-allowance-date-hint';
    const useDates=el('button','使用住宿日期');useDates.type='button';useDates.hidden=!stay.start;useDates.addEventListener('click',()=>{startDate.value=stay.start;endDate.value=stay.end;preview.allowance.startManual=false;preview.allowance.endManual=false;refresh()});dateHint.append(useDates);
    const confirmLabel=el('label'),confirmed=el('input');confirmed.type='checkbox';confirmed.checked=!!saved.confirmed;confirmed.setAttribute('aria-label','已核对补贴适用条件');confirmLabel.append(confirmed,el('span','已核对补贴适用条件'));
    const rules=el('details');rules.className='re-invoice-rules';rules.append(el('summary','计算规则'));
    rules.append(el('p','更新所选分类会替换该活动内这些分类的全部明细，包括手填行；其他分类及活动保留。仅追加模式需自行核对手填费用，避免重复。发票夹只上传未确认的票据不会加入本单。支付截图、流水单和其他辅助材料不计入发票金额。'));
    rules.append(el('p','补贴按自然日含首尾计算。住宿日期仅预填，须核对实际出差起止日期、人员及审批；学生和校外受邀人员不直接套用。统一用餐天数不发餐补；会议培训期间不发交通补贴，统一食宿时也不发餐补；自驾或租车不再发交通补贴。不同地区请分段计算。'));
    const source=el('a','查看学校差旅费办法');source.href=core.policyUrl;source.target='_blank';source.rel='noopener';rules.append(source);
    const extra=el('div');extra.className='re-allowance-extra';extra.append(dateHint,confirmLabel);allowanceBox.append(controls,extra);
    const footer=el('div');footer.className='re-invoice-dialog-actions';const cancel=el('button','取消');cancel.type='button';cancel.addEventListener('click',()=>dialog.close());
    const applyButton=el('button',preview.mode==='replace'?'更新费用明细':'追加费用明细');applyButton.type='button';applyButton.className='re-invoice-apply';
    function refresh(){
      preview.allowance={...preview.allowance,enabled:include.checked,confirmed:confirmed.checked,start:startDate.value,end:endDate.value,people:people.value,region:region.value,mealExcluded:mealExcluded.value,transportExcluded:transportExcluded.value};
      controls.hidden=extra.hidden=!include.checked;
      let allowance={rows:[],amount:0},error='',projected;
      const selected=preview.rows.filter(r=>r.selected&&!r.blocked&&r.category);
      try{
        allowance=core.allowances(preview.allowance,preview.allowanceCategories);
        if(preview.mode==='append')for(const row of allowance.rows)if(existing(preview.form,row))throw Error('已有同人同期补贴，请使用更新模式');
        const expenses=core.associations.compile(preview.rows);
        const rows=[...expenses,...allowance.rows],names=core.replacementCategories(rows,preview.allowance,preview.allowanceCategories);
        const reclassified=core.associations.assertRetained(preview.form,preview.activityId,preview.mode,names,expenses);
        projected=core.projection(preview.form,preview.activityId,rows,preview.mode,names,reclassified);
        projected.migrations=reclassified.map(m=>m.fromCategory+' → '+m.toCategories.join('、'));
        projected.count=rows.length;
      }catch(e){error=e.message}
      const money=n=>'¥'+(n/100).toFixed(2);invoiceMetric.textContent=money(core.total(preview.rows));allowanceMetric.textContent=money(allowance.amount);totalMetric.textContent=projected?money(projected.amount):'待核对';
      const pending=preview.rows.filter(r=>!r.blocked&&!r.category).length;
      summary.textContent=error || (preview.mode==='replace'?'更新 '+(projected?.count||0)+' 条明细 · '+(projected?.categories.join('、') || '未选择分类'):'追加 '+(projected?.count||0)+' 条明细')+(projected?.migrations?.length?' · 迁移 '+projected.migrations.length+' 条原关联明细（'+[...new Set(projected.migrations)].join('、')+'）':'')+(projected?.retained?' · 其他费用保留 '+money(projected.retained):'')+(pending?' · '+pending+' 张待分类':'');
      summary.dataset.error=String(!!error);
      applyButton.disabled=previewPending||!!error||!(selected.length+allowance.rows.length||(preview.mode==='replace'&&projected?.categories.length));
    }
    for(const input of [include,startDate,endDate,people,region,mealExcluded,transportExcluded,confirmed]){input.addEventListener('input',refresh);input.addEventListener('change',refresh)}
    for(const row of preview.rows){
      const item=el('div');item.className='re-invoice-row';
      const check=el('input');check.type='checkbox';check.checked=row.selected;check.disabled=row.blocked;check.setAttribute('aria-label','生成费用：'+row.title);
      const title=el('div',row.title);const suffix=String(row.bill.billData?.invoiceNO||row.bill.barcode||'').slice(-4);if(suffix)title.append(el('small','票号末四位 '+suffix));const issue=el('small',row.reason||row.associationError||'');title.append(issue);
      const select=el('select');select.setAttribute('aria-label','费用分类：'+row.title);select.disabled=row.blocked;const blank=el('option','选择分类');blank.value='';select.append(blank);
      for(const name of preview.available){const o=el('option',name);o.value=name;select.append(o)}select.value=row.category || '';
      let allocations;
      check.addEventListener('change',()=>{row.touched=true;row.selected=check.checked;if(allocations)allocations.hidden=!row.selected;refresh()});select.addEventListener('change',()=>{row.touched=true;row.category=select.value || null;row.reason=row.category?'':core.classify(row.bill,preview.available).reason||'请选择费用分类';issue.textContent=row.reason||row.associationError||'';row.selected=!!row.category;check.checked=row.selected;if(allocations){allocations.hidden=!row.selected;allocations.dataset.category=row.category}refresh()});
      const value=el('span',row.amountCents==null?'待核对':'¥'+(row.amountCents/100).toFixed(2));value.className='re-invoice-amount';
      item.append(check,title,select,value);(row.blocked?excludedList:list).append(item);
      if(!row.blocked){allocations=allocationEditor(row,preview.rows,refresh);allocations.hidden=!row.selected;list.append(allocations)}
    }
    if(!preview.rows.length)list.append(el('p','先从发票夹添加票据'));
    applyButton.addEventListener('click',async()=>{
      const locked=[...dialog.querySelectorAll('input,select,button')].filter(n=>!n.disabled);for(const n of locked)n.disabled=true;
      applying=true;applyButton.disabled=cancel.disabled=close.disabled=reload.disabled=mode.disabled=activitySelect.disabled=true;applyButton.textContent='正在更新…';
      let failure;
      try{const result=await apply(preview);dialog.close();tell('已更新 '+result.count+' 条明细，报销总额 ¥'+(result.total/100).toFixed(2));mount()}
      catch(e){failure=e.message;applyButton.textContent=preview.mode==='replace'?'更新费用明细':'追加费用明细'}
      finally{for(const n of locked)n.disabled=false;applying=false;cancel.disabled=close.disabled=reload.disabled=mode.disabled=activitySelect.disabled=false;refresh();if(failure){summary.textContent=failure;summary.dataset.error='true'}queueSync()}
    });
    footer.append(cancel,applyButton);body.append(allowanceBox,list,excluded,rules);dialog.append(head,toolbar,metrics,updateStatus,body,summary,footer);refresh();if(!dialog.open)dialog.showModal();
  }
  function allocationEditor(row,allRows,refresh){
    const box=el('details');box.className='re-invoice-allocation';box.dataset.category=row.category;box.open=['住宿','交通意外险'].includes(row.category);box.append(el('summary','人员与分摊'));
    const line=el('div');line.className='re-invoice-allocation-tools';
    const label=el('label','归属人员'),names=el('input');names.type='text';names.placeholder='多人用逗号分隔';names.setAttribute('aria-label','归属人员：'+row.title);names.value=row.allocationPeople??row.allocations?.map(a=>a.person).join('，')??row.bill.billData?.name??'';label.append(names);
    const split=el('button','按人均分');split.type='button';split.setAttribute('aria-label','按人均分：'+row.title);line.append(label,split);box.append(line);
    if(row.bill.billData?.summary)box.append(el('small',String(row.bill.billData.summary).slice(0,180)));
    const grid=el('div');grid.className='re-invoice-allocation-grid';box.append(grid);
    function draw(){grid.replaceChildren();for(const [i,a]of (row.allocations||[]).entries()){
      const name=el('label',a.person),money=el('input');money.type='text';money.inputMode='decimal';money.value=(a.amountCents/100).toFixed(2);money.setAttribute('aria-label','分摊金额：'+row.title+'：'+a.person);name.append(money);grid.append(name);
      money.addEventListener('input',()=>{row.touched=true;row.allocations[i].amountCents=core.amount(money.value);refresh()});
    }}
    names.addEventListener('input',()=>{
      row.touched=true;row.allocationPeople=names.value;
      let samePeople=false;
      try{const people=core.associations.people(names.value);samePeople=!!row.allocations?.length&&people.length===row.allocations.length&&people.every((name,i)=>name===row.allocations[i].person);if(!samePeople&&people.length===1){row.allocations=core.associations.evenSplit(row.amountCents,people);samePeople=true;draw()}}catch{ /* Multiple or incomplete names require an explicit split. */ }
      if(!samePeople){row.allocations=[];draw()}
      refresh();
    });
    split.addEventListener('click',()=>{row.touched=true;row.allocationPeople=names.value;try{row.allocations=core.associations.evenSplit(row.amountCents,names.value);draw();refresh()}catch(e){row.allocations=[];draw();refresh();tell(e.message)}});draw();
    const supporting=allRows.filter(core.associations.supporting);
    if(supporting.length){const evidence=el('details');evidence.className='re-invoice-supports';evidence.append(el('summary','住宿凭证（不计金额）'));for(const s of supporting){const l=el('label'),n=el('input');n.type='checkbox';n.checked=!!row.supportIdentities?.includes(s.identity);n.setAttribute('aria-label','关联住宿凭证：'+row.title+'：'+s.title);l.append(n,el('span',s.title+' · '+String(s.bill.barcode||'').slice(-4)));evidence.append(l);n.addEventListener('change',()=>{row.touched=true;const chosen=new Set(row.supportIdentities||[]);if(n.checked)chosen.add(s.identity);else chosen.delete(s.identity);row.supportIdentities=[...chosen];refresh()})}box.append(evidence)}
    return box;
  }
  function mount() {
    syncPreview();
    const anchor = [...document.querySelectorAll('.reimbursementCreate button.fileFold')].find(n => n.isConnected && !n.closest('.ant-tabs-tabpane-inactive'));
    if (!anchor) { if (button) button.hidden = true; return; }
    if (!button?.isConnected) {
      const bar = el('span'); bar.className = 're-invoice-tools';
      button = el('button','从票据生成明细'); button.type = 'button'; button.className = 'ant-btn';
      button.addEventListener('click',() => { try { preview = prepare(); renderPreview(); } catch(e) { tell(e.message); } });
      const revert = el('button','撤销本次生成'); revert.type = 'button'; revert.className = 're-invoice-undo';
      revert.addEventListener('click',() => {
        const c = current(); if (!undo || !c || !same(c.form,undo.form) || snapshot(c.form) !== undo.expected) { tell('明细已修改，不能整体撤销；请在费用明细中调整。'); return; }
        undo.rollback(); undo = null; revert.hidden = true; tell('已撤销本次生成。');
      });
      status = el('span'); status.className = 're-invoice-inline-status'; status.setAttribute('role','status');
      bar.append(button,revert,status); anchor.after(bar);
    }
    const c = current(); button.hidden = !runtime?.settings.enabled || !runtime.settings.totals;
    button.disabled = !c;
    button.title = c ? '预览费用、归属人员及原生票据关联，不触发 AI 或提交' : '仅支持可编辑的差旅费、参加会议报销单；请展开费用明细后重试';
    const revert = button.parentNode.querySelector('.re-invoice-undo'); if (revert) revert.hidden = !undo || !c || !same(undo.form,c.form);
  }
  window.ReimbursementInvoiceTools = {
    bind(r) {
      stopWatching?.();runtime = r;
      stopWatching=r.watch?.(()=>JSON.stringify([r.form()?.reimbursementId,r.form()?.formId,r.form()?.billVOList]),()=>queueSync(),{flush:'post'});
    },
    register(i) {
      if (!alive(i)) return;
      if (i.props?.componentInfo?.key === 'activitys' && typeof i.setupState?.onAddTableList === 'function' && i.setupState.form?.formId && Array.isArray(i.setupState.activityOptionList)) feeInstance = i;
      if (i.props?.tableRecord?.behaviors && typeof i.setupState?.onAddBehaviorList === 'function') detailInstances.add(i);
    },
    mount() { for (const i of detailInstances) if (!alive(i)) detailInstances.delete(i); mount(); },
    prepare, apply, readBills:richBills
  };
  window.addEventListener?.('message', event=>{
    if(!window.ReimbursementSite.messageOrigin(event.origin,location))return;
    const picker=document.querySelector('iframe.iframe-box'),details=document.querySelector('iframe.iframe-box1');
    const fromPicker=!!picker&&event.source===picker.contentWindow,fromDetails=!!details&&event.source===details.contentWindow;
    if(!fromPicker&&!fromDetails)return;
    let data;try{data=typeof event.data==='string'?JSON.parse(event.data):event.data}catch{return}
    if(data?.type==='reimbursement-wallet-state') {
      if(fromDetails&&data.phase==='preview-start'){previewPending=true;pendingOperation=data.operation;queueSync(true)}
      if(fromDetails&&data.phase==='ready'&&pendingOperation!=null&&data.operation===pendingOperation){previewPending=false;pendingOperation=undefined;queueSync(true)}
    }
    if(fromPicker&&data?.action==='bill')queueSync();
  });
  window.addEventListener?.('hashchange',()=>{previewPending=false;pendingOperation=undefined;queueSync()});
})();
