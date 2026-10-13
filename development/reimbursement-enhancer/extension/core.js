(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ReimbursementEnhancerCore = api;
})(typeof window === 'object' ? window : {}, function () {
  'use strict';
  function cents(value) {
    let s = String(value ?? '').trim().replace(/[¥￥\s]/g, '');
    if (!s) return 0;
    if (s.includes(',') && !/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(s)) throw Error('amount');
    s = s.replaceAll(',', '');
    if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(s)) throw Error('amount');
    const [whole, part = ''] = s.replace(/^[+-]/, '').split('.');
    const n = BigInt(whole) * 100n + BigInt(part.padEnd(2, '0'));
    if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('amount');
    return Number(s[0] === '-' ? -n : n);
  }
  function sum(rows, key) {
    let result = 0;
    for (const row of rows || []) {
      result += cents(row[key]);
      if (!Number.isSafeInteger(result)) throw Error('amount');
    }
    return result;
  }
  const aliases = { '工行': '中国工商银行', '农行': '中国农业银行', '建行': '中国建设银行', '中行': '中国银行', '邮储': '中国邮政储蓄银行', '交行': '交通银行' };
  function condition(term) {
    const words = String(term).trim().split(/\s+/).filter(Boolean).slice(0, 6).map(w => aliases[w] || w);
    if (!words.length) return null;
    // The server expects one group with or/and members, not multiple root groups.
    const match = w => ({ matchMode: '8', branch_bank_name: w });
    return { and: [{ or: [match(words[0])], and: words.slice(1).map(match) }] };
  }
  // This is deliberately limited to this school's verified travel form.
  function travelPlan(form) {
    if (form.formId !== 'c3771358d145490f9e363790c0519fde' || !Array.isArray(form.activitys)) return null;
    const groups = []; let total = 0;
    for (const activity of form.activitys) {
      if (!Array.isArray(activity.behaviors)) return null;
      let subtotal = 0;
      for (const behavior of activity.behaviors) {
        if (!Array.isArray(behavior.behaviorDetail)) return null;
        // Summary rows are not a second source of expenses.
        if (behavior.behaviorKey === 'summary' || behavior.behaviorMetaName === '总览') continue;
        const rows = behavior.behaviorDetail.map(row => ({ amount: row.BSX070306 ?? row.BSX070304 ?? 0 }));
        const amount = sum(rows, 'amount');
        groups.push({ target: behavior, key: 'BSX060206', amount }); subtotal += amount;
        if (!Number.isSafeInteger(subtotal)) throw Error('amount');
      }
      groups.push({ target: activity, key: 'ASX060401', amount: subtotal }); total += subtotal;
      if (!Number.isSafeInteger(total)) throw Error('amount');
    }
    groups.push({ target: form, key: 'totalAmount', amount: total });
    return groups;
  }
  return { cents, sum, condition, travelPlan };
});
