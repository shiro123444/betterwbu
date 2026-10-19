(function(root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./core.js') : root.ReimbursementEnhancerCore);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ReimbursementExpensePreflight = api;
})(typeof window === 'object' ? window : globalThis, function(money) {
  'use strict';
  const travelForm = 'c3771358d145490f9e363790c0519fde';
  const text = value => String(value ?? '').trim();
  function amount(value) {
    if (!text(value)) return null;
    try { return money.cents(value); } catch { return null; }
  }
  function day(value) {
    const match = text(value).match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
    if (!match) return null;
    const [,y,m,d] = match, time = Date.UTC(+y,+m-1,+d), date = new Date(time);
    return date.getUTCFullYear() === +y && date.getUTCMonth() === +m-1 && date.getUTCDate() === +d ? time / 86400000 : null;
  }
  function inspect(input) {
    let form = input;
    if (typeof form === 'string') { try { form = JSON.parse(form); } catch { return []; } }
    if (form?.formId !== travelForm) return [];
    const issues = [], used = new Map(), periods = new Map();
    const add = (code, label, message) => issues.push({code, message:label + '：' + message});
    for (const activity of form.activitys || []) for (const behavior of activity.behaviors || []) {
      const category = behavior.behaviorMetaName;
      if (behavior.behaviorKey === 'summary' || category === '总览') continue;
      for (const [index,row] of (behavior.behaviorDetail || []).entries()) {
        const rawAmount = row.BSX070306 ?? row.BSX070304;
        const value = amount(rawAmount);
        const label = [activity.activityMetaName, category, '第' + (index+1) + '行'].filter(Boolean).join(' / ');
        // Native templates keep an unused blank row in every category. A
        // default actor or row id alone does not turn it into an expense.
        const hasDetails = ['BSX070110','BTSSX0104','BTSSX0403','BTSSX0404'].some(key => text(row[key])) || row.BSX0709?.length;
        if (!text(rawAmount) && !hasDetails) continue;
        if (value === null || value < 0) { add('amount-invalid',label,'金额未填写或无效，请核对'); continue; }
        if (value === 0) continue;
        if (['城市间交通费','改签、退票费'].includes(category)) {
          const links = (Array.isArray(row.BSX0709) ? row.BSX0709 : []).filter(link => String(link.BSX070811) !== '0');
          if (!links.length) { add('invoice-missing',label,'报销 ' + (value/100).toFixed(2) + ' 元，但未关联有效发票。影像区已上传不等于费用行已关联，请在详情中核对'); continue; }
          let total = 0, complete = true;
          for (const link of links) {
            const gross = amount(link.BSX070804);
            if (!text(link.BSX070802) || !text(link.BSX070807) || !text(link.BSX070803) || !text(link.BSX070809) || gross === null || gross <= 0) { complete = false; continue; }
            total += gross;
            const record = text(link.BSX070802), barcode = text(link.BSX070807);
            const entry = used.get(record) || {barcode, total:0, labels:[]};
            if (entry.barcode !== barcode) complete = false;
            entry.total += gross; entry.labels.push(label); used.set(record,entry);
          }
          if (!complete) add('invoice-incomplete',label,'票据关联标识、发票行或使用金额不完整，请重新核对关联');
          if (complete && value > total) add('invoice-shortfall',label,'报销金额大于关联票据使用金额 ' + (total/100).toFixed(2) + ' 元，请核对漏票、分摊或重复计费');
        }
        if (['用餐补贴','市内交通补贴'].includes(category)) {
          const place = row.BTSSX0406_BTSSX0407_BTSSX0408;
          const province = text(row.BTSSX0406 || (Array.isArray(place) ? place[0] : ''));
          const city = text(row.BTSSX0407 || (Array.isArray(place) ? place[1] : ''));
          const rate = amount(row.BSX071301), days = text(row.BTSSX0409) ? Number(row.BTSSX0409) : null;
          const start = day(row.BTSSX0403), end = day(row.BTSSX0404), deduction = amount(row.BTSSX0412 ?? 0);
          const missing = [];
          if (!/^\d{6}$/.test(province) || !/^\d{6}$/.test(city)) missing.push('补贴地');
          if (rate === null || rate <= 0) missing.push('标准');
          if (!Number.isInteger(days) || days <= 0) missing.push('补贴天数');
          if (missing.length) add('allowance-basis-missing',label,missing.join('、') + '未就绪。请先在原生表单选择补贴地并等待标准、天数计算，不能只填写金额');
          if (start === null || end === null || end < start) add('allowance-dates',label,'补贴起止日期不完整或无效');
          else if (days !== null && Number.isInteger(days) && days > 0 && days !== end-start+1) add('allowance-days',label,'补贴天数与起止日期不一致，请核对原生计算结果');
          if (deduction === null || deduction < 0) add('allowance-deduction',label,'扣减金额无效');
          if (!missing.length && deduction !== null && deduction >= 0 && value > rate*days-deduction) add('allowance-over-limit',label,'金额超过当前标准 × 天数 − 扣减金额，请核对适用条件');
          const person = text(row.BTSSX0402);
          if (!person) add('allowance-person',label,'缺少补贴人员');
          if (person && start !== null && end !== null && end >= start) {
            const key = JSON.stringify([category,person]), prior = periods.get(key) || [];
            if (prior.some(p => start <= p.end && end >= p.start)) add('allowance-overlap',label,'同一人员已有日期重叠的同类补贴，请核对是否重复');
            prior.push({start,end}); periods.set(key,prior);
          }
        }
      }
    }
    // Only compare totals for invoices present in this form. Missing source
    // details remain unknown; a card face value is not a backend approval.
    const seen = new Set();
    function invoice(bill) {
      if (!bill || seen.has(bill)) return;
      seen.add(bill);
      const id = text(bill.dataId || bill.id || bill.realityId), entry = used.get(id);
      const total = amount(bill.totalAmount ?? bill.billData?.totalAmount);
      if (entry && entry.barcode === text(bill.barcode) && total !== null && entry.total > total) add('invoice-reused',entry.labels.join('；'),'同一发票累计使用金额超过票面金额，请核对重复关联');
      for (const child of bill.subBillCards || []) invoice(child);
    }
    for (const bill of form.billVOList || []) invoice(bill);
    return issues;
  }
  return {inspect};
});
