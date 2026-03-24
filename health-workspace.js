const HEALTH_WORKSPACE_MESSAGE_TYPE = "underpar:health-workspace";
const HEALTH_SPLUNK_ESM_BRIDGE_TABLE_KEY = "sev2_mvpd_error_codes";

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
  esmBridgeResultsByTableKey: new Map(),
  bridgeLoadSequence: 0,
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

function normalizeStringArray(values = []) {
  const source = Array.isArray(values) ? values : [values];
  return Array.from(
    new Set(
      source
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );
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
    els.controllerState.textContent = `SPLUNK HEALTH Dashboard | ${getProgrammerLabel()}`;
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

function isEsmBridgeTableKey(tableKey = "") {
  return String(tableKey || "").trim() === HEALTH_SPLUNK_ESM_BRIDGE_TABLE_KEY;
}

function isEsmBridgeTable(table = null) {
  return isEsmBridgeTableKey(table?.key);
}

function getEsmBridgeResult(tableKey = "") {
  const normalizedTableKey = String(tableKey || "").trim();
  return normalizedTableKey ? state.esmBridgeResultsByTableKey.get(normalizedTableKey) || null : null;
}

function setEsmBridgeResult(tableKey = "", payload = null) {
  const normalizedTableKey = String(tableKey || "").trim();
  if (!normalizedTableKey) {
    return;
  }
  if (payload && typeof payload === "object") {
    state.esmBridgeResultsByTableKey.set(normalizedTableKey, payload);
    return;
  }
  state.esmBridgeResultsByTableKey.delete(normalizedTableKey);
}

function getRenderableTables() {
  if (Array.isArray(state.report?.tables) && state.report.tables.length > 0) {
    return state.report.tables.slice();
  }
  return state.tableOrder.map((key) => state.tableResultsByKey.get(key)).filter(Boolean);
}

function renderTableMarkup(table = null, options = {}) {
  const columns = Array.isArray(table?.columns) ? table.columns.map((value) => String(value || "").trim()).filter(Boolean) : [];
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  const tableClassName = String(options?.tableClassName || "").trim();
  const emptyMessage = String(options?.emptyMessage || "No rows returned for this HEALTH table.").trim();
  const pendingMessage = String(options?.pendingMessage || "Waiting for Splunk results...").trim();
  if (table?.pending === true) {
    return `<p class="health-report-pending">${escapeHtml(pendingMessage)}</p>`;
  }
  if (table?.ok !== true && String(table?.error || "").trim()) {
    return `<p class="health-report-empty error">${escapeHtml(String(table?.error || "").trim())}</p>`;
  }
  if (columns.length === 0 || rows.length === 0) {
    return `<p class="health-report-empty">${escapeHtml(emptyMessage)}</p>`;
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
      <table class="rest-report-table${tableClassName ? ` ${escapeHtml(tableClassName)}` : ""}">
        <thead>
          <tr>${headerHtml}</tr>
        </thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    </div>
  `;
}

function renderEsmBridgeAction(table = null) {
  if (!isEsmBridgeTable(table)) {
    return "";
  }
  const bridgeState = getEsmBridgeResult(table?.key);
  const columns = Array.isArray(table?.columns) ? table.columns.map((value) => String(value || "").trim()).filter(Boolean) : [];
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  const hasRows = columns.length > 0 && rows.length > 0;
  const isLoading = bridgeState?.loading === true;
  const disabled = isLoading || !hasRows || table?.pending === true || table?.ok === false;
  const label = isLoading ? "Loading..." : bridgeState?.ok === true ? "Refresh ESM" : "ESM xref";
  const hoverText = !hasRows
    ? "No Splunk rows are available to cross-reference into ESM."
    : isLoading
      ? "Loading ESM cross-reference rows for this Splunk report."
      : "Cross-reference this Splunk MVPD error result set against the live ESM v3 event tree.";
  return `
    <button
      type="button"
      class="health-report-summary-action-btn"
      data-health-esm-bridge-action="load"
      data-health-esm-bridge-table-key="${escapeHtml(String(table?.key || "").trim())}"
      title="${escapeHtml(hoverText)}"
      aria-label="${escapeHtml(hoverText)}"
      ${disabled ? "disabled" : ""}
    >${escapeHtml(label)}</button>
  `;
}

function renderEsmBridgeResult(table = null) {
  if (!isEsmBridgeTable(table)) {
    return "";
  }
  const bridgeState = getEsmBridgeResult(table?.key);
  if (!bridgeState) {
    return "";
  }

  const requestorIds = normalizeStringArray(bridgeState?.queryContext?.requestorIds);
  const mvpdIds = normalizeStringArray(bridgeState?.queryContext?.mvpdIds);
  const events = normalizeStringArray(bridgeState?.queryContext?.events);
  const metaLine = [
    bridgeState?.queryContext?.sourceWindowStart && bridgeState?.queryContext?.sourceWindowEnd
      ? `${bridgeState.queryContext.sourceWindowStart} -> ${bridgeState.queryContext.sourceWindowEnd}`
      : "",
    requestorIds.length > 0 ? `Requestor ${requestorIds.join(", ")}` : "",
    mvpdIds.length > 0 ? `MVPD ${mvpdIds.join(", ")}` : "",
    events.length > 0 ? `Event ${events.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const bridgeTable = {
    ok: bridgeState.loading !== true && bridgeState.ok !== false,
    pending: bridgeState.loading === true,
    error: String(bridgeState?.error || "").trim(),
    columns: Array.isArray(bridgeState?.columns) ? bridgeState.columns : [],
    rows: Array.isArray(bridgeState?.rows) ? bridgeState.rows : [],
  };

  return `
    <section class="health-report-bridge${bridgeState.loading === true ? " is-loading" : ""}">
      <header class="health-report-bridge-head">
        <div class="health-report-bridge-copy">
          <p class="health-report-bridge-title">${escapeHtml(String(bridgeState?.title || "ESM xref").trim())}</p>
          <p class="health-report-bridge-subtitle">${escapeHtml(
            firstNonEmptyString([
              bridgeState?.subtitle,
              "Cross-referenced from Splunk MVPD error rows into the live ESM v3 event tree.",
            ])
          )}</p>
          ${metaLine ? `<p class="health-report-bridge-meta">${escapeHtml(metaLine)}</p>` : ""}
        </div>
        <span class="health-report-bridge-pill">${
          bridgeState.loading === true
            ? "Loading"
            : bridgeState.ok === true
              ? `${Number(bridgeState?.totalRows || 0)} row${Number(bridgeState?.totalRows || 0) === 1 ? "" : "s"}`
              : "Issue"
        }</span>
      </header>
      ${renderTableMarkup(bridgeTable, {
        tableClassName: "health-report-bridge-table",
        emptyMessage: "No ESM rows matched the Splunk-scoped bridge query.",
        pendingMessage: "Loading ESM cross-reference rows...",
      })}
      ${
        bridgeState?.requestUrl
          ? `<p class="health-report-bridge-query">${escapeHtml(String(bridgeState.requestUrl || "").trim())}</p>`
          : ""
      }
    </section>
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
        <div class="health-report-summary-actions">
          ${renderEsmBridgeAction(table)}
          <span class="health-report-summary-pill">${escapeHtml(sectionStateLabel)}</span>
        </div>
      </summary>
      <div class="health-report-card-body">
        ${queryMarkup}
        ${renderTableMarkup(table)}
        ${renderEsmBridgeResult(table)}
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
      '<article class="rest-report-card"><p class="health-report-empty">No SPLUNK HEALTH report loaded yet.</p></article>';
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
      : `Loaded ${renderableTables.length} SPLUNK HEALTH tables.`;

  els.cardsHost.innerHTML = `
    <article class="rest-report-card health-report-overview">
      <header class="rest-report-head">
        <p class="rest-report-title">SPLUNK HEALTH Dashboard</p>
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
  state.esmBridgeResultsByTableKey.clear();
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
  state.esmBridgeResultsByTableKey.clear();
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
  state.esmBridgeResultsByTableKey.clear();
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

async function loadEsmBridgeForTable(tableKey = "") {
  const normalizedTableKey = String(tableKey || "").trim();
  if (!normalizedTableKey || state.loading || !isEsmBridgeTableKey(normalizedTableKey)) {
    return;
  }
  const table = state.tableResultsByKey.get(normalizedTableKey) || null;
  const columns = Array.isArray(table?.columns) ? table.columns.map((value) => String(value || "").trim()).filter(Boolean) : [];
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  if (columns.length === 0 || rows.length === 0) {
    return;
  }

  const requestId = state.bridgeLoadSequence + 1;
  state.bridgeLoadSequence = requestId;
  setEsmBridgeResult(normalizedTableKey, {
    loading: true,
    ok: false,
    title: "ESM xref",
    subtitle: "Cross-referencing the current Splunk MVPD error rows against ESM v3.",
    queryContext: {},
    columns: [],
    rows: [],
    totalRows: 0,
    error: "",
  });
  renderReport();

  const requestSelectionKey = String(state.selectionKey || "").trim();
  const result = await sendWorkspaceAction("load-esm-bridge", {
    selectionKey: requestSelectionKey,
    tableKey: normalizedTableKey,
  });
  if (requestId !== state.bridgeLoadSequence || requestSelectionKey !== String(state.selectionKey || "").trim()) {
    return;
  }

  const bridgePayload = result?.bridge && typeof result.bridge === "object"
    ? result.bridge
    : {
        ok: false,
        title: "ESM xref",
        subtitle: "Cross-referenced from Splunk MVPD error rows into the live ESM v3 event tree.",
        queryContext: {},
        columns: [],
        rows: [],
        totalRows: 0,
        error: String(result?.error || "Unable to load the ESM cross-reference.").trim(),
      };
  setEsmBridgeResult(normalizedTableKey, {
    ...bridgePayload,
    loading: false,
    ok: result?.ok === true,
  });
  renderReport();
  if (result?.ok) {
    setStatus(`Loaded ESM xref (${Number(bridgePayload?.totalRows || 0)} row${Number(bridgePayload?.totalRows || 0) === 1 ? "" : "s"}).`);
    return;
  }
  setStatus(String(result?.error || "Unable to load the ESM cross-reference."), "error");
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
  if (els.cardsHost) {
    els.cardsHost.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("[data-health-esm-bridge-action]") : null;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      void loadEsmBridgeForTable(target.dataset.healthEsmBridgeTableKey || "");
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
