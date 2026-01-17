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
  const responsesTable = document.getElementById("responsesTable");
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
    const total = rows[0]?.value || 0;
    let prev = total;
    funnelBox.innerHTML = rows
      .map((row) => {
        const pctTotal = total ? Math.round((row.value / total) * 100) : 0;
        const pctPrev = prev ? Math.round((row.value / prev) * 100) : 0;
        prev = row.value;
        const width = total ? Math.max(2, Math.round((row.value / total) * 100)) : 0;
        return `
          <div class="funnel-bar">
            <div class="funnel-bar__label">
              <span>${row.label}</span>
              <strong>${row.value}</strong>
            </div>
            <div class="funnel-bar__track">
              <div class="funnel-bar__fill" style="width:${width}%;"></div>
            </div>
            <div class="funnel-bar__meta">
              <span>от общего: ${pctTotal}%</span>
              <span>от предыдущего: ${pctPrev}%</span>
            </div>
          </div>
        `;
      })
      .join("");
  };

  const renderResponses = (report) => {
    if (!responsesTable) return;
    const { questions, responses, test } = report;
    const headers = ["telegram_id", "user", "result"];
    questions.forEach((q) => headers.push(q.text));
    if (test.lead_enabled) {
      if (test.lead_collect_name) headers.push("lead_name");
      if (test.lead_collect_phone) headers.push("lead_phone");
      if (test.lead_collect_email) headers.push("lead_email");
      if (test.lead_collect_site) {
        headers.push("lead_site");
        headers.push("site_clicked");
      }
    }
    const thead = `<thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>`;
    const rows = responses.map((r) => {
      const username = r.user_username ? `@${r.user_username}` : "";
      const fallbackId = r.user_id && r.user_id !== 0 ? `id:${r.user_id}` : "";
      const leadPhone = r.lead_phone ? `tel:${r.lead_phone}` : "";
      const identifier = username || leadPhone || fallbackId || "unknown";
      const cols = [r.user_id, identifier, r.result_title || ""];
      questions.forEach((q) => {
        cols.push(r.answers[String(q.id)] || "");
      });
      if (test.lead_enabled) {
        if (test.lead_collect_name) cols.push(r.lead_name || "");
        if (test.lead_collect_phone) cols.push(r.lead_phone || "");
        if (test.lead_collect_email) cols.push(r.lead_email || "");
        if (test.lead_collect_site) {
          cols.push(r.lead_site || "");
          cols.push(r.lead_site_clicked ? "yes" : "no");
        }
      }
      return `<tr>${cols.map((c) => `<td>${String(c)}</td>`).join("")}</tr>`;
    });
    responsesTable.innerHTML = thead + `<tbody>${rows.join("")}</tbody>`;
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
