(() => {
  const API_BASE = "/api/v1";
  const tokenKey = "adminToken";

  const loginBox = document.getElementById("loginBox");
  const testsBox = document.getElementById("testsBox");
  const testsList = document.getElementById("testsList");
  const testsError = document.getElementById("testsError");
  const loginBtn = document.getElementById("loginBtn");
  const loginError = document.getElementById("loginError");
  const loginUser = document.getElementById("loginUser");
  const loginPass = document.getElementById("loginPass");
  const logoutBtn = document.getElementById("logoutBtn");
  const searchInput = document.getElementById("searchInput");
  const reportBox = document.getElementById("reportBox");
  const emptyState = document.getElementById("emptyState");
  const reportTitle = document.getElementById("reportTitle");
  const reportSlug = document.getElementById("reportSlug");
  const reportOwner = document.getElementById("reportOwner");
  const reportDate = document.getElementById("reportDate");
  const funnelBox = document.getElementById("funnelBox");
  const responsesList = document.getElementById("responsesList");
  const downloadBtn = document.getElementById("downloadBtn");
  const qaList = document.getElementById("qaList");
  const resultsList = document.getElementById("resultsList");
  const tabs = Array.from(document.querySelectorAll(".tab"));
  const panels = Array.from(document.querySelectorAll(".tab-panel"));

  let tests = [];
  let activeTestId = null;

  const setToken = (token) => {
    if (token) localStorage.setItem(tokenKey, token);
    else localStorage.removeItem(tokenKey);
  };
  const getToken = () => localStorage.getItem(tokenKey) || "";

  const fetchJson = async (url, opts = {}) => {
    const res = await fetch(url, opts);
    if (!res.ok) {
      let msg = "Ошибка";
      try { msg = (await res.json()).detail || msg; } catch {}
      throw new Error(msg);
    }
    return res.json();
  };

  const renderTests = (filter = "") => {
    testsList.innerHTML = "";
    if (testsError) testsError.textContent = "";
    const needle = (filter || "").toLowerCase();
    const filtered = tests.filter((t) => String(t.title || "").toLowerCase().includes(needle));
    if (!filtered.length) {
      if (testsError) testsError.textContent = "Тесты не найдены";
      return;
    }
    filtered.forEach((t) => {
      const item = document.createElement("div");
      item.className = "test-item" + (t.id === activeTestId ? " active" : "");
      const owner = t.created_by_username ? `@${t.created_by_username}` : "—";
      const ownerId = t.created_by ? `id:${t.created_by}` : "";
      item.innerHTML = `<div>${t.title}</div><div class="muted">${owner} ${ownerId}</div>`;
      item.addEventListener("click", () => selectTest(t.id));
      testsList.appendChild(item);
    });
  };

  const renderFunnel = (funnel) => {
    const rows = [
      { label: "Заходов на экран 1", value: funnel.screen_opens },
      ...funnel.answers.map((a) => ({ label: `Ответов ${a.question_index}`, value: a.count })),
      { label: "Отправлено лид-форм", value: funnel.lead_form_submits },
      { label: "Клики по сайту", value: funnel.site_clicks },
    ];
    funnelBox.innerHTML = rows
      .map((row) => `<tr><td>${row.label}</td><td>${row.value}</td></tr>`)
      .join("");
  };

  const renderResponses = (report) => {
    if (!responsesList) return;
    const { questions, responses, test } = report;
    responsesList.innerHTML = "";
    responses.forEach((r, idx) => {
      const card = document.createElement("div");
      card.className = "response-card";
      const username = r.user_username ? `@${r.user_username}` : "";
      const fallbackId = r.user_id && r.user_id !== 0 ? `id:${r.user_id}` : "";
      const leadPhone = r.lead_phone ? `tel:${r.lead_phone}` : "";
      const identifier = username || leadPhone || fallbackId || "unknown";
      const userType = r.user_id && r.user_id !== 0 ? "telegram" : "guest";
      const meta = `
        <div class="response-title">Пользователь ${idx + 1}</div>
        <div class="response-meta">
          <div>${identifier}</div>
          <div>type: ${userType}</div>
          ${r.result_title ? `<div>result: ${r.result_title}</div>` : ""}
        </div>
      `;
      const rows = [];
      questions.forEach((q) => {
        rows.push(`
          <div class="response-row">
            <div class="response-label">${q.order_num}. ${q.text}</div>
            <div class="response-value">${r.answers[String(q.id)] || "—"}</div>
          </div>
        `);
      });
      if (test.lead_enabled) {
        if (test.lead_collect_name) rows.push(`
          <div class="response-row">
            <div class="response-label">lead_name</div>
            <div class="response-value">${r.lead_name || "—"}</div>
          </div>
        `);
        if (test.lead_collect_phone) rows.push(`
          <div class="response-row">
            <div class="response-label">lead_phone</div>
            <div class="response-value">${r.lead_phone || "—"}</div>
          </div>
        `);
        if (test.lead_collect_email) rows.push(`
          <div class="response-row">
            <div class="response-label">lead_email</div>
            <div class="response-value">${r.lead_email || "—"}</div>
          </div>
        `);
        if (test.lead_collect_site) rows.push(`
          <div class="response-row">
            <div class="response-label">lead_site</div>
            <div class="response-value">${r.lead_site || "—"}</div>
          </div>
          <div class="response-row">
            <div class="response-label">site_clicked</div>
            <div class="response-value">${r.lead_site_clicked ? "yes" : "no"}</div>
          </div>
        `);
      }
      card.innerHTML = meta + rows.join("");
      responsesList.appendChild(card);
    });
  };

  const renderQa = (report) => {
    if (!qaList) return;
    qaList.innerHTML = "";
    report.questions.forEach((q) => {
      const item = document.createElement("div");
      item.className = "qa-item";
      const answers = (q.answers || []).filter(Boolean).join(", ");
      const image = q.image_url ? `<img class="qa-item__image" src="${q.image_url}" alt="question" />` : "";
      item.innerHTML = `
        <div class="qa-item__title">${q.order_num}. ${q.text}</div>
        ${image}
        <div class="qa-item__answers">${answers || "Ответы не указаны"}</div>
      `;
      qaList.appendChild(item);
    });
  };

  const renderResults = (report) => {
    if (!resultsList) return;
    resultsList.innerHTML = "";
    report.results.forEach((r, idx) => {
      const item = document.createElement("div");
      item.className = "qa-item";
      const image = r.image_url ? `<img class="qa-item__image" src="${r.image_url}" alt="result" />` : "";
      item.innerHTML = `
        <div class="qa-item__title">${idx + 1}. ${r.title}</div>
        ${image}
        <div class="qa-item__answers">${r.description || "Описание не указано"}</div>
      `;
      resultsList.appendChild(item);
    });
  };

  const selectTest = async (id) => {
    activeTestId = id;
    renderTests(searchInput.value || "");
    emptyState.hidden = true;
    reportBox.hidden = false;
    const report = await fetchJson(`${API_BASE}/admin/tests/${id}/report`, {
      headers: { "X-Admin-Token": getToken() },
    });
    reportTitle.textContent = report.test.title;
    reportSlug.textContent = report.test.slug;
    const ownerName = report.test.created_by_username ? `@${report.test.created_by_username}` : "—";
    const ownerId = report.test.created_by ? `id:${report.test.created_by}` : "";
    reportOwner.textContent = `Создатель: ${ownerName} ${ownerId}`.trim();
    if (reportDate) {
      reportDate.textContent = report.test.created_at ? `Создан: ${report.test.created_at}` : "";
    }
    renderFunnel(report.funnel);
    renderResponses(report);
    renderQa(report);
    renderResults(report);
  };

  const loadTests = async () => {
    if (testsError) testsError.textContent = "";
    try {
      const data = await fetchJson(`${API_BASE}/admin/tests`, {
        headers: { "X-Admin-Token": getToken() },
      });
      tests = Array.isArray(data) ? data : [];
      renderTests();
    } catch (err) {
      tests = [];
      if (testsError) testsError.textContent = err.message || "Не удалось загрузить тесты";
    }
  };

  const setAuthState = (authed) => {
    loginBox.hidden = authed;
    testsBox.hidden = !authed;
    logoutBtn.hidden = !authed;
    if (!authed) {
      reportBox.hidden = true;
      emptyState.hidden = false;
    }
  };

  loginBtn.addEventListener("click", async () => {
    loginError.textContent = "";
    try {
      const res = await fetchJson(`${API_BASE}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUser.value.trim(), password: loginPass.value }),
      });
      setToken(res.token);
      setAuthState(true);
      await loadTests();
    } catch (err) {
      loginError.textContent = err.message || "Ошибка входа";
    }
  });

  logoutBtn.addEventListener("click", () => {
    setToken("");
    setAuthState(false);
  });

  searchInput.addEventListener("input", (e) => {
    renderTests(e.target.value || "");
  });

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const name = tab.getAttribute("data-tab");
      tabs.forEach((t) => t.classList.toggle("active", t === tab));
      panels.forEach((panel) => {
        const panelName = panel.getAttribute("data-panel");
        panel.classList.toggle("hidden", panelName !== name);
      });
    });
  });

  downloadBtn.addEventListener("click", async () => {
    if (!activeTestId) return;
    const res = await fetch(`${API_BASE}/admin/tests/${activeTestId}/export`, {
      headers: { "X-Admin-Token": getToken() },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `test-${activeTestId}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  });

  const init = async () => {
    const token = getToken();
    if (!token) return;
    setAuthState(true);
    try {
      await loadTests();
    } catch {
      setToken("");
      setAuthState(false);
    }
  };

  init();
})();
