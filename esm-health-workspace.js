const ESM_HEALTH_WORKSPACE_MESSAGE_TYPE = "underpar:esm-health-workspace";

const state = {
  windowId: 0,
  controllerOnline: false,
  esmHealthReady: false,
  programmerId: "",
  programmerName: "",
  mediaCompany: "",
  requestorIds: [],
  mvpdIds: [],
  platforms: [],
  environmentKey: "",
  environmentLabel: "",
  selectionKey: "",
  defaultStart: "",
  defaultEnd: "",
  defaultGranularity: "day",
  timezoneLabel: "PST effective",
  platformOptions: [],
  loading: false,
  report: null,
  query: {
    initialized: false,
    controllerSelectionKey: "",
    start: "",
    end: "",
    granularity: "day",
    baseRequestorIds: [],
    baseMvpdIds: [],
    drilldownRequestorIds: [],
    drilldownMvpdIds: [],
    platforms: [],
  },
};

const els = {
  controllerState: document.getElementById("workspace-controller-state"),
  filterState: document.getElementById("workspace-filter-state"),
  status: document.getElementById("workspace-status"),
  rerunIndicator: document.getElementById("workspace-rerun-indicator"),
  rerunAllButton: document.getElementById("workspace-rerun-all"),
  clearButton: document.getElementById("workspace-clear-all"),
  filterForm: document.getElementById("workspace-filter-form"),
  startDateInput: document.getElementById("workspace-start-date"),
  endDateInput: document.getElementById("workspace-end-date"),
  granularityGroup: document.getElementById("workspace-granularity-group"),
  runButton: document.getElementById("workspace-run-dashboard"),
  resetButton: document.getElementById("workspace-reset-filters"),
  activePills: document.getElementById("workspace-active-pills"),
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

function normalizeStringList(values = []) {
  const source = Array.isArray(values) ? values : [values];
  const output = [];
  source.forEach((entry) => {
    const normalized = String(entry || "").trim();
    if (normalized && !output.includes(normalized)) {
      output.push(normalized);
    }
  });
  return output;
}

function normalizeGranularity(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "hour" || normalized === "month" ? normalized : "day";
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

function formatCompactNumber(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return "0";
  }
  try {
    return new Intl.NumberFormat("en-US", {
      notation: Math.abs(numeric) >= 1000 ? "compact" : "standard",
      maximumFractionDigits: Math.abs(numeric) >= 1000 ? 1 : 0,
    }).format(numeric);
  } catch {
    return String(Math.round(numeric));
  }
}

function formatPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "—";
  }
  return `${(numeric * 100).toFixed(1)}%`;
}

function formatLatency(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "—";
  }
  return `${numeric.toFixed(0)} ms`;
}

function getProgrammerLabel() {
  const name = String(state.programmerName || "").trim();
  const id = String(state.programmerId || "").trim();
  if (name && id && name !== id) {
    return `${name} (${id})`;
  }
  return name || id || "Selected Media Company";
}

function getEffectiveRequestorIds() {
  return state.query.drilldownRequestorIds.length > 0 ? state.query.drilldownRequestorIds.slice() : state.query.baseRequestorIds.slice();
}

function getEffectiveMvpdIds() {
  return state.query.drilldownMvpdIds.length > 0 ? state.query.drilldownMvpdIds.slice() : state.query.baseMvpdIds.slice();
}

function getFilterLabel() {
  const requestorLabel = getEffectiveRequestorIds().join(", ") || "All RequestorIds";
  const mvpdLabel = getEffectiveMvpdIds().join(", ") || "All MVPDs";
  const environmentLabel = String(state.environmentLabel || state.environmentKey || "N/A").trim();
  return `Env: ${environmentLabel} | RequestorId: ${requestorLabel} | MVPD: ${mvpdLabel} | ${state.timezoneLabel || "PST effective"}`;
}

function setStatus(message = "", type = "info") {
  if (!els.status) {
    return;
  }
  const text = String(message || "").trim();
  els.status.textContent = text;
  els.status.hidden = !text;
  els.status.classList.toggle("error", type === "error" && Boolean(text));
}

function hasRenderableReport() {
  return Boolean(state.report);
}

function updateGranularityButtons() {
  const buttons = els.granularityGroup?.querySelectorAll("[data-granularity]") || [];
  buttons.forEach((button) => {
    const value = String(button.getAttribute("data-granularity") || "").trim().toLowerCase();
    button.classList.toggle("is-active", value === normalizeGranularity(state.query.granularity));
    button.disabled = state.loading;
  });
}

function renderActivePills() {
  if (!els.activePills) {
    return;
  }
  const pills = [
    { label: "Media Company", value: state.mediaCompany || state.programmerId || "N/A", accent: true },
    { label: "Global Requestor", value: state.query.baseRequestorIds.join(", ") || "All" },
    { label: "Global MVPD", value: state.query.baseMvpdIds.join(", ") || "All" },
    { label: "Active Requestor", value: state.query.drilldownRequestorIds.join(", ") || "Global scope" },
    { label: "Active MVPD", value: state.query.drilldownMvpdIds.join(", ") || "Global scope" },
    { label: "Platforms", value: state.query.platforms.join(", ") || "All" },
    { label: "Range", value: `${state.query.start || "?"} -> ${state.query.end || "?"}` },
    { label: "Granularity", value: normalizeGranularity(state.query.granularity) },
  ];
  els.activePills.innerHTML = pills
    .map(
      (pill) =>
        `<span class="esm-health-pill${pill.accent ? " esm-health-pill--accent" : ""}"><strong>${escapeHtml(
          pill.label
        )}:</strong> ${escapeHtml(String(pill.value || "").trim() || "N/A")}</span>`
    )
    .join("");
}

function syncActionButtonsDisabled() {
  const hasValidDates = Boolean(String(state.query.start || "").trim() && String(state.query.end || "").trim());
  if (els.rerunAllButton) {
    els.rerunAllButton.disabled = state.loading || !hasRenderableReport();
    els.rerunAllButton.classList.toggle("net-busy", state.loading);
  }
  if (els.rerunIndicator) {
    els.rerunIndicator.hidden = !state.loading;
  }
  if (els.clearButton) {
    els.clearButton.disabled = state.loading || !hasRenderableReport();
  }
  if (els.runButton) {
    els.runButton.disabled = state.loading || !state.esmHealthReady || !hasValidDates;
  }
  if (els.resetButton) {
    els.resetButton.disabled = state.loading || !state.query.initialized;
  }
  if (els.startDateInput) {
    els.startDateInput.disabled = state.loading || !state.esmHealthReady;
  }
  if (els.endDateInput) {
    els.endDateInput.disabled = state.loading || !state.esmHealthReady;
  }
  document.body.classList.toggle("net-busy", state.loading);
  document.body.setAttribute("aria-busy", state.loading ? "true" : "false");
  updateGranularityButtons();
}

function updateControllerBanner() {
  if (els.controllerState) {
    els.controllerState.textContent = `ESM HEALTH Dashboard | ${getProgrammerLabel()}`;
  }
  if (els.filterState) {
    els.filterState.textContent = getFilterLabel();
  }
  syncActionButtonsDisabled();
}

function resetQueryToControllerDefaults() {
  state.query = {
    initialized: true,
    controllerSelectionKey: String(state.selectionKey || "").trim(),
    start: String(state.defaultStart || "").trim(),
    end: String(state.defaultEnd || "").trim(),
    granularity: normalizeGranularity(state.defaultGranularity),
    baseRequestorIds: normalizeStringList(state.requestorIds),
    baseMvpdIds: normalizeStringList(state.mvpdIds),
    drilldownRequestorIds: [],
    drilldownMvpdIds: [],
    platforms: normalizeStringList(state.platforms),
  };
}

function syncFilterControlsFromState() {
  if (els.startDateInput) {
    els.startDateInput.value = String(state.query.start || "").trim();
  }
  if (els.endDateInput) {
    els.endDateInput.value = String(state.query.end || "").trim();
  }
  renderActivePills();
  syncActionButtonsDisabled();
}

function applyControllerState(payload = {}) {
  const nextSelectionKey = String(payload?.selectionKey || "").trim();
  const controllerChanged =
    !state.query.initialized ||
    nextSelectionKey !== String(state.query.controllerSelectionKey || "").trim() ||
    String(payload?.programmerId || "").trim() !== String(state.programmerId || "").trim();

  state.controllerOnline = payload?.controllerOnline === true;
  state.esmHealthReady = payload?.esmHealthReady === true;
  state.programmerId = String(payload?.programmerId || "");
  state.programmerName = String(payload?.programmerName || "");
  state.mediaCompany = String(payload?.mediaCompany || "");
  state.requestorIds = normalizeStringList(payload?.requestorIds);
  state.mvpdIds = normalizeStringList(payload?.mvpdIds);
  state.platforms = normalizeStringList(payload?.platforms);
  state.environmentKey = String(payload?.environmentKey || "");
  state.environmentLabel = String(payload?.environmentLabel || "");
  state.selectionKey = nextSelectionKey;
  state.defaultStart = String(payload?.defaultStart || "");
  state.defaultEnd = String(payload?.defaultEnd || "");
  state.defaultGranularity = normalizeGranularity(payload?.defaultGranularity);
  state.timezoneLabel = String(payload?.timezoneLabel || "PST effective");
  state.platformOptions = normalizeStringList(payload?.platformOptions);

  if (controllerChanged) {
    resetQueryToControllerDefaults();
  }
  syncFilterControlsFromState();
  updateControllerBanner();
}

function buildQueryContextPayload() {
  return {
    programmerId: String(state.programmerId || "").trim(),
    programmerName: String(state.programmerName || "").trim(),
    baseRequestorIds: state.query.baseRequestorIds.slice(),
    baseMvpdIds: state.query.baseMvpdIds.slice(),
    drilldownRequestorIds: state.query.drilldownRequestorIds.slice(),
    drilldownMvpdIds: state.query.drilldownMvpdIds.slice(),
    platforms: state.query.platforms.slice(),
    start: String(state.query.start || "").trim(),
    end: String(state.query.end || "").trim(),
    granularity: normalizeGranularity(state.query.granularity),
  };
}

function syncQueryFromReport(payload = {}) {
  const queryContext = payload?.queryContext && typeof payload.queryContext === "object" ? payload.queryContext : null;
  if (!queryContext) {
    return;
  }
  state.query = {
    initialized: true,
    controllerSelectionKey: String(state.selectionKey || "").trim(),
    start: String(queryContext?.start || state.defaultStart || "").trim(),
    end: String(queryContext?.end || state.defaultEnd || "").trim(),
    granularity: normalizeGranularity(queryContext?.granularity || state.defaultGranularity),
    baseRequestorIds: normalizeStringList(queryContext?.baseRequestorIds || state.requestorIds),
    baseMvpdIds: normalizeStringList(queryContext?.baseMvpdIds || state.mvpdIds),
    drilldownRequestorIds: normalizeStringList(queryContext?.drilldownRequestorIds),
    drilldownMvpdIds: normalizeStringList(queryContext?.drilldownMvpdIds),
    platforms: normalizeStringList(queryContext?.platforms),
  };
  syncFilterControlsFromState();
}

function buildSparklineSvg(series = [], valueAccessor = () => 0) {
  const points = (Array.isArray(series) ? series : [])
    .map((entry) => ({
      label: String(entry?.label || "").trim(),
      value: Number(valueAccessor(entry)),
    }))
    .filter((entry) => Number.isFinite(entry.value));
  if (points.length === 0) {
    return '<p class="esm-health-empty-copy">No datapoints returned for this chart.</p>';
  }
  const width = 620;
  const height = 118;
  const insetX = 16;
  const insetY = 12;
  const maxValue = Math.max(
    1,
    ...points.map((entry) => entry.value)
  );
  const plotWidth = width - insetX * 2;
  const plotHeight = height - insetY * 2;
  const coordinateList = points.map((entry, index) => {
    const x = points.length === 1 ? width / 2 : insetX + (plotWidth * index) / (points.length - 1);
    const y = height - insetY - (Math.max(0, entry.value) / maxValue) * plotHeight;
    return {
      x,
      y,
    };
  });
  const polylinePoints = coordinateList.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const areaPoints = [`${insetX},${height - insetY}`, polylinePoints, `${width - insetX},${height - insetY}`].join(" ");
  const lastPoint = coordinateList[coordinateList.length - 1];

  return `
    <svg class="esm-health-sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <line class="grid-line" x1="${insetX}" y1="${insetY}" x2="${width - insetX}" y2="${insetY}" />
      <line class="grid-line" x1="${insetX}" y1="${height / 2}" x2="${width - insetX}" y2="${height / 2}" />
      <line class="grid-line" x1="${insetX}" y1="${height - insetY}" x2="${width - insetX}" y2="${height - insetY}" />
      <polygon class="area-fill" points="${areaPoints}" />
      <polyline class="line-stroke" points="${polylinePoints}" />
      <circle class="point-dot" cx="${lastPoint.x.toFixed(2)}" cy="${lastPoint.y.toFixed(2)}" r="3.6" />
    </svg>
  `;
}

function renderChartCard(title, latestValue, summary, series, valueAccessor, formatter, errorText = "") {
  const latestDisplay = formatter(latestValue);
  return `
    <article class="rest-report-card esm-health-chart-card">
      <header class="rest-report-head">
        <p class="rest-report-title">${escapeHtml(title)}</p>
        <p class="esm-health-chart-summary">${escapeHtml(latestDisplay)}</p>
        <p class="esm-health-chart-meta">${escapeHtml(summary)}</p>
        ${errorText ? `<p class="esm-health-chart-meta esm-health-section-error">${escapeHtml(errorText)}</p>` : ""}
      </header>
      <div class="esm-health-chart-wrap">
        ${buildSparklineSvg(series, valueAccessor)}
      </div>
    </article>
  `;
}

function renderReachCard(report = null) {
  const uniqueSeries = Array.isArray(report?.uniqueSeries) ? report.uniqueSeries : [];
  const latest = uniqueSeries.length > 0 ? uniqueSeries[uniqueSeries.length - 1] : null;
  const errorText = String(report?.sectionErrors?.uniques || "").trim();
  return `
    <article class="rest-report-card esm-health-chart-card">
      <header class="rest-report-head">
        <p class="rest-report-title">Unique Accounts &amp; Sessions</p>
        <p class="esm-health-chart-summary">${escapeHtml(String(latest?.label || "Daily uniques").trim() || "Daily uniques")}</p>
        <p class="esm-health-chart-meta">Reach is shown only at daily granularity and summed across dc.</p>
        ${errorText ? `<p class="esm-health-chart-meta esm-health-section-error">${escapeHtml(errorText)}</p>` : ""}
      </header>
      <div class="esm-health-reach-grid">
        <article class="esm-health-reach-stat">
          <p class="esm-health-kpi-label">Accounts</p>
          <p class="esm-health-reach-value">${escapeHtml(formatCompactNumber(latest?.uniqueAccounts || 0))}</p>
        </article>
        <article class="esm-health-reach-stat">
          <p class="esm-health-kpi-label">Sessions</p>
          <p class="esm-health-reach-value">${escapeHtml(formatCompactNumber(latest?.uniqueSessions || 0))}</p>
        </article>
      </div>
      <div class="esm-health-chart-wrap">
        ${buildSparklineSvg(uniqueSeries, (entry) => Number(entry?.uniqueSessions || 0))}
      </div>
    </article>
  `;
}

function renderBreakdownTable(title, copy, rows = [], columns = [], errorText = "") {
  if (!Array.isArray(rows) || rows.length === 0) {
    return `
      <article class="rest-report-card esm-health-table-card">
        <header class="rest-report-head">
          <p class="rest-report-title">${escapeHtml(title)}</p>
        </header>
        <p class="esm-health-table-copy ${errorText ? "esm-health-section-error" : ""}">${escapeHtml(
          errorText || "No rows returned for this hotspot view."
        )}</p>
      </article>
    `;
  }

  const headerHtml = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
  const bodyHtml = rows
    .map((row) => {
      const cells = columns
        .map((column) => {
          const rawValue = row?.[column.key];
          let display = "";
          if (column.type === "percent") {
            display = formatPercent(rawValue);
          } else if (column.type === "latency") {
            display = formatLatency(rawValue);
          } else if (column.type === "number") {
            display = formatCompactNumber(rawValue);
          } else {
            display = String(rawValue ?? "");
          }
          if (column.drillType) {
            return `<td><button type="button" class="esm-health-table-drill-btn" data-drill-type="${escapeHtml(
              column.drillType
            )}" data-drill-value="${escapeHtml(String(rawValue ?? ""))}">${escapeHtml(display || "—")}</button></td>`;
          }
          return `<td>${escapeHtml(display || "—")}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `
    <article class="rest-report-card esm-health-table-card">
      <header class="rest-report-head">
        <p class="rest-report-title">${escapeHtml(title)}</p>
      </header>
      <p class="esm-health-table-copy ${errorText ? "esm-health-section-error" : ""}">${escapeHtml(copy)}</p>
      <div class="esm-health-table-wrap">
        <table class="esm-health-table">
          <thead>
            <tr>${headerHtml}</tr>
          </thead>
          <tbody>${bodyHtml}</tbody>
        </table>
      </div>
    </article>
  `;
}

function renderReport() {
  if (!els.cardsHost) {
    return;
  }
  const report = state.report;
  if (!report || typeof report !== "object") {
    els.cardsHost.innerHTML =
      '<article class="rest-report-card"><header class="rest-report-head"><p class="rest-report-title">ESM HEALTH Dashboard</p></header><p class="esm-health-table-copy">No ESM HEALTH report loaded yet.</p></article>';
    return;
  }

  const summary = report?.summary && typeof report.summary === "object" ? report.summary : {};
  const backboneSeries = Array.isArray(report?.backboneSeries) ? report.backboneSeries : [];
  const latestBackbone = backboneSeries.length > 0 ? backboneSeries[backboneSeries.length - 1] : null;
  const checkedAtLabel = formatDateTime(report?.checkedAt);
  const sectionSummary = `${Number(report?.loadedSections || 0)}/${Number(report?.totalSections || 0)} sections loaded`;
  const introCopy = `${String(report?.queryContext?.start || "").trim() || "?"} -> ${String(
    report?.queryContext?.end || ""
  ).trim() || "?"} | ${String(report?.queryContext?.timezoneLabel || state.timezoneLabel || "PST effective").trim()}`;

  els.cardsHost.innerHTML = `
    <article class="rest-report-card">
      <header class="rest-report-head">
        <p class="rest-report-title">ESM HEALTH Overview</p>
        <p class="rest-report-meta"><strong>Checked:</strong> ${escapeHtml(checkedAtLabel)} | <strong>Range:</strong> ${escapeHtml(
          introCopy
        )} | <strong>Status:</strong> ${escapeHtml(sectionSummary)}</p>
        <p class="esm-health-overview-copy">${escapeHtml(
          report?.partial === true
            ? "Dashboard loaded with partial data. Sections with failures are flagged below."
            : "Dashboard loaded from ESM v3 using the current UnderPAR context."
        )}</p>
        ${report?.error ? `<p class="esm-health-overview-copy esm-health-section-error">${escapeHtml(report.error)}</p>` : ""}
      </header>
    </article>

    <section class="esm-health-kpi-grid">
      <article class="rest-report-card esm-health-kpi-card">
        <header class="rest-report-head">
          <p class="esm-health-kpi-label">Play Requests</p>
          <p class="esm-health-kpi-value">${escapeHtml(formatCompactNumber(summary.playRequests || 0))}</p>
          <p class="esm-health-overview-copy">Total media token volume for the selected window.</p>
        </header>
      </article>
      <article class="rest-report-card esm-health-kpi-card">
        <header class="rest-report-head">
          <p class="esm-health-kpi-label">AuthN Conversion</p>
          <p class="esm-health-kpi-value">${escapeHtml(formatPercent(summary.authnConversion))}</p>
          <p class="esm-health-overview-copy">${escapeHtml(
            `${formatCompactNumber(summary.authnSuccessful || 0)} successful of ${formatCompactNumber(summary.authnAttempts || 0)} attempts`
          )}</p>
        </header>
      </article>
      <article class="rest-report-card esm-health-kpi-card">
        <header class="rest-report-head">
          <p class="esm-health-kpi-label">AuthZ Conversion</p>
          <p class="esm-health-kpi-value">${escapeHtml(formatPercent(summary.authzConversion))}</p>
          <p class="esm-health-overview-copy">${escapeHtml(
            `${formatCompactNumber(summary.authzSuccessful || 0)} successful of ${formatCompactNumber(summary.authzAttempts || 0)} attempts`
          )}</p>
        </header>
      </article>
      <article class="rest-report-card esm-health-kpi-card">
        <header class="rest-report-head">
          <p class="esm-health-kpi-label">AuthZ Error Rate</p>
          <p class="esm-health-kpi-value">${escapeHtml(formatPercent(summary.authzErrorRate))}</p>
          <p class="esm-health-overview-copy">${escapeHtml(
            `${formatCompactNumber((summary.authzFailed || 0) + (summary.authzRejected || 0))} failed or rejected authorizations`
          )}</p>
        </header>
      </article>
      <article class="rest-report-card esm-health-kpi-card">
        <header class="rest-report-head">
          <p class="esm-health-kpi-label">Avg AuthZ Latency</p>
          <p class="esm-health-kpi-value">${escapeHtml(formatLatency(summary.avgAuthzLatency))}</p>
          <p class="esm-health-overview-copy">Calculated from successful and failed authorization responses.</p>
        </header>
      </article>
      <article class="rest-report-card esm-health-kpi-card">
        <header class="rest-report-head">
          <p class="esm-health-kpi-label">Clientless Failure</p>
          <p class="esm-health-kpi-value">${escapeHtml(formatPercent(summary.clientlessFailureRate))}</p>
          <p class="esm-health-overview-copy">${escapeHtml(
            `${formatCompactNumber(summary.clientlessFailures || 0)} failures across clientless token traffic`
          )}</p>
        </header>
      </article>
    </section>

    <section class="esm-health-chart-grid">
      ${renderChartCard(
        "Play Requests",
        latestBackbone?.playRequests,
        "Daily or hourly media token volume across the selected health window.",
        backboneSeries,
        (entry) => Number(entry?.playRequests || entry?.mediaTokens || 0),
        formatCompactNumber,
        String(report?.sectionErrors?.backbone || "").trim()
      )}
      ${renderChartCard(
        "AuthN Conversion",
        latestBackbone?.authnConversion,
        "Authentication success rate over time.",
        backboneSeries,
        (entry) => Number(entry?.authnConversion || 0),
        formatPercent,
        String(report?.sectionErrors?.backbone || "").trim()
      )}
      ${renderChartCard(
        "AuthZ Conversion",
        latestBackbone?.authzConversion,
        "Authorization success rate over time.",
        backboneSeries,
        (entry) => Number(entry?.authzConversion || 0),
        formatPercent,
        String(report?.sectionErrors?.backbone || "").trim()
      )}
      ${renderChartCard(
        "AuthZ Latency",
        latestBackbone?.avgAuthzLatency,
        "Average latency in milliseconds for successful and failed authorizations.",
        backboneSeries,
        (entry) => Number(entry?.avgAuthzLatency || 0),
        formatLatency,
        String(report?.sectionErrors?.backbone || "").trim()
      )}
      ${renderReachCard(report)}
    </section>

    <section class="esm-health-table-grid">
      ${renderBreakdownTable(
        "Top MVPDs",
        "Click an MVPD to re-run Overview and RequestorId hotspots with that MVPD applied.",
        Array.isArray(report?.mvpdRows) ? report.mvpdRows : [],
        [
          { key: "mvpd", label: "MVPD", drillType: "mvpd" },
          { key: "mediaTokens", label: "Play Requests", type: "number" },
          { key: "authzAttempts", label: "AuthZ Attempts", type: "number" },
          { key: "authzSuccessful", label: "AuthZ Success", type: "number" },
          { key: "authzFailed", label: "AuthZ Failed", type: "number" },
          { key: "authzRejected", label: "Rejected", type: "number" },
          { key: "authzConversion", label: "Conversion", type: "percent" },
          { key: "authzErrorRate", label: "Error Rate", type: "percent" },
          { key: "avgAuthzLatency", label: "Avg Latency", type: "latency" },
        ],
        String(report?.sectionErrors?.mvpd || "").trim()
      )}
      ${renderBreakdownTable(
        "Top RequestorIds",
        "Click a RequestorId to re-run Overview and MVPD hotspots with that RequestorId applied.",
        Array.isArray(report?.requestorRows) ? report.requestorRows : [],
        [
          { key: "requestorId", label: "RequestorId", drillType: "requestor" },
          { key: "mediaTokens", label: "Play Requests", type: "number" },
          { key: "authnAttempts", label: "AuthN Attempts", type: "number" },
          { key: "authnSuccessful", label: "AuthN Success", type: "number" },
          { key: "authzAttempts", label: "AuthZ Attempts", type: "number" },
          { key: "authzSuccessful", label: "AuthZ Success", type: "number" },
          { key: "authzFailed", label: "AuthZ Failed", type: "number" },
          { key: "authnConversion", label: "AuthN Conv", type: "percent" },
          { key: "authzConversion", label: "AuthZ Conv", type: "percent" },
        ],
        String(report?.sectionErrors?.requestor || "").trim()
      )}
      ${renderBreakdownTable(
        "Top Platforms",
        "Platform mix for the active health slice. Click a platform to narrow the dashboard further.",
        Array.isArray(report?.platformRows) ? report.platformRows : [],
        [
          { key: "platform", label: "Platform", drillType: "platform" },
          { key: "mediaTokens", label: "Play Requests", type: "number" },
          { key: "authzAttempts", label: "AuthZ Attempts", type: "number" },
          { key: "authzSuccessful", label: "AuthZ Success", type: "number" },
          { key: "authzFailed", label: "AuthZ Failed", type: "number" },
          { key: "authzConversion", label: "AuthZ Conv", type: "percent" },
        ],
        String(report?.sectionErrors?.platform || "").trim()
      )}
    </section>
  `;
}

function handleReportStart(payload = {}) {
  state.loading = true;
  state.report = null;
  syncQueryFromReport(payload);
  renderReport();
  syncActionButtonsDisabled();
  setStatus("Running ESM HEALTH dashboard...");
}

function handleReportResult(payload = {}) {
  state.loading = false;
  state.report = payload && typeof payload === "object" ? payload : null;
  syncQueryFromReport(payload);
  renderReport();
  syncActionButtonsDisabled();
  if (!state.report) {
    setStatus("No ESM HEALTH data returned.", "error");
    return;
  }
  if (state.report.ok === true) {
    setStatus(`Loaded ESM HEALTH dashboard (${Number(state.report.loadedSections || 0)}/${Number(state.report.totalSections || 0)} sections).`);
    return;
  }
  if (state.report.partial === true) {
    setStatus(
      `Loaded ESM HEALTH dashboard with partial data (${Number(state.report.loadedSections || 0)}/${Number(
        state.report.totalSections || 0
      )} sections).`
    );
    return;
  }
  setStatus(String(state.report.error || "ESM HEALTH query failed."), "error");
}

function clearWorkspaceCards() {
  state.loading = false;
  state.report = null;
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
      type: ESM_HEALTH_WORKSPACE_MESSAGE_TYPE,
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

async function runDashboard(statusMessage = "Running ESM HEALTH dashboard...") {
  if (state.loading) {
    return;
  }
  if (!state.esmHealthReady || !state.programmerId) {
    setStatus("No Media Company is selected in UnderPAR.", "error");
    return;
  }
  state.loading = true;
  syncActionButtonsDisabled();
  setStatus(statusMessage);
  const result = await sendWorkspaceAction("run-dashboard", {
    queryContext: buildQueryContextPayload(),
  });
  if (!result?.ok) {
    state.loading = false;
    syncActionButtonsDisabled();
    setStatus(String(result?.error || "Unable to load ESM HEALTH dashboard."), "error");
  }
}

async function rerunLatestReport() {
  if (state.loading) {
    return;
  }
  if (!hasRenderableReport()) {
    setStatus("No previous ESM HEALTH report is available to refresh.", "error");
    return;
  }
  state.loading = true;
  syncActionButtonsDisabled();
  setStatus("Refreshing ESM HEALTH dashboard...");
  const result = await sendWorkspaceAction("refresh-latest", {
    selectionKey: String(state.report?.selectionKey || "").trim(),
  });
  if (!result?.ok) {
    state.loading = false;
    syncActionButtonsDisabled();
    setStatus(String(result?.error || "Unable to refresh ESM HEALTH dashboard."), "error");
  }
}

function clearWorkspace() {
  const selectionKey = String(state.report?.selectionKey || "").trim();
  clearWorkspaceCards();
  void sendWorkspaceAction("clear-all", {
    selectionKey,
  });
}

function toggleDrilldownArray(currentValues = [], nextValue = "") {
  const normalized = String(nextValue || "").trim();
  if (!normalized) {
    return [];
  }
  const values = normalizeStringList(currentValues);
  return values.length === 1 && values[0] === normalized ? [] : [normalized];
}

async function applyDrilldown(drillType = "", drillValue = "") {
  const normalizedType = String(drillType || "").trim().toLowerCase();
  const normalizedValue = String(drillValue || "").trim();
  if (!normalizedType || !normalizedValue || state.loading) {
    return;
  }
  if (normalizedType === "mvpd") {
    state.query.drilldownMvpdIds = toggleDrilldownArray(state.query.drilldownMvpdIds, normalizedValue);
  } else if (normalizedType === "requestor") {
    state.query.drilldownRequestorIds = toggleDrilldownArray(state.query.drilldownRequestorIds, normalizedValue);
  } else if (normalizedType === "platform") {
    state.query.platforms = toggleDrilldownArray(state.query.platforms, normalizedValue);
  } else {
    return;
  }
  syncFilterControlsFromState();
  await runDashboard(`Applying ${normalizedType} drilldown for ${normalizedValue}...`);
}

async function resetFilters() {
  resetQueryToControllerDefaults();
  syncFilterControlsFromState();
  if (state.esmHealthReady) {
    await runDashboard("Resetting ESM HEALTH filters...");
  }
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
  if (els.filterForm) {
    els.filterForm.addEventListener("submit", (event) => {
      event.preventDefault();
      state.query.start = String(els.startDateInput?.value || "").trim();
      state.query.end = String(els.endDateInput?.value || "").trim();
      void runDashboard();
    });
  }
  if (els.startDateInput) {
    els.startDateInput.addEventListener("change", () => {
      state.query.start = String(els.startDateInput?.value || "").trim();
      syncFilterControlsFromState();
    });
  }
  if (els.endDateInput) {
    els.endDateInput.addEventListener("change", () => {
      state.query.end = String(els.endDateInput?.value || "").trim();
      syncFilterControlsFromState();
    });
  }
  if (els.resetButton) {
    els.resetButton.addEventListener("click", () => {
      void resetFilters();
    });
  }
  if (els.granularityGroup) {
    els.granularityGroup.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("[data-granularity]") : null;
      if (!target) {
        return;
      }
      const nextGranularity = normalizeGranularity(String(target.getAttribute("data-granularity") || ""));
      state.query.granularity = nextGranularity;
      syncFilterControlsFromState();
    });
  }
  if (els.cardsHost) {
    els.cardsHost.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("[data-drill-type][data-drill-value]") : null;
      if (!target) {
        return;
      }
      event.preventDefault();
      void applyDrilldown(
        String(target.getAttribute("data-drill-type") || ""),
        String(target.getAttribute("data-drill-value") || "")
      );
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== ESM_HEALTH_WORKSPACE_MESSAGE_TYPE || message?.channel !== "workspace-event") {
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
  syncFilterControlsFromState();
  updateControllerBanner();
  renderReport();
  const result = await sendWorkspaceAction("workspace-ready");
  if (!result?.ok) {
    setStatus(result?.error || "Unable to contact UnderPAR ESM HEALTH controller.", "error");
  }
}

void init();
