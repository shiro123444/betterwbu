(function(root) {
  "use strict";
  const preflight = typeof module === "object" && module.exports ? require("./expense-preflight.js") : root.ReimbursementExpensePreflight;
  const fields = ["activitys", "receivableInfo", "paymentInfo", "gwkxfxq", "budgetInfo", "assocDataInfo2", "reversedWriteOffInfo", "provisionReversedWriteOffInfo", "totalAmount", "totalAmountOrigin", "payAmount", "payAmountOrigin", "actualPayAmount", "actualPayAmountOrigin", "chargeAmount", "chargeAmountOrigin", "writeOffAmount", "writeOffAmountOrigin", "totalDeductTax", "totalDeductTaxTicket", "applyReason", "voucherNum", "SSQK", "SSQK_object", "selectActivityId", "zmr", "zmr_object", "zmr_showValue", "xmfzr", "xmfzr_object", "xmfzr_showValue", "applyStaffName", "applyStaffName_object", "applyStaffCorpId", "applyStaffCorpId_object", "applyStaffdeptName", "applyStaffdeptName_object", "operatorStaffCorpId", "operatorStaffCorpId_object", "operatorStafffdeptName", "operatorStafffdeptName_object"];
  const clone = (value) => value === void 0 ? void 0 : JSON.parse(JSON.stringify(value));
  const id = (form) => String(form?.reimbursementId || form?.id || "");
  const tickets = (form) => JSON.stringify((form?.billVOList || []).map((b) => String(b.barcode || b.billBarcode || "")).sort());
  function eligible(form) {
    return !!(id(form) && form?.formId && String(form.state) === "2");
  }
  function workflowStatus(form, outcome) {
    const fillRecorded = form?.aiFlag === true || form?.aiFlag === "true", state = String(form?.state ?? "");
    return { fillRecorded, generationStatus: outcome?.success === true ? "succeeded" : outcome?.success === false ? "failed" : "unknown", submitted: ["6", "8", "9", "10", "11", "99"].includes(state), canGenerate: eligible(form) && !fillRecorded };
  }
  function cents(value) {
    if (value === null || value === void 0 || value === "") return null;
    const n = Number(String(value).replace(/,/g, ""));
    return Number.isFinite(n) && Math.abs(n) < 1e12 ? Math.round(n * 100) : null;
  }
  function printAmount(text) {
    const match = String(text || "").replace(/\s/g, "").match(/(?:\(小写\)|（小写）|小写)[：:]?[￥¥]([\d,]+(?:\.\d{1,2})?)/);
    return match ? cents(match[1]) : null;
  }
  function serverReport(response, audit, printed = null) {
    if (response?.success !== true || !response.data) throw Error("后台单据状态读取失败");
    const data = response.data;
    let form = data.reimbData;
    try {
      if (typeof form === "string") form = JSON.parse(form);
    } catch {
      throw Error("后台单据数据无法解析");
    }
    if (!form || typeof form !== "object") throw Error("后台未返回费用数据");
    const sum = (items, key) => {
      if (!Array.isArray(items)) return null;
      let total2 = 0;
      for (const row of items) {
        const n = cents(typeof key === "function" ? key(row) : row[key]);
        if (n === null) return null;
        total2 += n;
      }
      return total2;
    };
    const rows = Array.isArray(form.activitys) ? form.activitys.flatMap((a) => (a.behaviors || []).filter((b) => b.behaviorKey !== "summary" && b.behaviorMetaName !== "总览").flatMap((b) => b.behaviorDetail || [])) : null;
    const auditKnown = audit?.success === true && Array.isArray(audit.data?.violationList) && Array.isArray(audit.data?.warningList);
    const total = cents(data.totalAmount ?? form.totalAmount), expenseTotal = sum(rows, (r) => { const value = r.BSX070306 ?? r.BSX070304; return value == null || String(value).trim() === "" ? 0 : value; }), receiptTotal = sum(form.receivableInfo, "actualReceivableCurrency");
    const report = { ...workflowStatus({ ...form, state: data.state ?? form.state }), draftId: String(data.id || id(form)), state: data.state ?? form.state, stateName: data.stateName || form.stateName || "", total, expenseTotal, receiptTotal, printTotal: printed, auditKnown, violations: auditKnown ? audit.data.violationList.length : null, warnings: auditKnown ? audit.data.warningList.length : null, issues: [], detailIssues: expenseIssues(form) };
    if (total !== null && expenseTotal !== null && total !== expenseTotal) report.issues.push("费用明细与报销总额不一致");
    if (total !== null && receiptTotal !== null && total !== receiptTotal) report.issues.push("实收金额与报销总额不一致");
    if (total !== null && printed !== null && total !== printed) report.issues.push("打印报销单金额与后台总额不一致");
    return report;
  }
  function capture(form, scope) {
    if (!eligible(form) || !scope) throw Error("只能备份当前待提交草稿");
    const data = {};
    for (const key of fields) if (Object.hasOwn(form, key) && form[key] !== void 0) data[key] = clone(form[key]);
    return { version: 1, scope, id: id(form), formId: String(form.formId), tickets: tickets(form), createdAt: Date.now(), data };
  }
  function validate(snapshot) {
    return snapshot?.version === 1 && typeof snapshot.scope === "string" && !!snapshot.scope && typeof snapshot.id === "string" && !!snapshot.id && typeof snapshot.formId === "string" && !!snapshot.formId && typeof snapshot.tickets === "string" && !!snapshot.data && Array.isArray(snapshot.data.activitys) && Number.isFinite(snapshot.createdAt);
  }
  function generationIssues(form, bills) {
    const selected = new Set((form?.billVOList || []).map((b) => b.barcode).filter(Boolean)), issues = [], seen = /* @__PURE__ */ new Set();
    function scan(b) {
      if (!b || seen.has(b)) return;
      seen.add(b);
      if (selected.has(b.barcode)) {
        for (const key of ["air", "processDetail"]) for (const [index, row] of (Array.isArray(b.billData?.[key]) ? b.billData[key] : []).entries()) {
          if ((row.transportation || row.transportationCode) && !String(row.issueDate || "").trim()) {
            const identity = b.barcode + "|" + index;
            if (!issues.some((i) => i.identity === identity)) issues.push({ identity, barcode: b.barcode, index, message: b.barcode + "：交通明细第" + (index + 1) + "行缺少日期，需修订票据识别数据。发票开票日期不能代替行程日期。" });
          }
        }
      }
      for (const child of b.subBillCards || []) scan(child);
    }
    for (const bill of bills || []) scan(bill);
    return issues;
  }
  function requestIssue(form, payload) {
    if (!form || !Array.isArray(payload?.billVOList)) return "";
    const expenses = (payload.reimbData?.activitys || []).flatMap(a => (a.behaviors || []).filter(b => b.behaviorKey !== "summary").flatMap(b => b.behaviorDetail || []));
    if (!payload.billVOList.length && form.billVOList?.length && expenses.some(row => cents(row.BSX070306) > 0)) return "原生票据清单尚未同步，已停止本次操作。请等待影像预览完成后重新核对，避免有效发票金额变为零。";
    const seen = new Set();
    function incomplete(bill) {
      if (!bill || seen.has(bill)) return false;
      seen.add(bill);
      if (String(bill.dataType) === "5" && (!Array.isArray(bill.subBillCards) || !bill.subBillCards.length)) return true;
      return (bill.subBillCards || []).some(incomplete);
    }
    if (payload.billVOList.some(incomplete)) return "票据组的子票尚未读取完整，已停止本次操作。请等待机票截图、住宿水单等预览加载完成后重试。";
    return "";
  }
  function restore(form, snapshot, scope) {
    if (!validate(snapshot) || !eligible(form) || snapshot.scope !== scope || snapshot.id !== id(form) || snapshot.formId !== String(form.formId)) throw Error("备份与当前用户或草稿不匹配");
    if (snapshot.tickets !== tickets(form)) throw Error("票据已变化，请先核对票据，未恢复明细");
    const data = clone(snapshot.data);
    for (const key of fields) {
      if (Object.hasOwn(data, key)) form[key] = data[key];
      else delete form[key];
    }
    return form;
  }
  const expenseIssues = form => preflight?.inspect(form) || [];
  const api = { fields, id, tickets, eligible, capture, validate, restore, generationIssues, requestIssue, workflowStatus, serverReport, printAmount, expenseIssues };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ReimbursementFillCompatCore = api;
})(typeof window === "object" ? window : globalThis);
