(() => {
  "use strict";
  let serial = 0;
  const requests = /* @__PURE__ */ new Map();
  function request(action, extra = {}) {
    return new Promise((resolve, reject) => {
      const id = "fill-" + ++serial, timer = setTimeout(() => {
        requests.delete(id);
        reject(Error("页面响应超时，请检查原生填报窗口；备份仍保留"));
      }, action === "run" ? 18e4 : action === "server-status" ? 15e3 : 5e3);
      requests.set(id, { resolve, reject, timer });
      window.postMessage({ type: "reimbursement-fill-request", id, action, ...extra }, location.origin);
    });
  }
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin || event.data?.type !== "reimbursement-fill-reply") return;
    const entry = requests.get(event.data.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    requests.delete(event.data.id);
    event.data.ok ? entry.resolve(event.data) : entry.reject(Object.assign(Error(event.data.error || "操作失败"), { generationFailure: !!event.data.generationFailure }));
  });
  window.ReimbursementFillCompatUI = { mount({ container, node, button, notify }) {
    const section = node("fieldset", null, "settings-group");
    section.append(node("legend", "填报兼容"));
    const status = node("p", null, "muted");
    status.setAttribute("role", "status");
    const start = button("一键同步填报", run), restore = button("恢复核对明细", recover), refresh = button("重新检查", load), checkButton = button("检查当前单据", check), reportArea = node("div", null, "fill-compat-report"), actions = node("div", null, "actions");
    start.className = "primary";
    reportArea.setAttribute("role", "status");
    start.disabled = restore.disabled = true;
    actions.append(start, restore, refresh, checkButton);
    section.append(status, actions, reportArea);
    container.append(section);
    let working = false, checkedKey = "", checkedDraft = "", generationOutcome;
    const money = (value) => value === null || value === void 0 ? "未读取" : "¥ " + (value / 100).toFixed(2);
    function showReport(report) {
      reportArea.replaceChildren();
      const lines = [(report.stateName || "后台状态 " + report.state) + " · " + money(report.total), "填报记录：" + (report.fillRecorded ? "已记录" : "未记录") + " · 生成结果：" + (generationOutcome?.success === true ? "成功" : generationOutcome?.success === false ? "失败" : "未确认"), "费用 " + money(report.expenseTotal) + " · 实收 " + money(report.receiptTotal), report.auditKnown ? "稽核：" + report.violations + " 条违规，" + report.warnings + " 条提醒" : "稽核结果尚未读取", "打印金额：" + money(report.printTotal)];
      for (const text of lines) reportArea.append(node("p", text, "muted"));
      for (const text of report.issues || []) reportArea.append(node("p", text, "fill-compat-issue"));
      checkedDraft = report.draftId || "";
      checkedKey = String(report.state) + "|" + String(report.total);
    }
    async function check() {
      if (working) return;
      working = true;
      checkButton.disabled = true;
      try {
        const result = await request("server-status");
        showReport(result.report);
      } catch (error) {
        reportArea.replaceChildren();
        checkedKey = checkedDraft = "";
        notify(error.message);
      } finally {
        working = false;
        checkButton.disabled = false;
        await load(false);
      }
    }
    async function inspect() {
      const state = await request("status");
      const backup = await chrome.runtime.sendMessage({ type: "fill-backup-get", scope: state.scope, id: state.draftId });
      generationOutcome = backup?.snapshot?.generationOutcome;
      return { state, snapshot: backup?.snapshot };
    }
    async function load(autoCheck = true) {
      if (working) return;
      try {
        const { state, snapshot } = await inspect();
        if (checkedDraft && checkedDraft !== state.draftId) {
          reportArea.replaceChildren();
          checkedKey = checkedDraft = "";
        }
        start.textContent = state.fillRecorded ? "检查填报状态" : "一键同步填报";
        start.hidden = refresh.hidden = !!state.submitted;
        restore.hidden = !snapshot || !state.eligible;
        start.disabled = !state.eligible || !state.available || state.busy || state.pending;
        restore.disabled = !state.eligible || !snapshot || state.busy || state.pending || !state.fillRecorded;
        status.textContent = state.submitted ? "已进入后续流程，仅检查，不修改。" : !state.eligible ? "请打开待提交草稿。" : state.pending ? "请完成原生窗口，再重新检查。" : state.fillRecorded ? "后台已记录填报，不再重复生成。提交仍由原系统校验。" : snapshot ? "核对结果已备份。" : "自动备份、填报、恢复并暂存，不会正式提交。";
        if (autoCheck !== false && state.submitted && !checkedKey) await check();
      } catch {
        start.disabled = restore.disabled = true;
        status.textContent = "请重新打开报销页面。";
      }
    }
    async function run() {
      if (working) return;
      working = true;
      start.disabled = restore.disabled = true;
      let lease, activeSnapshot;
      try {
        const { state } = await inspect(), server = await request("server-status");
        showReport(server.report);
        if (server.report.fillRecorded || server.report.submitted) {
          notify(server.report.submitted ? "单据已进入后续流程，本次仅检查，未修改。" : "后台已记录填报，不重复运行 AI。请核对当前金额与稽核后使用原生提交。");
          return;
        }
        if (String(server.report.state) !== "2") throw Error("后台当前不是待提交状态，未启动填报");
        const captured = await request("capture");
        activeSnapshot = captured.snapshot;
        const saved = await chrome.runtime.sendMessage({ type: "fill-backup-save", snapshot: captured.snapshot });
        if (!saved?.ok) throw Error("备份保存失败，未启动填报");
        if (saved.existing && !saved.reused) throw Error("已有核对备份，请先恢复或核对，避免覆盖");
        lease = await chrome.runtime.sendMessage({ type: "fill-guard-begin", scope: state.scope, id: state.draftId });
        if (!lease?.ok) throw Error("原生填报入口未能开放，备份已保留");
        status.textContent = "正在同步填报，原金额已备份。";
        await request("run", { snapshot: captured.snapshot });
        const confirmed = await chrome.runtime.sendMessage({ type: "fill-backup-mark-result", scope: state.scope, id: state.draftId, success: true });
        if (!confirmed?.ok) throw Error("填报结果记录失败，备份保留，未自动暂存");
        let current = await request("status");
        const deadline = Date.now() + 2e4;
        while (!current.aiComplete && !current.pending && Date.now() < deadline) {
          if (current.scope !== state.scope || current.draftId !== state.draftId || !current.eligible) throw Error("当前用户或草稿已切换，流程已停止");
          await new Promise((resolve) => setTimeout(resolve, 500));
          current = await request("status");
        }
        if (!current.aiComplete || current.pending) throw Error("系统仍有待确认内容，未恢复或暂存；原金额备份仍保留，请检查原生提示");
        await request("finish", { snapshot: captured.snapshot });
        notify("已恢复核对结果并发起暂存，请核对系统保存结果。尚未提交。");
      } catch (error) {
        if (error.generationFailure && activeSnapshot) await chrome.runtime.sendMessage({ type: "fill-backup-mark-result", scope: activeSnapshot.scope, id: activeSnapshot.id, success: false, message: error.message }).catch(() => {
        });
        notify(error.message);
      } finally {
        if (lease?.ok) await chrome.runtime.sendMessage({ type: "fill-guard-end", lease: lease.lease }).catch(() => {
        });
        working = false;
        await load();
      }
    }
    async function recover() {
      if (working) return;
      working = true;
      start.disabled = restore.disabled = true;
      try {
        const { state, snapshot } = await inspect();
        if (!snapshot || !state.eligible) throw Error("没有当前草稿的备份");
        await request("restore", { snapshot });
        notify("已恢复核对明细。请暂存，再核对金额和票据关联。");
      } catch (error) {
        notify(error.message);
      } finally {
        working = false;
        await load();
      }
    }
    return { load };
  } };
})();
