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
  premiumPanelRequestToken: 0,
  workspaceContextKey: "",
  controllerStateVersion: 0,
  controllerStateUpdatedAt: 0,
  defaultStart: "",
  defaultEnd: "",
  defaultGranularity: "hour",
  timezoneLabel: "PST effective",
  platformOptions: [],
  loading: false,
  report: null,
  tableSorts: {},
  query: {
    initialized: false,
    controllerSelectionKey: "",
    start: "",
    end: "",
    granularity: "hour",
    baseRequestorIds: [],
    baseMvpdIds: [],
    drilldownRequestorIds: [],
    drilldownMvpdIds: [],
    platforms: [],
  },
};

const els = {
  appRoot: document.getElementById("workspace-app-root"),
  controllerState: document.getElementById("workspace-controller-state"),
  filterState: document.getElementById("workspace-filter-state"),
  contextCaption: document.getElementById("workspace-context-caption"),
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
  pageEnvBadge: document.getElementById("page-env-badge"),
  pageEnvBadgeValue: document.getElementById("page-env-badge-value"),
};

const ESM_HEALTH_BREAKDOWN_TABLES = Object.freeze([
  {
    key: "platform-hotspots",
    title: "Platform Hotspots",
    copy: "Sorted by issue load first, then traffic. Click a platform to narrow the dashboard further.",
    rowsKey: "platformRows",
    errorKey: "platform",
    columns: [
      { key: "platform", label: "Platform", drillType: "platform" },
      { key: "trafficShare", label: "Traffic Share", type: "percent" },
      { key: "mediaTokens", label: "Play Requests", type: "number" },
      { key: "issueEvents", label: "Issue Events", type: "number" },
      { key: "authnConversion", label: "AuthN Conv", type: "percent" },
      { key: "authzConversion", label: "AuthZ Conv", type: "percent" },
      { key: "authzErrorRate", label: "Error Rate", type: "percent" },
      { key: "clientlessFailureRate", label: "Clientless Failure", type: "percent" },
    ],
  },
  {
    key: "application-versions",
    title: "Application Versions",
    copy: "Highest-impact DCR app versions in the active health slice.",
    rowsKey: "applicationRows",
    errorKey: "applications",
    columns: [
      { key: "applicationLabel", label: "Application Version" },
      { key: "trafficShare", label: "Traffic Share", type: "percent" },
      { key: "mediaTokens", label: "Play Requests", type: "number" },
      { key: "issueEvents", label: "Issue Events", type: "number" },
      { key: "authnConversion", label: "AuthN Conv", type: "percent" },
      { key: "authzConversion", label: "AuthZ Conv", type: "percent" },
      { key: "authzErrorRate", label: "Error Rate", type: "percent" },
    ],
  },
  {
    key: "api-entry-points",
    title: "API Entry Points",
    copy: "Migration visibility for the active app/device slice. Watch which API entry points carry the load and the failures.",
    rowsKey: "apiRows",
    errorKey: "apis",
    columns: [
      { key: "api", label: "API" },
      { key: "trafficShare", label: "Traffic Share", type: "percent" },
      { key: "mediaTokens", label: "Play Requests", type: "number" },
      { key: "issueEvents", label: "Issue Events", type: "number" },
      { key: "authzConversion", label: "AuthZ Conv", type: "percent" },
      { key: "authzErrorRate", label: "Error Rate", type: "percent" },
    ],
  },
  {
    key: "sdk-versions",
    title: "SDK Versions",
    copy: "Adobe Pass SDK distribution for the current slice. Use this to spot older client populations before API v2 migration work.",
    rowsKey: "sdkRows",
    errorKey: "sdkVersions",
    columns: [
      { key: "sdkVersionLabel", label: "SDK Version" },
      { key: "trafficShare", label: "Traffic Share", type: "percent" },
      { key: "mediaTokens", label: "Play Requests", type: "number" },
      { key: "issueEvents", label: "Issue Events", type: "number" },
      { key: "authzConversion", label: "AuthZ Conv", type: "percent" },
      { key: "authzErrorRate", label: "Error Rate", type: "percent" },
    ],
  },
  {
    key: "mvpd-hotspots",
    title: "MVPD Hotspots",
    copy: "Sorted by issue load first, then traffic. Click an MVPD to re-run the dashboard with that MVPD applied.",
    rowsKey: "mvpdRows",
    errorKey: "mvpd",
    columns: [
      { key: "mvpd", label: "MVPD", drillType: "mvpd" },
      { key: "trafficShare", label: "Traffic Share", type: "percent" },
      { key: "mediaTokens", label: "Play Requests", type: "number" },
      { key: "issueEvents", label: "Issue Events", type: "number" },
      { key: "authzSuccessful", label: "AuthZ Success", type: "number" },
      { key: "authzRejected", label: "Rejected", type: "number" },
      { key: "authzConversion", label: "AuthZ Conv", type: "percent" },
      { key: "authzErrorRate", label: "Error Rate", type: "percent" },
      { key: "avgAuthzLatency", label: "Avg Latency", type: "latency" },
    ],
  },
  {
    key: "failure-reasons",
    title: "Failure Reasons",
    copy: "Failure-reason rollup from the ESM event tree. This ties issue load back to the lead event, MVPD, and RequestorId context in the active slice.",
    rowsKey: "reasonRows",
    errorKey: "reasons",
    columns: [
      { key: "reason", label: "Reason" },
      { key: "issueShare", label: "Issue Share", type: "percent" },
      { key: "issueEvents", label: "Issue Events", type: "number" },
      { key: "eventSummary", label: "Event" },
      { key: "mvpdSummary", label: "Lead MVPD" },
      { key: "requestorSummary", label: "Lead RequestorId" },
    ],
  },
  {
    key: "requestor-ids",
    title: "RequestorIds",
    copy: "Cross-requestor comparison for the active media company. Click a RequestorId to re-run the dashboard with that RequestorId applied.",
    rowsKey: "requestorRows",
    errorKey: "requestor",
    columns: [
      { key: "requestorId", label: "RequestorId", drillType: "requestor" },
      { key: "trafficShare", label: "Traffic Share", type: "percent" },
      { key: "mediaTokens", label: "Play Requests", type: "number" },
      { key: "issueEvents", label: "Issue Events", type: "number" },
      { key: "authnSuccessful", label: "AuthN Success", type: "number" },
      { key: "authzSuccessful", label: "AuthZ Success", type: "number" },
      { key: "authnConversion", label: "AuthN Conv", type: "percent" },
      { key: "authzConversion", label: "AuthZ Conv", type: "percent" },
      { key: "authzErrorRate", label: "Error Rate", type: "percent" },
    ],
  },
]);

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

function normalizeIsoDateInput(value = "") {
  const normalized = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function resolveDateInputRange(startValue = "", endValue = "") {
  let start = normalizeIsoDateInput(startValue);
  let end = normalizeIsoDateInput(endValue);
  if (start && end && start > end) {
    const originalStart = start;
    start = end;
    end = originalStart;
  }
  return {
    start,
    end,
  };
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

function normalizeBreakdownSortDirection(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "asc" || normalized === "desc" ? normalized : "";
}

function normalizeBreakdownSortRule(sortRule = null) {
  if (!sortRule || typeof sortRule !== "object") {
    return null;
  }
  const columnKey = String(sortRule.columnKey || sortRule.key || "").trim();
  const direction = normalizeBreakdownSortDirection(sortRule.direction);
  if (!columnKey || !direction) {
    return null;
  }
  return {
    columnKey,
    direction,
  };
}

function getBreakdownTableDefinition(tableKey = "") {
  const normalizedKey = String(tableKey || "").trim();
  if (!normalizedKey) {
    return null;
  }
  return ESM_HEALTH_BREAKDOWN_TABLES.find((entry) => String(entry?.key || "").trim() === normalizedKey) || null;
}

function resolveBreakdownColumn(columns = [], columnKey = "") {
  const normalizedKey = String(columnKey || "").trim();
  if (!normalizedKey) {
    return null;
  }
  return (Array.isArray(columns) ? columns : []).find((column) => String(column?.key || "").trim() === normalizedKey) || null;
}

function getBreakdownDefaultSortDirection(column = null) {
  const type = String(column?.type || "").trim().toLowerCase();
  return type === "number" || type === "percent" || type === "latency" ? "desc" : "asc";
}

function getBreakdownSortableValue(row = null, column = null) {
  const key = String(column?.key || "").trim();
  if (!key) {
    return null;
  }
  const rawValue = row?.[key];
  const type = String(column?.type || "").trim().toLowerCase();
  if (type === "number" || type === "percent" || type === "latency") {
    const numeric = Number(rawValue);
    return Number.isFinite(numeric) ? numeric : null;
  }
  const text = String(rawValue ?? "").trim();
  return text || null;
}

function compareBreakdownSortValues(leftValue, rightValue, column = null) {
  const leftMissing = leftValue === null || leftValue === undefined || leftValue === "";
  const rightMissing = rightValue === null || rightValue === undefined || rightValue === "";
  if (leftMissing && rightMissing) {
    return 0;
  }
  if (leftMissing) {
    return 1;
  }
  if (rightMissing) {
    return -1;
  }
  const type = String(column?.type || "").trim().toLowerCase();
  if (type === "number" || type === "percent" || type === "latency") {
    return Number(leftValue) - Number(rightValue);
  }
  return String(leftValue).localeCompare(String(rightValue), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function sortBreakdownRows(rows = [], columns = [], sortRule = null) {
  const normalizedRows = Array.isArray(rows) ? rows.slice() : [];
  const normalizedSort = normalizeBreakdownSortRule(sortRule);
  if (!normalizedSort) {
    return normalizedRows;
  }
  const sortColumn = resolveBreakdownColumn(columns, normalizedSort.columnKey);
  if (!sortColumn) {
    return normalizedRows;
  }
  const directionFactor = normalizedSort.direction === "asc" ? 1 : -1;
  return normalizedRows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const comparison = compareBreakdownSortValues(
        getBreakdownSortableValue(left.row, sortColumn),
        getBreakdownSortableValue(right.row, sortColumn),
        sortColumn
      );
      if (comparison !== 0) {
        return comparison * directionFactor;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.row);
}

function getBreakdownSortAriaValue(sortRule = null, column = null) {
  const normalizedSort = normalizeBreakdownSortRule(sortRule);
  const columnKey = String(column?.key || "").trim();
  if (!normalizedSort || !columnKey || normalizedSort.columnKey !== columnKey) {
    return "none";
  }
  return normalizedSort.direction === "asc" ? "ascending" : "descending";
}

function getBreakdownSortIndicatorHtml(sortRule = null, column = null) {
  const ariaValue = getBreakdownSortAriaValue(sortRule, column);
  if (ariaValue === "ascending") {
    return "&uarr;";
  }
  if (ariaValue === "descending") {
    return "&darr;";
  }
  return "&harr;";
}

function buildBreakdownSortButtonLabel(column = null, sortRule = null) {
  const label = String(column?.label || column?.key || "column").trim() || "column";
  const ariaValue = getBreakdownSortAriaValue(sortRule, column);
  if (ariaValue === "ascending") {
    return `Sort by ${label}. Currently ascending.`;
  }
  if (ariaValue === "descending") {
    return `Sort by ${label}. Currently descending.`;
  }
  return `Sort by ${label}. Currently not sorted.`;
}

function getNextBreakdownSortRule(columns = [], currentSort = null, columnKey = "") {
  const nextColumn = resolveBreakdownColumn(columns, columnKey);
  if (!nextColumn) {
    return null;
  }
  const normalizedCurrent = normalizeBreakdownSortRule(currentSort);
  const resolvedColumnKey = String(nextColumn.key || "").trim();
  const defaultDirection = getBreakdownDefaultSortDirection(nextColumn);
  if (!normalizedCurrent || normalizedCurrent.columnKey !== resolvedColumnKey) {
    return {
      columnKey: resolvedColumnKey,
      direction: defaultDirection,
    };
  }
  if (normalizedCurrent.direction === defaultDirection) {
    return {
      columnKey: resolvedColumnKey,
      direction: defaultDirection === "asc" ? "desc" : "asc",
    };
  }
  return null;
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
    const isActive = value === normalizeGranularity(state.query.granularity);
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
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

function renderWorkspaceEnvironmentBadge() {
  if (!els.pageEnvBadge || !els.pageEnvBadgeValue) {
    return;
  }
  const registry = globalThis.UnderParEnvironment || null;
  const label = String(state.environmentLabel || state.environmentKey || "Production").trim() || "Production";
  const badgeLabel =
    String(registry?.buildEnvironmentBadgeLabel?.({ key: state.environmentKey, label }) || `Release ${label}`).trim() ||
    `Release ${label}`;
  const title = `Environment: ${label}`;
  els.pageEnvBadgeValue.textContent = badgeLabel;
  els.pageEnvBadgeValue.setAttribute("aria-hidden", "false");
  els.pageEnvBadge.dataset.environmentKey = String(state.environmentKey || "release-production").trim() || "release-production";
  els.pageEnvBadge.dataset.environmentLabel = badgeLabel;
  els.pageEnvBadge.title = title;
  els.pageEnvBadge.setAttribute("aria-label", title);
}

function getContextCaption() {
  if (!state.controllerOnline) {
    return "Waiting for the UnderPAR side panel to bind the live ESM controller context.";
  }
  if (!state.programmerId) {
    return "Select an ENV x Media Company with ESM access in UnderPAR to hydrate this dashboard.";
  }
  if (!state.esmHealthReady) {
    return "UnderPAR is still hydrating the ESM premium service for the selected ENV x Media Company.";
  }
  return "Bound to the live UnderPAR ESM context. Date range persists across ENV x Media Company switches; scoped drilldowns reset to the selected controller context.";
}

function updateControllerBanner() {
  if (els.controllerState) {
    els.controllerState.textContent = `ESM HEALTH Dashboard | ${getProgrammerLabel()}`;
  }
  if (els.filterState) {
    els.filterState.textContent = getFilterLabel();
  }
  if (els.contextCaption) {
    els.contextCaption.textContent = getContextCaption();
  }
  renderWorkspaceEnvironmentBadge();
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
  const nextProgrammerId = String(payload?.programmerId || "").trim();
  const nextEnvironmentKey = String(payload?.environmentKey || "").trim();
  const nextWorkspaceContextKey = String(payload?.workspaceContextKey || "").trim();
  const nextRequestToken = Math.max(0, Number(payload?.premiumPanelRequestToken || 0));
  const previousControllerSelectionKey = String(state.query.controllerSelectionKey || "").trim();
  const previousProgrammerId = String(state.programmerId || "").trim();
  const previousEnvironmentKey = String(state.environmentKey || "").trim();
  const previousWorkspaceContextKey = String(state.workspaceContextKey || "").trim();
  const previousRequestToken = Math.max(0, Number(state.premiumPanelRequestToken || 0));
  const previousEsmHealthReady = state.esmHealthReady === true;
  const controllerChanged =
    !state.query.initialized ||
    nextSelectionKey !== previousControllerSelectionKey ||
    nextProgrammerId !== previousProgrammerId ||
    nextEnvironmentKey !== previousEnvironmentKey;
  const runtimeContextChanged =
    (nextWorkspaceContextKey && previousWorkspaceContextKey && nextWorkspaceContextKey !== previousWorkspaceContextKey) ||
    (nextRequestToken > 0 && previousRequestToken > 0 && nextRequestToken !== previousRequestToken);
  const readinessActivated = !previousEsmHealthReady && payload?.esmHealthReady === true;
  const hadLiveControllerContext =
    Boolean(previousControllerSelectionKey || previousProgrammerId || previousEnvironmentKey || previousWorkspaceContextKey) ||
    previousRequestToken > 0;
  const preservedDates = controllerChanged ? resolveDateInputRange(state.query.start, state.query.end) : { start: "", end: "" };
  const currentReportSelectionKey = getReportControllerSelectionKey(state.report);
  const shouldClearStaleReport = controllerChanged && currentReportSelectionKey && currentReportSelectionKey !== nextSelectionKey;
  const shouldAutoRefreshForControllerUpdate =
    (controllerChanged || runtimeContextChanged || readinessActivated) &&
    hadLiveControllerContext &&
    nextProgrammerId &&
    payload?.esmHealthReady === true &&
    !state.loading;

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
  state.premiumPanelRequestToken = Math.max(0, Number(payload?.premiumPanelRequestToken || state.premiumPanelRequestToken || 0));
  state.workspaceContextKey = String(payload?.workspaceContextKey || "").trim();
  state.controllerStateVersion = Math.max(0, Number(payload?.controllerStateVersion || state.controllerStateVersion || 0));
  state.controllerStateUpdatedAt = Math.max(0, Number(payload?.updatedAt || Date.now() || 0));
  state.defaultStart = String(payload?.defaultStart || "");
  state.defaultEnd = String(payload?.defaultEnd || "");
  state.defaultGranularity = normalizeGranularity(payload?.defaultGranularity);
  state.timezoneLabel = String(payload?.timezoneLabel || "PST effective");
  state.platformOptions = normalizeStringList(payload?.platformOptions);

  if (controllerChanged) {
    resetQueryToControllerDefaults();
    if (preservedDates.start) {
      state.query.start = preservedDates.start;
    }
    if (preservedDates.end) {
      state.query.end = preservedDates.end;
    }
    state.loading = false;
  } else if (runtimeContextChanged) {
    state.loading = false;
  }
  if (shouldClearStaleReport) {
    state.report = null;
    renderReport();
  }
  syncFilterControlsFromState();
  updateControllerBanner();
  if (shouldAutoRefreshForControllerUpdate) {
    void runDashboard("Refreshing ESM HEALTH dashboard for the selected UnderPAR context...");
  }
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

function getPayloadControllerSelectionKey(payload = {}) {
  return firstNonEmptyString([
    payload?.controllerSelectionKey,
    payload?.queryContext?.controllerSelectionKey,
    payload?.selectionKey,
  ]);
}

function getReportControllerSelectionKey(report = null) {
  return firstNonEmptyString([
    report?.controllerSelectionKey,
    report?.queryContext?.controllerSelectionKey,
    report?.selectionKey,
  ]);
}

function doesWorkspaceEventMatchCurrentContext(payload = {}) {
  const incomingWorkspaceContextKey = String(payload?.workspaceContextKey || "").trim();
  const currentWorkspaceContextKey = String(state.workspaceContextKey || "").trim();
  if (incomingWorkspaceContextKey && currentWorkspaceContextKey && incomingWorkspaceContextKey !== currentWorkspaceContextKey) {
    return false;
  }
  const incomingSelectionKey = String(getPayloadControllerSelectionKey(payload) || "").trim();
  const currentSelectionKey = String(state.selectionKey || "").trim();
  if (incomingSelectionKey && currentSelectionKey && incomingSelectionKey !== currentSelectionKey) {
    return false;
  }
  const incomingProgrammerId = firstNonEmptyString([payload?.programmerId, payload?.queryContext?.programmerId]);
  if (incomingProgrammerId && state.programmerId && incomingProgrammerId !== state.programmerId) {
    return false;
  }
  const incomingEnvironmentKey = firstNonEmptyString([payload?.environmentKey, payload?.queryContext?.environmentKey]);
  if (incomingEnvironmentKey && state.environmentKey && incomingEnvironmentKey !== state.environmentKey) {
    return false;
  }
  const incomingRequestToken = Math.max(0, Number(payload?.premiumPanelRequestToken || 0));
  const currentRequestToken = Math.max(0, Number(state.premiumPanelRequestToken || 0));
  if (incomingRequestToken > 0 && currentRequestToken > 0 && incomingRequestToken !== currentRequestToken) {
    return false;
  }
  return true;
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

function renderInsightCard(label = "", value = "", copy = "") {
  return `
    <article class="rest-report-card esm-health-insight-card">
      <header class="rest-report-head">
        <p class="esm-health-kpi-label">${escapeHtml(label)}</p>
        <p class="esm-health-kpi-value esm-health-kpi-value--compact">${escapeHtml(String(value || "").trim() || "N/A")}</p>
        <p class="esm-health-overview-copy">${escapeHtml(String(copy || "").trim() || "No additional insight available.")}</p>
      </header>
    </article>
  `;
}

function renderInsightCards(report = null) {
  const summary = report?.summary && typeof report.summary === "object" ? report.summary : {};
  const cards = [];
  if (String(summary?.topPlatformLabel || "").trim()) {
    cards.push(
      renderInsightCard(
        "Platform Lead",
        summary.topPlatformLabel,
        `${formatCompactNumber(report?.platformRows?.[0]?.mediaTokens || 0)} play requests | ${formatPercent(
          report?.platformRows?.[0]?.trafficShare
        )} of active traffic`
      )
    );
  }
  if (String(summary?.topApplicationLabel || "").trim()) {
    cards.push(
      renderInsightCard(
        "App Lead",
        summary.topApplicationLabel,
        `${formatCompactNumber(report?.applicationRows?.[0]?.issueEvents || 0)} issue events across the active slice`
      )
    );
  }
  if (String(summary?.topApiLabel || "").trim()) {
    cards.push(
      renderInsightCard(
        "API Focus",
        summary.topApiLabel,
        `${formatCompactNumber(report?.apiRows?.[0]?.mediaTokens || 0)} play requests | ${formatPercent(
          report?.apiRows?.[0]?.authzConversion
        )} authZ conversion`
      )
    );
  }
  if (String(summary?.topSdkLabel || "").trim()) {
    cards.push(
      renderInsightCard(
        "SDK Focus",
        summary.topSdkLabel,
        `${formatCompactNumber(report?.sdkRows?.[0]?.mediaTokens || 0)} play requests | ${formatPercent(
          report?.sdkRows?.[0]?.authzErrorRate
        )} authZ error rate`
      )
    );
  }
  if (String(summary?.topReasonLabel || "").trim()) {
    cards.push(
      renderInsightCard(
        "Reason Focus",
        summary.topReasonLabel,
        `${formatCompactNumber(report?.reasonRows?.[0]?.issueEvents || 0)} issue events | ${
          String(summary?.topReasonEventLabel || "Reason telemetry").trim() || "Reason telemetry"
        }`
      )
    );
  }
  if (cards.length === 0) {
    return "";
  }
  return `<section class="esm-health-insight-grid">${cards.join("")}</section>`;
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

function renderBreakdownTable(tableKey, title, copy, rows = [], columns = [], errorText = "") {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const normalizedColumns = Array.isArray(columns) ? columns : [];
  const sortRule = normalizeBreakdownSortRule(state.tableSorts?.[String(tableKey || "").trim()] || null);
  const sortedRows = sortBreakdownRows(normalizedRows, normalizedColumns, sortRule);
  const hasRows = normalizedRows.length > 0;
  const defaultOpen = hasRows || Boolean(String(errorText || "").trim());
  const stateLabel = hasRows ? `${normalizedRows.length} row${normalizedRows.length === 1 ? "" : "s"}` : errorText ? "Issue" : "No rows";
  const headerHtml = normalizedColumns
    .map((column) => {
      const ariaSort = getBreakdownSortAriaValue(sortRule, column);
      const buttonLabel = buildBreakdownSortButtonLabel(column, sortRule);
      return `
        <th scope="col" aria-sort="${ariaSort}">
          <button
            type="button"
            class="esm-health-table-sort-btn${ariaSort === "none" ? "" : " is-active"}"
            data-sort-table="${escapeHtml(String(tableKey || ""))}"
            data-sort-column="${escapeHtml(String(column?.key || ""))}"
            aria-label="${escapeHtml(buttonLabel)}"
            title="${escapeHtml(buttonLabel)}"
          >
            <span class="esm-health-table-sort-label">${escapeHtml(column?.label || "")}</span>
            <span class="esm-health-table-sort-icon" aria-hidden="true">${getBreakdownSortIndicatorHtml(sortRule, column)}</span>
          </button>
        </th>
      `;
    })
    .join("");
  const bodyHtml = sortedRows
    .map((row) => {
      const cells = normalizedColumns
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
    <details class="rest-report-card esm-health-table-card esm-health-section-card${hasRows ? "" : " is-empty"}"${
      defaultOpen ? " open" : ""
    }>
      <summary class="esm-health-section-summary">
        <div class="esm-health-section-summary-copy">
          <p class="rest-report-title">${escapeHtml(title)}</p>
          <p class="rest-report-meta">${escapeHtml(copy)}</p>
        </div>
        <span class="esm-health-section-summary-pill">${escapeHtml(stateLabel)}</span>
      </summary>
      <div class="esm-health-section-body">
        ${
          hasRows
            ? `
              <div class="esm-health-table-wrap">
                <table class="esm-health-table">
                  <thead>
                    <tr>${headerHtml}</tr>
                  </thead>
                  <tbody>${bodyHtml}</tbody>
                </table>
              </div>
            `
            : `<p class="esm-health-table-copy ${errorText ? "esm-health-section-error" : ""}">${escapeHtml(
                errorText || "No rows returned for this hotspot view."
              )}</p>`
        }
      </div>
    </details>
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
      <article class="rest-report-card esm-health-kpi-card">
        <header class="rest-report-head">
          <p class="esm-health-kpi-label">Unique Sessions</p>
          <p class="esm-health-kpi-value">${escapeHtml(formatCompactNumber(summary.latestUniqueSessions || 0))}</p>
          <p class="esm-health-overview-copy">${escapeHtml(
            `${formatCompactNumber(summary.latestUniqueAccounts || 0)} accounts | ${summary.latestUniqueLabel || "Daily uniques"}`
          )}</p>
        </header>
      </article>
      <article class="rest-report-card esm-health-kpi-card">
        <header class="rest-report-head">
          <p class="esm-health-kpi-label">App Versions</p>
          <p class="esm-health-kpi-value">${escapeHtml(formatCompactNumber(summary.activeApplications || 0))}</p>
          <p class="esm-health-overview-copy">${escapeHtml(
            `${formatCompactNumber(summary.activeApis || 0)} API slices | ${formatCompactNumber(summary.activeSdkVersions || 0)} SDK slices`
          )}</p>
        </header>
      </article>
      <article class="rest-report-card esm-health-kpi-card">
        <header class="rest-report-head">
          <p class="esm-health-kpi-label">Failure Reasons</p>
          <p class="esm-health-kpi-value">${escapeHtml(formatCompactNumber(summary.activeReasons || 0))}</p>
          <p class="esm-health-overview-copy">${escapeHtml(
            `${summary.topReasonLabel || "No reason hotspots detected"}${
              summary.topReasonEventLabel ? ` | ${summary.topReasonEventLabel}` : ""
            }`
          )}</p>
        </header>
      </article>
    </section>

    ${renderInsightCards(report)}

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
        "Successful Authentications",
        latestBackbone?.authnSuccessful,
        "Absolute authN success volume over time.",
        backboneSeries,
        (entry) => Number(entry?.authnSuccessful || 0),
        formatCompactNumber,
        String(report?.sectionErrors?.backbone || "").trim()
      )}
      ${renderChartCard(
        "Successful Authorizations",
        latestBackbone?.authzSuccessful,
        "Absolute authZ success volume over time.",
        backboneSeries,
        (entry) => Number(entry?.authzSuccessful || 0),
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
      ${ESM_HEALTH_BREAKDOWN_TABLES.map((table) =>
        renderBreakdownTable(
          table.key,
          table.title,
          table.copy,
          Array.isArray(report?.[table.rowsKey]) ? report[table.rowsKey] : [],
          table.columns,
          String(report?.sectionErrors?.[table.errorKey] || "").trim()
        )
      ).join("")}
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
  if ((event === "report-start" || event === "report-result") && !doesWorkspaceEventMatchCurrentContext(payload)) {
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
    const environment = payload?.adobePassEnvironment && typeof payload.adobePassEnvironment === "object" ? payload.adobePassEnvironment : null;
    if (environment) {
      state.environmentKey = String(environment?.key || state.environmentKey || "").trim();
      state.environmentLabel = String(environment?.label || state.environmentLabel || state.environmentKey || "").trim();
      renderWorkspaceEnvironmentBadge();
    }
    if (state.loading || !state.query.initialized || !state.programmerId || !state.esmHealthReady) {
      return;
    }
    void runDashboard("Refreshing ESM HEALTH dashboard for the selected UnderPAR context...");
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
  if (!state.query.initialized) {
    setStatus("No previous ESM HEALTH report is available to refresh.", "error");
    return;
  }
  await runDashboard("Refreshing ESM HEALTH dashboard...");
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

function toggleBreakdownTableSort(tableKey = "", columnKey = "") {
  const normalizedTableKey = String(tableKey || "").trim();
  const normalizedColumnKey = String(columnKey || "").trim();
  if (!normalizedTableKey || !normalizedColumnKey || state.loading || !state.report) {
    return;
  }
  const tableDefinition = getBreakdownTableDefinition(normalizedTableKey);
  if (!tableDefinition) {
    return;
  }
  const nextSortRule = getNextBreakdownSortRule(
    tableDefinition.columns,
    state.tableSorts?.[normalizedTableKey] || null,
    normalizedColumnKey
  );
  if (!state.tableSorts || typeof state.tableSorts !== "object") {
    state.tableSorts = {};
  }
  if (nextSortRule) {
    state.tableSorts[normalizedTableKey] = nextSortRule;
  } else {
    delete state.tableSorts[normalizedTableKey];
  }
  renderReport();
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
      const sortTarget = event.target instanceof Element ? event.target.closest("[data-sort-table][data-sort-column]") : null;
      if (sortTarget) {
        event.preventDefault();
        toggleBreakdownTableSort(
          String(sortTarget.getAttribute("data-sort-table") || ""),
          String(sortTarget.getAttribute("data-sort-column") || "")
        );
        return;
      }
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
