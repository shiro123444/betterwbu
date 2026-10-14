(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./core.js') : root.ReimbursementEnhancerCore,
    typeof module === 'object' && module.exports ? require('./invoice-associations.js') : root.ReimbursementInvoiceAssociations);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ReimbursementInvoiceCore = api;
})(typeof window === 'object' ? window : {}, function (money, associations) {
  'use strict';
  const categories = ['城市间交通费','住宿','过路过桥','改签、退票费','交通意外险','燃油费','车辆租赁'];
  function identifiers(bill) { return ['barcode','dataId','id'].map(k => bill?.[k]).filter(v => v != null && String(v).trim()).map(String); }
  function identity(bill) {
    const d = bill.billData || {};
    if (d.invoiceNO && String(d.invoiceNO).trim()) return 'invoice:' + String(d.invoiceCode || '') + ':' + String(d.invoiceNO);
    return identifiers(bill)[0] ? 'bill:' + identifiers(bill)[0] : null;
  }
  function amount(value) { if (value == null || String(value).trim() === '') return null; try { return money.cents(String(value).replace(/[−－]/g,'-')); } catch { return null; } }
  function classify(bill, available) {
    const d = bill.billData || {}, names = new Set();
    const text = [bill.ticketName || d.billTitle || bill.billTitle, d.templateGroupName, d.business, ...(d.details || []).map(x => x.content)].filter(v => typeof v === 'string').join(' ');
    // Product names such as "国内机票航空意外险" describe insurance, not a flight fare.
    // Keep unrelated fare lines and an actual ticket title available for mixed invoices.
    const transportText = text.replace(/(?:国内)?机票航空意外险|航空(?:旅客)?意外险|交通意外险|交通保险/g, '');
    if (d.trainNO || /铁路|火车|高铁|动车|航空|机票|飞机|长途客运/.test(transportText)) names.add('城市间交通费');
    if (d.hotel?.length || /住宿|酒店|宾馆|房费/.test(text)) names.add('住宿');
    if (/改签|退票费/.test(text)) { names.delete('城市间交通费'); names.add('改签、退票费'); }
    if (/通行费|过路|过桥/.test(text)) names.add('过路过桥');
    if (/意外险|交通保险/.test(text)) names.add('交通意外险');
    if (/汽油|柴油|燃油|加油/.test(text)) names.add('燃油费');
    if (/车辆租赁|汽车租赁|租车费/.test(text)) names.add('车辆租赁');
    if (names.size !== 1) return {category:null, reason:names.size ? '同一票据涉及多个分类，请核对拆分' : '请确认费用分类'};
    const name = [...names][0];
    return available.includes(name) ? {category:name, reason:''} : {category:null, reason:'当前模板没有对应分类：' + name};
  }
  function plan(selected, rich, available) {
    const index = new Map(), richSeen = new Set();
    function indexBills(list, depth = 0) { if (depth > 16) return; for (const b of list || []) { if (!b || typeof b !== 'object' || richSeen.has(b)) continue; richSeen.add(b); for (const id of identifiers(b)) index.set(id,b); indexBills(b.subBillCards,depth+1); } }
    indexBills(rich);
    const rows = [], seenObjects = new Set(), seenIds = new Set(); let duplicateCount = 0, containerCount = 0;
    function visit(list, depth = 0) {
      if (depth > 16) return;
      for (const selectedBill of list || []) {
        if (!selectedBill || typeof selectedBill !== 'object') continue;
        if (seenObjects.has(selectedBill)) { duplicateCount++; continue; } seenObjects.add(selectedBill);
        const detail = identifiers(selectedBill).map(id => index.get(id)).find(Boolean);
        const bill = {...selectedBill, ...(detail || {}), totalAmount:selectedBill.totalAmount ?? detail?.totalAmount};
        const children = selectedBill.subBillCards?.length ? selectedBill.subBillCards : bill.subBillCards;
        if (children?.length) { containerCount++; visit(children,depth+1); continue; }
        const key = identity(bill), cents = amount(bill.totalAmount ?? bill.billData?.totalAmount);
        if (key && seenIds.has(key)) { duplicateCount++; continue; } if (key) seenIds.add(key);
        const label = String(bill.ticketName || bill.billData?.billTitle || bill.billTitle || bill.billData?.templateGroupName || '');
        const supporting = /情况说明|通知|申请表|合同|流水单|截图/.test(label) || String(bill.fileType) === '1';
        const container = String(bill.dataType) === '5';
        const currency = bill.billData?.currency || bill.billData?.currencyCode;
        const foreign = currency && !['CNY','RMB','人民币','元','156'].includes(String(currency));
        const classified = classify(bill,available);
        const recognized = /发票|客票|行程单|通行费|收费票据|财政票据/.test(label) && !/截图/.test(label);
        const detailPending=!!(!supporting&&recognized&&!bill.billData);
        const blocked = !!(supporting || container || !key || foreign || cents == null || cents <= 0 || !recognized || detailPending);
        let reason = supporting ? '辅助材料，不计入费用' : container ? '票夹明细尚未展开，请重新加载票据' : !key ? '缺少票据标识，无法防止重复导入' : foreign ? '外币票据需要确认汇率和本币金额' : cents == null ? '没有有效金额，请核对票据识别结果' : cents === 0 ? '金额为零，不生成费用' : cents < 0 ? '红字或退款票据需单独核对，不纳入本次发票合计' : !recognized ? '未识别为发票或客票，不计入费用' : detailPending ? '票据识别详情尚未加载，请刷新票据' : classified.reason;
        rows.push({identity:key, title:String(bill.billTitle || bill.ticketName || bill.fileName || '未命名票据'), amountCents:cents, category:classified.category, reason, detailPending, blocked, countable:!blocked, selected:!blocked && recognized && !!classified.category && !classified.reason, bill});
      }
    }
    visit(selected);
    return {rows, duplicateCount, containerCount};
  }
  function total(rows) {
    let result = 0;
    for (const row of rows) if (row.selected && !row.blocked && row.category && Number.isSafeInteger(row.amountCents)) {
      result += row.amountCents;
      if (!Number.isSafeInteger(result)) throw Error('金额超出可处理范围');
    }
    return result;
  }
  function replacementCategories(rows, allowance, available = []) {
    const names = new Set(rows.filter(r=>r.selected&&!r.blocked&&r.category).map(r=>r.category));
    if (allowance?.enabled) for (const name of ['用餐补贴','市内交通补贴']) if (available.includes(name)) names.add(name);
    return [...names];
  }
  function projection(form, activityId, rows, mode = 'replace', replaceNames = replacementCategories(rows)) {
    const before = money.travelPlan({...form,activitys:form.activitys || []});
    if (!before) throw Error('费用明细无法合计，请核对当前模板');
    let retained = 0, replaced = 0;
    for (const a of form.activitys || []) for (const b of a.behaviors || []) {
      if (b.behaviorKey === 'summary' || b.behaviorMetaName === '总览') continue;
      const n = money.sum(b.behaviorDetail.map(d=>({amount:d.BSX070306 ?? d.BSX070304 ?? 0})),'amount');
      if (mode === 'replace' && a.activityMetaId === activityId && replaceNames.includes(b.behaviorMetaName)) replaced += n;
      else retained += n;
      if (!Number.isSafeInteger(retained) || !Number.isSafeInteger(replaced)) throw Error('金额超出可处理范围');
    }
    const amount = retained + total(rows);
    if (!Number.isSafeInteger(amount)) throw Error('金额超出可处理范围');
    return {amount,retained,replaced,categories:replaceNames};
  }
  function balance(rows) {
    let positive = 0, negative = 0, positiveCount = 0, negativeCount = 0;
    for (const row of rows) if (row.countable && Number.isSafeInteger(row.amountCents)) {
      if (row.amountCents > 0) { positive += row.amountCents; positiveCount++; }
      if (row.amountCents < 0) { negative += row.amountCents; negativeCount++; }
      if (!Number.isSafeInteger(positive) || !Number.isSafeInteger(negative)) throw Error('金额超出可处理范围');
    }
    const net = positive + negative; if (!Number.isSafeInteger(net)) throw Error('金额超出可处理范围');
    return {positive,negative,net,positiveCount,negativeCount};
  }
  function rowValues(row, allowed) {
    const d = row.bill?.billData || {}, value = row.amountCents / 100, tax = row.kind==='invoice' ? row.taxCents : amount(d.totalTax);
    const values = {BSX070203:value, BSX070207:value, BSX070303:value, BSX070306:value, BSX070110:'由票据生成：' + row.title};
    if (tax != null && tax >= 0 && tax <= row.amountCents) {
      for (const key of ['BSX070202','BSX070206','BSX070302','BSX070305']) values[key] = tax / 100;
      for (const key of ['BSX070201','BSX070204','BSX070301','BSX070304']) values[key] = (row.amountCents - tax) / 100;
    }
    if (row.kind === 'allowance') Object.assign(values, {BTSSX0402:row.person, BTSSX0403:row.start, BTSSX0404:row.end, BTSSX0409:row.days, BSX071301:row.rate, BTSSX0412:row.excludedDays * row.rate, BSX070301:value, BSX070304:value, BSX070302:0, BSX070305:0});
    if (row.category === '城市间交通费') {
      for (const [target,source] of Object.entries({BTSSX0102:'name',BTSSX0111:'trainNO',BTSSX0112:'seatClass',BTSSX0113:'origin',BTSSX0118:'dest'})) if (typeof d[source] === 'string' && d[source]) values[target] = d[source];
      const date = String(d.cfrq || '');
      if (/^\d{4}-\d{2}-\d{2}(?:\s|$)/.test(date)) values.BTSSX0104 = date.slice(0,10);
    }
    return Object.fromEntries(Object.entries(values).filter(([key]) => allowed.includes(key)));
  }
  // School published travel policy, articles 15-19, 22, 25, 29-30.
  const policyUrl = 'https://xxgk.wbu.edu.cn/_upload/article/files/36/95/91d1871040bf94afee9641be1f23/5e292a72-dce7-4ed4-a30f-05d95c266772.pdf';
  function stayPeriod(rows) {
    const periods=[],sources=new Set();let incomplete=false;
    function date(value) {
      const text=String(value || '').trim(),match=text.match(/^(\d{4})[-/年]?(\d{2})[-/月]?(\d{2})(?:日|\s|T|$)/);
      if(!match)return null;
      const result=match.slice(1).join('-');try{calendarDay(result);return result}catch{return null}
    }
    for(const row of rows || []) {
      const b=row.bill || {},d=b.billData || {},label=[b.ticketName,b.billTitle,d.templateGroupName].filter(Boolean).join(' ');
      const statement=/酒店住宿流水单|住宿清单/.test(label);
      if(row.amountCents<=0 || (!statement && (row.blocked || row.category!=='住宿')) || /截图/.test(label))continue;
      for(const record of [d,...(Array.isArray(d.hotel)?d.hotel:[])]) for(const [a,z] of [['dateOfArrive','dateOfDeparture'],['checkInDate','checkOutDate']]) {
        if(!record[a]&&!record[z])continue;
        const start=date(record[a]),end=date(record[z]);
        if(!start||!end||calendarDay(end)<calendarDay(start)){incomplete=true;continue}
        periods.push({start,end});sources.add(statement?'住宿流水单':'住宿发票');
      }
    }
    if(!periods.length)return {start:'',end:'',sources:[],reason:incomplete?'住宿日期不完整，请手动填写':''};
    periods.sort((a,b)=>a.start.localeCompare(b.start));let end=periods[0].end;
    for(const p of periods.slice(1)) {
      if(calendarDay(p.start)>calendarDay(end)+1)return {start:'',end:'',sources:[...sources],reason:'有多个不连续住宿区间，请手动填写'};
      if(p.end>end)end=p.end;
    }
    if(incomplete)return {start:'',end:'',sources:[...sources],reason:'部分住宿日期不完整，请手动填写'};
    return {start:periods[0].start,end,sources:[...sources],reason:''};
  }
  function calendarDay(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw Error('请填写完整出差日期');
    const n = Date.parse(date + 'T00:00:00Z');
    if (!Number.isFinite(n) || new Date(n).toISOString().slice(0,10) !== date) throw Error('出差日期无效');
    return n / 86400000;
  }
  function allowances(input, available) {
    if (!input?.enabled) return {rows:[], amount:0};
    if (!input.confirmed) throw Error('请先核对补贴适用条件');
    const rates = {hubei:[100,50], outside:[100,80], special:[120,80], wuhan:[0,0]};
    if (!rates[input.region]) throw Error('请选择出差地区');
    const days = calendarDay(input.end) - calendarDay(input.start) + 1;
    if (!Number.isSafeInteger(days) || days < 1) throw Error('结束日期不能早于开始日期');
    const people = String(input.people || '').split(/[，,、;；\n]+/).map(n=>n.trim()).filter(Boolean);
    if (!people.length || new Set(people).size !== people.length) throw Error('请填写出差人员姓名，不能重复');
    const exclusions = [Number(input.mealExcluded ?? 0),Number(input.transportExcluded ?? 0)];
    if (!exclusions.every(n=>Number.isInteger(n)&&n>=0&&n<=days)) throw Error('不补贴天数须为整数，且不能超过出差天数');
    const rows = [];
    for (const person of people) for (const [i,category] of ['用餐补贴','市内交通补贴'].entries()) {
      const rate = rates[input.region][i], amountCents = (days-exclusions[i])*rate*100;
      if (!Number.isSafeInteger(amountCents)) throw Error('补贴金额超出可处理范围');
      if (!amountCents) continue;
      if (!available.includes(category)) throw Error('当前模板没有对应分类：' + category);
      const title = person + ' ' + input.start + '至' + input.end + ' ' + category;
      rows.push({kind:'allowance',identity:JSON.stringify(['allowance',category,person,input.start,input.end]),title,person,start:input.start,end:input.end,days,rate,excludedDays:exclusions[i],region:{hubei:'湖北省内（武汉以外）',outside:'省外普通地区',special:'青海、西藏、新疆',wuhan:'武汉市内'}[input.region],category,amountCents,selected:true,blocked:false});
    }
    return {rows,amount:total(rows),days,people:people.length};
  }
  return {categories, identifiers, identity, amount, classify, plan, total, balance, rowValues, replacementCategories, projection, allowances, stayPeriod, calendarDay, policyUrl, associations};
});
