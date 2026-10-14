(() => {
  "use strict";
  const core = window.ReimbursementFillCompatCore;
  let native, environment, busy = false;
  let guardedHttp, guardedPost, originalPost;
  const generations = /* @__PURE__ */ new Map();
  const scope = () => {
    try {
      const user = JSON.parse(localStorage.getItem("userInfo") || "null");
      return user?.id ? String(user.groupId || "") + "|" + String(user.id) : null;
    } catch {
      return null;
    }
  };
  const form = () => environment?.form?.();
  const routeId = () => {
    try {
      if (!location.hash.startsWith("#/reimbursementCreate?")) return "";
      return new URLSearchParams(location.hash.split("?")[1]).get("formEditId") || "";
    } catch {
      return "";
    }
  };
  window.ReimbursementFillCompat = {
    bind(value) {
      environment = value;
      const http = value?.http;
      if (guardedHttp === http || typeof http?.post !== "function") return;
      if (guardedHttp && guardedHttp.post === guardedPost) guardedHttp.post = originalPost;
      guardedHttp = http;
      originalPost = http.post;
      const post = originalPost;
      guardedPost = function(...args) {
        const data = args[1], current = form();
        if (environment?.enabled?.() !== false && /\/reimbursement\/(?:save|commit|ai|ai-again)(?:\?|$)/.test(String(args[0])) && String(data?.id || core.id(data?.reimbData)) === core.id(current) && core.id(current)) {
          const issue = core.requestIssue(current, data);
          if (issue) return Promise.resolve({ success: false, code: "ENHANCER_TICKETS_NOT_READY", message: issue });
        }
        return post.apply(this, args);
      };
      http.post = guardedPost;
    },
    register(instance) {
      if (typeof instance.setupState?.onClickBtn === "function" && instance.setupState?.formConfig && instance.setupState?.controlsList) native = instance;
    }
  };
  function status() {
    const current = form(), draftId = routeId(), matches = !!draftId && draftId === core.id(current), workflow = core.workflowStatus(matches ? current : null, generations.get(scope() + "|" + draftId));
    return { ...workflow, scope: scope(), draftId, eligible: matches && core.eligible(current), available: !!(native && !native.isUnmounted), busy, pending: !!(native?.setupState?.loadingVisible || native?.setupState?.commitBillVisible), aiComplete: workflow.fillRecorded && workflow.generationStatus !== "failed" };
  }
  function printedTotal(reimbursementNo) {
    if (!reimbursementNo) return null;
    const seen = /* @__PURE__ */ new Set();
    let total = null;
    function scan(doc) {
      if (!doc || seen.has(doc) || seen.size > 16) return;
      seen.add(doc);
      const text = [...doc.querySelectorAll(".textLayer")].map((n) => n.textContent || "").join("");
      const amount = text.replace(/\s/g, "").includes(String(reimbursementNo)) ? core.printAmount(text) : null;
      if (amount !== null) total = amount;
      for (const frame of doc.querySelectorAll("iframe")) {
        try {
          scan(frame.contentDocument);
        } catch {
        }
      }
    }
    for (const frame of document.querySelectorAll("iframe.iframe-box")) {
      try {
        if (new URL(frame.src, location.origin).pathname.endsWith("/pdf/web/viewer.html")) scan(frame.contentDocument);
      } catch {
      }
    }
    return total;
  }
  async function readServer() {
    const currentId = routeId(), user = scope();
    if (!currentId || !user || typeof environment?.readDraft !== "function") throw Error("请打开报销单后重新检查");
    const [response, audit] = await Promise.all([environment.readDraft(currentId), Promise.resolve(environment.readAudit?.(currentId)).catch(() => null)]);
    if (routeId() !== currentId || scope() !== user) throw Error("当前用户或单据已切换，已丢弃旧结果");
    if (String(response?.data?.id || "") !== currentId) throw Error("后台返回了不同单据，已停止");
    return core.serverReport(response, audit, printedTotal(response.data.reimbursementNo));
  }
  async function generate(snapshot) {
    const issues = core.generationIssues(form(), environment?.bills?.() || []);
    if (issues.length) throw Error(issues.map((i) => i.message).join("\n"));
    const http = environment?.http, post = http?.post;
    if (typeof post !== "function") throw Error("无法核对原生填报接口，已停止，备份仍保留");
    let observed;
    const watch = function(...args) {
      const path = String(args[0] || ""), data = args[1], target = /\/reimbursement\/ai(?:-again)?(?:\?|$)/.test(path) && String(data?.id || data?.reimbData?.reimbursementId || "") === snapshot.id;
      return Promise.resolve(post.apply(this, args)).then((response) => {
        if (target) {
          const body = typeof response?.success === "boolean" ? response : response?.data;
          observed = { success: body?.success === true, message: body?.message };
          generations.set(snapshot.scope + "|" + snapshot.id, observed);
        }
        return response;
      }, (error) => {
        if (target) {
          observed = { success: false, message: "原生填报请求失败" };
          generations.set(snapshot.scope + "|" + snapshot.id, observed);
        }
        throw error;
      });
    };
    http.post = watch;
    if (http.post !== watch) throw Error("无法观察原生填报结果，已停止");
    try {
      await native.setupState.onClickBtn({ btnEvent: { event: "4" }, form: JSON.parse(JSON.stringify(form())) });
      if (!observed) throw Error("未能确认原生填报接口结果，未恢复或暂存");
      if (!observed.success) throw Object.assign(Error(observed.message || "原生填报失败，备份仍保留"), { generationFailure: true });
      const deadline = Date.now() + 15e4;
      while (status().pending) {
        if (Date.now() > deadline) throw Error("原生填报仍在等待，请关闭或完成窗口后重试；核对备份仍保留");
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return status();
    } finally {
      if (http.post === watch) http.post = post;
    }
  }
  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.origin !== location.origin || event.data?.type !== "reimbursement-fill-request") return;
    const { id, action, snapshot } = event.data;
    let result;
    try {
      if (action === "status") result = status();
      else if (action === "server-status") result = { report: await readServer() };
      else if (action === "capture") {
        if (busy || !status().eligible) throw Error("请打开当前待提交草稿，或等待填报结束");
        result = { snapshot: core.capture(form(), scope()) };
      } else if (action === "run") {
        if (busy || status().pending || !status().eligible || !status().available || !core.validate(snapshot) || snapshot.scope !== scope() || snapshot.id !== core.id(form()) || snapshot.formId !== String(form().formId) || snapshot.tickets !== core.tickets(form())) throw Error("当前草稿已变化或原生窗口未结束，未启动填报");
        busy = true;
        try {
          const report = await readServer();
          if (String(report.state) !== "2") throw Error("后台当前不是待提交草稿，未启动填报");
          if (report.fillRecorded) throw Error("后台已记录填报，不重复生成。请检查金额和稽核后使用原生提交");
          if (!status().eligible || snapshot.scope !== scope() || snapshot.id !== core.id(form()) || snapshot.tickets !== core.tickets(form()) || JSON.stringify(core.capture(form(), scope()).data) !== JSON.stringify(snapshot.data)) throw Error("核对内容已变化，未启动填报");
          result = await generate(snapshot);
        } finally {
          busy = false;
        }
      } else if (action === "restore" || action === "finish") {
        if (busy) throw Error("正在填报，请稍候");
        if (!status().eligible) throw Error("当前单据不可恢复或暂存");
        if (native?.setupState?.loadingVisible || native?.setupState?.commitBillVisible) throw Error("请先完成或关闭原生填报窗口，再恢复明细");
        if (action === "finish" && status().generationStatus === "failed") throw Error("本次生成失败，不自动覆盖或暂存；可单独恢复核对明细后复核");
        busy = true;
        try {
          const report = await readServer();
          if (String(report.state) !== "2" || !report.fillRecorded) throw Error("后台当前不可恢复或暂存；核对备份仍保留");
          core.restore(form(), snapshot, scope());
          await environment?.nextTick?.();
          environment?.refresh?.();
          if (action === "finish") {
            if (!status().available) throw Error("原生暂存入口不可用，核对明细已恢复");
            await native.setupState.onClickBtn({ btnEvent: { event: "1" }, form: JSON.parse(JSON.stringify(form())) });
            result = { ...status(), saveRequested: true };
          } else result = status();
        } finally {
          busy = false;
        }
      } else throw Error("不支持的操作");
      window.postMessage({ type: "reimbursement-fill-reply", id, ok: true, ...result }, location.origin);
    } catch (error) {
      window.postMessage({ type: "reimbursement-fill-reply", id, ok: false, error: error.message || "操作失败", generationFailure: !!error.generationFailure }, location.origin);
    }
  });
})();
