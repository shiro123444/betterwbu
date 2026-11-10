(function(root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./core.js') : root.ReimbursementEnhancerCore);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ReimbursementLaborTax = api;
})(typeof window === 'object' ? window : {}, function(money) {
  'use strict';
  const studentLaborForm = '56b47a2292324bb59be137ff748e3826';
  const present = value => value != null && String(value).trim() !== '';
  const id = form => String(form?.reimbursementId || form?.id || '');
  function describe(form) {
    if (form?.formId !== studentLaborForm) return null;
    const rows = (form.activitys || []).flatMap(a => (a.behaviors || [])
      .filter(b => b.behaviorKey !== 'summary' && b.behaviorMetaName !== '总览')
      .flatMap(b => b.behaviorDetail || []));
    let gross = 0, net = 0, recordedTax = 0, missingTax = false, count = 0;
    try {
      for (const row of rows) {
        if (!present(row.BSX070306) && !present(row.BTSSX1313)) continue;
        if (!present(row.BSX070306) || !present(row.BTSSX1313)) return null;
        const before = money.cents(row.BSX070306), after = money.cents(row.BTSSX1313);
        if (before < 0 || after < 0 || after > before) return null;
        const tax = money.cents(row.BTSSX1311);
        if (tax < 0) return null;
        gross += before; net += after; recordedTax += tax; count++;
        missingTax ||= before > after && !present(row.BTSSX1311);
        if (![gross, net, recordedTax].every(Number.isSafeInteger)) return null;
      }
      if (!count || (gross === net && recordedTax === 0)) return null;
      const total = money.cents(form.totalAmount);
      const receivable = money.sum(form.receivableInfo, 'receivableCurrency');
      const actual = money.sum(form.receivableInfo, 'actualReceivableCurrency');
      return {gross, net, difference:gross-net, recordedTax, missingTax, total, receivable, actual};
    } catch { return null; }
  }
  const yuan = value => (value / 100).toFixed(2) + ' 元';
  function message(report) {
    return ['学生劳务费税款确认',
      '税前劳务费：' + yuan(report.gross),
      '税后劳务费：' + yuan(report.net),
      '税前与税后差额：' + yuan(report.difference),
      '个税栏已记录：' + yuan(report.recordedTax),
      ...(report.missingTax ? ['部分个税栏未填写，以上差额按已填税前、税后金额计算。'] : []),
      '报销总金额：' + yuan(report.total),
      '收付款应收合计：' + yuan(report.receivable),
      '收付款实收合计：' + yuan(report.actual),
      '确认按当前金额继续提交？确认后交由学校原系统校验并提交，插件不改写金额。'].join('\n');
  }
  function install({document, window, location, form, enabled}) {
    const replaying = new WeakSet();
    function draft() {
      const current = form();
      const route = new URLSearchParams(location.hash.split('?')[1] || '').get('formEditId');
      return location.hash.startsWith('#/reimbursementCreate?') && route && route === id(current) && String(current?.state) === '2' ? current : null;
    }
    function signature(current) {
      return JSON.stringify([location.hash, id(current), current.formId, current.state,
        current.totalAmount, current.activitys, current.receivableInfo]);
    }
    function click(event) {
      const button = event.target?.closest?.('button');
      if (!button || replaying.has(button) || button.disabled || button.getAttribute('aria-disabled') === 'true' || enabled() === false) return;
      const label = button.getAttribute('aria-label') || button.textContent;
      if (String(label).replace(/\s/g, '') !== '提交') return;
      let current, report, before;
      try { current = draft(); report = describe(current); if (!report) return; before = signature(current); }
      catch { return; }
      event.preventDefault(); event.stopImmediatePropagation();
      // A confirmation replaces plugin-side refusal. Do not alter a financial
      // value, call a backend directly, or suppress the school's own errors.
      let accepted;
      try { accepted = window.confirm(message(report)); }
      catch { accepted = true; } // An unavailable dialog must not disable native submission.
      if (!accepted || !button.isConnected || draft() !== current || signature(current) !== before) return;
      replaying.add(button);
      try { button.click(); } finally { replaying.delete(button); }
    }
    document.addEventListener('click', click, true);
    return () => document.removeEventListener('click', click, true);
  }
  return {describe, message, install};
});
