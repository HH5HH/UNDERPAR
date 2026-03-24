const HEALTH_WORKSPACE_MESSAGE_TYPE = "underpar:health-workspace";

const state = {
  windowId: 0,
  controllerOnline: false,
  healthReady: false,
  programmerId: "",
  programmerName: "",
  requestorId: "",
  environmentKey: "",
  environmentLabel: "",
  environmentIndex: "",
  selectionKey: "",
  loading: false,
  report: null,
  tableResultsByKey: new Map(),
  tableOrder: [],
};

const els = {
  controllerState: document.getElementById("workspace-controller-state"),
  filterState: document.getElementById("workspace-filter-state"),
  status: document.getElementById("workspace-status"),
  rerunIndicator: document.getElementById("workspace-rerun-indicator"),
  rerunAllButton: document.getElementById("workspace-rerun-all"),
  clearButton: document.getElementById("workspace-clear-all"),
  cardsHost: document.getElementById("workspace-cards"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function firstNonEmptyString(values = []) {
  for (const value of Array.isArray(values) ? values : []) {
    const text = String(value ?? "").trim();
    if (text) {
      return text;
    }
  }
  return "";
}

function formatDateTime(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "N/A";
  }
  try {
    return new Date(numeric).toLocaleString();
  } catch {
    return "N/A";
  }
}

function getProgrammerLabel() {
  const name = String(state.programmerName || "").trim();
  const id = String(state.programmerId || "").trim();
  if (name && id && name !== id) {
    return `${name} (${id})`;
  }
  return name || id || "Selected Media Company";
}

function getFilterLabel() {
  const requestorId = String(state.requestorId || "").trim();
  const environmentLabel = String(state.environmentLabel || "").trim();
  const environmentIndex = String(state.environmentIndex || "").trim();
  if (!requestorId) {
    return "Select RequestorId in HEALTH > Status and click SPLUNK.";
  }
  return `Requestor: ${requestorId} | Env: ${environmentLabel || state.environmentKey || "N/A"} | Index: ${environmentIndex || "N/A"}`;
}

function setStatus(message = "", type = "info") {
  const text = String(message || "").trim();
  if (!els.status) {
    return;
  }
  const showError = type === "error" && Boolean(text);
  els.status.textContent = text;
  els.status.classList.toggle("error", showError);
  els.status.hidden = !text;
}

function hasRenderableReport() {
  return Boolean(state.report) || state.tableResultsByKey.size > 0;
}

function syncActionButtonsDisabled() {
  const disableRerun = state.loading || !hasRenderableReport();
  const disableClear = state.loading || !hasRenderableReport();
  document.body.classList.toggle("net-busy", state.loading);
  document.body.setAttribute("aria-busy", state.loading ? "true" : "false");
  if (els.rerunAllButton) {
    els.rerunAllButton.disabled = disableRerun;
    els.rerunAllButton.classList.toggle("net-busy", state.loading);
  }
  if (els.rerunIndicator) {
    els.rerunIndicator.hidden = !state.loading;
  }
  if (els.clearButton) {
    els.clearButton.disabled = disableClear;
  }
}

function updateControllerBanner() {
  if (els.controllerState) {
    els.controllerState.textContent = `HEALTH Workspace | ${getProgrammerLabel()}`;
  }
  if (els.filterState) {
    els.filterState.textContent = getFilterLabel();
  }
  syncActionButtonsDisabled();
}

function applyControllerState(payload = {}) {
  state.controllerOnline = payload?.controllerOnline === true;
  state.healthReady = payload?.healthReady === true;
  state.programmerId = String(payload?.programmerId || "");
  state.programmerName = String(payload?.programmerName || "");
  state.requestorId = String(payload?.requestorId || "");
  state.environmentKey = String(payload?.environmentKey || "");
  state.environmentLabel = String(payload?.environmentLabel || "");
  state.environmentIndex = String(payload?.environmentIndex || "");
  state.selectionKey = String(payload?.selectionKey || "");
  updateControllerBanner();
}

function setTableResult(table = null) {
  const key = String(table?.key || "").trim();
  if (!key) {
    return;
  }
  if (!state.tableOrder.includes(key)) {
    state.tableOrder.push(key);
  }
  state.tableResultsByKey.set(key, table);
}

function getRenderableTables() {
  if (Array.isArray(state.report?.tables) && state.report.tables.length > 0) {
    return state.report.tables.slice();
  }
  return state.tableOrder.map((key) => state.tableResultsByKey.get(key)).filter(Boolean);
}

function renderTableMarkup(table = null) {
  const columns = Array.isArray(table?.columns) ? table.columns.map((value) => String(value || "").trim()).filter(Boolean) : [];
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  if (table?.pending === true) {
    return '<p class="health-report-pending">Waiting for Splunk results...</p>';
  }
  if (table?.ok !== true && String(table?.error || "").trim()) {
    return `<p class="health-report-empty error">${escapeHtml(String(table?.error || "").trim())}</p>`;
  }
  if (columns.length === 0 || rows.length === 0) {
    return '<p class="health-report-empty">No rows returned for this HEALTH table.</p>';
  }
  const headerHtml = columns.map((columnName) => `<th>${escapeHtml(columnName)}</th>`).join("");
  const bodyHtml = rows
    .map((row) => {
      const cells = columns.map((columnName) => `<td>${escapeHtml(String(row?.[columnName] ?? ""))}</td>`).join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `
    <div class="rest-report-table-wrap">
      <table class="rest-report-table">
        <thead>
          <tr>${headerHtml}</tr>
        </thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    </div>
  `;
}

function renderTableCard(table = null) {
  const title = String(table?.title || "HEALTH Table").trim();
  const checkedAtLabel = formatDateTime(table?.checkedAt);
  const sid = String(table?.sid || "").trim();
  const columns = Array.isArray(table?.columns) ? table.columns.map((value) => String(value || "").trim()).filter(Boolean) : [];
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  const hasRows = columns.length > 0 && rows.length > 0;
  const hasError = table?.ok !== true && String(table?.error || "").trim();
  const isPending = table?.pending === true;
  const displayedRows = Number(table?.displayedRows || 0);
  const totalRows = Math.max(Number(table?.totalRows || 0), displayedRows);
  const rowSummary = totalRows > displayedRows ? `${displayedRows} shown of ${totalRows} rows` : `${displayedRows} row${displayedRows === 1 ? "" : "s"}`;
  const sectionStateLabel = isPending ? "Pending" : hasRows ? rowSummary : hasError ? "Issue" : "No rows";
  const defaultOpen = isPending || hasRows || hasError;
  const queryMarkup = String(table?.query || "").trim()
    ? `
      <details class="health-report-query">
        <summary>Query</summary>
        <code>${escapeHtml(String(table?.query || "").trim())}</code>
      </details>
    `
    : "";
  return `
    <details class="rest-report-card health-report-card health-report-collapsible${hasRows || isPending || hasError ? "" : " is-empty"}"${
      defaultOpen ? " open" : ""
    }>
      <summary class="health-report-summary">
        <div class="health-report-summary-copy">
          <p class="rest-report-title">${escapeHtml(title)}</p>
          <p class="rest-report-meta"><strong>Checked:</strong> ${escapeHtml(checkedAtLabel)} | <strong>SID:</strong> ${escapeHtml(
            sid || "N/A"
          )} | <strong>Rows:</strong> ${escapeHtml(rowSummary)}</p>
        </div>
        <span class="health-report-summary-pill">${escapeHtml(sectionStateLabel)}</span>
      </summary>
      <div class="health-report-card-body">
        ${queryMarkup}
        ${renderTableMarkup(table)}
      </div>
    </details>
  `;
}

function renderReport() {
  if (!els.cardsHost) {
    return;
  }
  const renderableTables = getRenderableTables();
  if (renderableTables.length === 0) {
    els.cardsHost.innerHTML =
      '<article class="rest-report-card"><p class="health-report-empty">No HEALTH Splunk report loaded yet.</p></article>';
    return;
  }

  const report = state.report && typeof state.report === "object" ? state.report : null;
  const checkedAtLabel = formatDateTime(report?.checkedAt);
  const summaryCopy = report?.pending === true
    ? firstNonEmptyString([
        report?.pendingMessage,
        "Waiting for Splunk sign-in/MFA to complete in the opened tab.",
      ])
    : report
      ? `${Number(report?.successCount || 0)} of ${Number(report?.totalTables || renderableTables.length)} tables loaded.`
      : `Loaded ${renderableTables.length} HEALTH tables.`;

  els.cardsHost.innerHTML = `
    <article class="rest-report-card health-report-overview">
      <header class="rest-report-head">
        <p class="rest-report-title">HEALTH Splunk Report</p>
        <p class="rest-report-meta"><strong>Checked:</strong> ${escapeHtml(checkedAtLabel)}</p>
        <p class="health-report-overview-copy">${escapeHtml(summaryCopy)}</p>
      </header>
    </article>
    <section class="health-report-grid">
      ${renderableTables.map((table) => renderTableCard(table)).join("")}
    </section>
  `;
}

function handleReportStart(payload = {}) {
  const selectionKey = String(payload?.selectionKey || "").trim();
  if (selectionKey && state.selectionKey && selectionKey !== state.selectionKey) {
    return;
  }
  state.loading = true;
  state.report = null;
  state.tableResultsByKey.clear();
  state.tableOrder = [];
  const tables = Array.isArray(payload?.tables) ? payload.tables : [];
  tables.forEach((table) => {
    const key = String(table?.key || "").trim();
    if (!key) {
      return;
    }
    state.tableOrder.push(key);
    state.tableResultsByKey.set(key, {
      key,
      title: String(table?.title || "").trim(),
      query: String(table?.query || "").trim(),
      pending: true,
      ok: null,
    });
  });
  renderReport();
  syncActionButtonsDisabled();
  setStatus("Running HEALTH Splunk tables...");
}

function handleTableResult(payload = {}) {
  const selectionKey = String(payload?.selectionKey || "").trim();
  if (selectionKey && state.selectionKey && selectionKey !== state.selectionKey) {
    return;
  }
  const table = payload?.table && typeof payload.table === "object" ? payload.table : null;
  if (!table) {
    return;
  }
  setTableResult(table);
  renderReport();
  const completedTables = Number(payload?.completedTables || 0);
  const totalTables = Number(payload?.totalTables || state.tableOrder.length || 0);
  if (completedTables > 0 && totalTables > 0) {
    setStatus(`Loaded ${completedTables}/${totalTables} HEALTH tables...`);
  }
}

function handleReportResult(payload = {}) {
  const selectionKey = String(payload?.selectionKey || "").trim();
  if (selectionKey && state.selectionKey && selectionKey !== state.selectionKey) {
    return;
  }
  state.loading = false;
  state.report = payload && typeof payload === "object" ? payload : null;
  state.tableResultsByKey.clear();
  state.tableOrder = [];
  if (Array.isArray(state.report?.tables)) {
    state.report.tables.forEach((table) => {
      setTableResult(table);
    });
  }
  renderReport();
  syncActionButtonsDisabled();
  if (!state.report) {
    setStatus("No HEALTH Splunk data returned.", "error");
    return;
  }
  if (state.report.ok === true) {
    setStatus(`Loaded ${Number(state.report?.successCount || 0)} HEALTH tables.`);
    return;
  }
  if (state.report.pending === true) {
    setStatus(
      firstNonEmptyString([
        state.report?.pendingMessage,
        "Waiting for Splunk sign-in/MFA to complete in the opened tab.",
      ])
    );
    return;
  }
  if (state.report.partial === true) {
    setStatus(`Loaded ${Number(state.report?.successCount || 0)}/${Number(state.report?.totalTables || 0)} HEALTH tables.`);
    return;
  }
  setStatus(String(state.report?.error || "HEALTH Splunk query failed."), "error");
}

function clearWorkspaceCards() {
  state.report = null;
  state.loading = false;
  state.tableResultsByKey.clear();
  state.tableOrder = [];
  renderReport();
  syncActionButtonsDisabled();
}

function handleWorkspaceEvent(eventName, payload = {}) {
  const event = String(eventName || "").trim();
  if (!event) {
    return;
  }
  if (event === "controller-state") {
    applyControllerState(payload);
    return;
  }
  if (event === "report-start") {
    handleReportStart(payload);
    return;
  }
  if (event === "table-result") {
    handleTableResult(payload);
    return;
  }
  if (event === "report-result") {
    handleReportResult(payload);
    return;
  }
  if (event === "environment-switch-rerun") {
    if (state.loading || !hasRenderableReport()) {
      return;
    }
    void rerunLatestReport();
    return;
  }
  if (event === "workspace-clear") {
    clearWorkspaceCards();
    setStatus("");
  }
}

async function sendWorkspaceAction(action, payload = {}) {
  try {
    return await chrome.runtime.sendMessage({
      type: HEALTH_WORKSPACE_MESSAGE_TYPE,
      channel: "workspace-action",
      action,
      ...payload,
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function rerunLatestReport() {
  if (state.loading) {
    return;
  }
  if (!hasRenderableReport()) {
    setStatus("No previous HEALTH Splunk report is available to refresh.", "error");
    return;
  }
  state.loading = true;
  syncActionButtonsDisabled();
  setStatus("Refreshing HEALTH Splunk report...");
  const result = await sendWorkspaceAction("refresh-latest", {
    selectionKey: String(state.selectionKey || "").trim(),
  });
  if (!result?.ok) {
    state.loading = false;
    syncActionButtonsDisabled();
    setStatus(String(result?.error || "Unable to refresh HEALTH Splunk report."), "error");
  }
}

function clearWorkspace() {
  clearWorkspaceCards();
  void sendWorkspaceAction("clear-all", {
    selectionKey: String(state.selectionKey || "").trim(),
  });
}

function registerEventHandlers() {
  if (els.rerunAllButton) {
    els.rerunAllButton.addEventListener("click", () => {
      void rerunLatestReport();
    });
  }
  if (els.clearButton) {
    els.clearButton.addEventListener("click", () => {
      clearWorkspace();
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== HEALTH_WORKSPACE_MESSAGE_TYPE || message?.channel !== "workspace-event") {
      return false;
    }
    const targetWindowId = Number(message?.targetWindowId || 0);
    if (targetWindowId > 0 && Number(state.windowId || 0) > 0 && targetWindowId !== Number(state.windowId)) {
      return false;
    }
    handleWorkspaceEvent(message?.event, message?.payload || {});
    return false;
  });
}

async function init() {
  try {
    const currentWindow = await chrome.windows.getCurrent();
    state.windowId = Number(currentWindow?.id || 0);
  } catch {
    state.windowId = 0;
  }
  registerEventHandlers();
  updateControllerBanner();
  renderReport();
  const result = await sendWorkspaceAction("workspace-ready");
  if (!result?.ok) {
    setStatus(result?.error || "Unable to contact UnderPAR HEALTH controller.", "error");
  }
}

void init();
