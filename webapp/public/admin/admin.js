(() => {
  const API_BASE = "/api/v1";
  const tokenKey = "adminToken";

  const loginBox = document.getElementById("loginBox");
  const testsBox = document.getElementById("testsBox");
  const testsList = document.getElementById("testsList");
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
  const funnelBox = document.getElementById("funnelBox");
  const responsesTable = document.getElementById("responsesTable");
  const downloadBtn = document.getElementById("downloadBtn");

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
    const filtered = tests.filter((t) => t.title.toLowerCase().includes(filter.toLowerCase()));
    filtered.forEach((t) => {
      const item = document.createElement("div");
      item.className = "test-item" + (t.id === activeTestId ? " active" : "");
      item.textContent = t.title;
      item.addEventListener("click", () => selectTest(t.id));
      testsList.appendChild(item);
    });
  };

  const renderFunnel = (funnel) => {
    funnelBox.innerHTML = "";
    const rows = [
      { label: "Заходов на экран 1", value: funnel.screen_opens },
      ...funnel.answers.map((a) => ({ label: `Ответов ${a.question_index}`, value: a.count })),
      { label: "Отправлено лид-форм", value: funnel.lead_form_submits },
      { label: "Клики по сайту", value: funnel.site_clicks },
    ];
    rows.forEach((row) => {
      const div = document.createElement("div");
      div.className = "funnel__row";
      div.innerHTML = `<span>${row.label}</span><strong>${row.value}</strong>`;
      funnelBox.appendChild(div);
    });
  };

  const renderTable = (report) => {
    const { questions, responses, test } = report;
    const headers = ["telegram_id", "result"];
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
      const cols = [r.user_id, r.result_title || ""];
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
    renderFunnel(report.funnel);
    renderTable(report);
  };

  const loadTests = async () => {
    const data = await fetchJson(`${API_BASE}/admin/tests`, {
      headers: { "X-Admin-Token": getToken() },
    });
    tests = data || [];
    renderTests();
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
      loginBox.hidden = true;
      testsBox.hidden = false;
      logoutBtn.hidden = false;
      await loadTests();
    } catch (err) {
      loginError.textContent = err.message || "Ошибка входа";
    }
  });

  logoutBtn.addEventListener("click", () => {
    setToken("");
    loginBox.hidden = false;
    testsBox.hidden = true;
    logoutBtn.hidden = true;
    reportBox.hidden = true;
    emptyState.hidden = false;
  });

  searchInput.addEventListener("input", (e) => {
    renderTests(e.target.value || "");
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
    loginBox.hidden = true;
    testsBox.hidden = false;
    logoutBtn.hidden = false;
    try {
      await loadTests();
    } catch {
      setToken("");
      loginBox.hidden = false;
      testsBox.hidden = true;
      logoutBtn.hidden = true;
    }
  };

  init();
})();
