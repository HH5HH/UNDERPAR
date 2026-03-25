const CM_HEALTH_WORKSPACE_MESSAGE_TYPE = "underpar:cm-health-workspace";

const state = {
  windowId: 0,
  controllerOnline: false,
  cmHealthReady: false,
  programmerId: "",
  programmerName: "",
  mediaCompany: "",
  tenantScope: "",
  matchedTenants: [],
  requestorHint: "",
  mvpdIds: [],
  platforms: [],
  channels: [],
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
  loading: false,
  report: null,
  tableSorts: {},
  query: {
    initialized: false,
    controllerSelectionKey: "",
    start: "",
    end: "",
    granularity: "hour",
    baseMvpdIds: [],
    drilldownMvpdIds: [],
    platforms: [],
    channels: [],
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

const CM_HEALTH_BREAKDOWN_TABLES = Object.freeze([
  {
    key: "platform-hotspots",
    title: "Platform Hotspots",
    copy: "Tenant-scoped CMU pressure by platform. Click a platform to re-run the dashboard inside that platform slice.",
    rowsKey: "platformRows",
    errorKey: "platform",
    columns: [
      { key: "platform", label: "Platform", drillType: "platform" },
      { key: "trafficShare", label: "Traffic Share", type: "percent" },
      { key: "startedSessions", label: "Started", type: "number" },
      { key: "issueEvents", label: "Issue Events", type: "number" },
      { key: "activeUsers", label: "Active Users", type: "number" },
      { key: "completionRate", label: "Completion", type: "percent" },
      { key: "failureRate", label: "Failure", type: "percent" },
      { key: "interruptionRate", label: "Interruption", type: "percent" },
    ],
  },
  {
    key: "application-versions",
    title: "Application Versions",
    copy: "CMU application distribution inside the active slice. Labels come directly from CM usage dimensions.",
    rowsKey: "applicationRows",
    errorKey: "applications",
    columns: [
      { key: "applicationLabel", label: "Application" },
      { key: "trafficShare", label: "Traffic Share", type: "percent" },
      { key: "startedSessions", label: "Started", type: "number" },
      { key: "issueEvents", label: "Issue Events", type: "number" },
      { key: "activeUsers", label: "Active Users", type: "number" },
      { key: "completionRate", label: "Completion", type: "percent" },
      { key: "failureRate", label: "Failure", type: "percent" },
    ],
  },
  {
    key: "channel-hotspots",
    title: "Channel Hotspots",
    copy: "CM-native channel pressure. Click a channel to switch the dashboard onto the channel backbone path.",
    rowsKey: "channelRows",
    errorKey: "channel",
    columns: [
      { key: "channel", label: "Channel", drillType: "channel" },
      { key: "trafficShare", label: "Traffic Share", type: "percent" },
      { key: "startedSessions", label: "Started", type: "number" },
      { key: "issueEvents", label: "Issue Events", type: "number" },
      { key: "activeUsers", label: "Active Users", type: "number" },
      { key: "completionRate", label: "Completion", type: "percent" },
      { key: "failureRate", label: "Failure", type: "percent" },
      { key: "interruptionRate", label: "Interruption", type: "percent" },
    ],
  },
  {
    key: "mvpd-hotspots",
    title: "MVPD Hotspots",
    copy: "MVPD pressure from the tenant x MVPD CMU slice. Click an MVPD to add MVPD-scoped pressure views.",
    rowsKey: "mvpdRows",
    errorKey: "mvpd",
    columns: [
      { key: "mvpd", label: "MVPD", drillType: "mvpd" },
      { key: "trafficShare", label: "Traffic Share", type: "percent" },
      { key: "startedSessions", label: "Started", type: "number" },
      { key: "issueEvents", label: "Issue Events", type: "number" },
      { key: "activeUsers", label: "Active Users", type: "number" },
      { key: "completedSessions", label: "Completed", type: "number" },
      { key: "failureRate", label: "Failure", type: "percent" },
      { key: "interruptionRate", label: "Interruption", type: "percent" },
    ],
  },
  {
    key: "concurrency-levels",
    title: "Concurrency Levels",
    copy: "Concurrent-user pressure buckets from CMU. Tenant-wide unless MVPD focus is active.",
    rowsKey: "concurrencyRows",
    errorKey: "concurrency",
    columns: [
      { key: "concurrencyLevel", label: "Concurrency Level" },
      { key: "userShare", label: "User Share", type: "percent" },
      { key: "users", label: "Users", type: "number" },
    ],
  },
  {
    key: "activity-levels",
    title: "Activity Levels",
    copy: "Viewer activity buckets from CMU. Tenant-wide unless MVPD focus is active.",
    rowsKey: "activityRows",
    errorKey: "activity",
    columns: [
      { key: "activityLevel", label: "Activity Level" },
      { key: "userShare", label: "User Share", type: "percent" },
      { key: "users", label: "Users", type: "number" },
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

function formatRatio(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "—";
  }
  return `${numeric.toFixed(2)}x`;
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

function resolveBreakdownColumn(columns = [], columnKey = "") {
  const normalizedKey = String(columnKey || "").trim();
  if (!normalizedKey) {
    return null;
  }
  return (Array.isArray(columns) ? columns : []).find((column) => String(column?.key || "").trim() === normalizedKey) || null;
}

function getBreakdownDefaultSortDirection(column = null) {
  const type = String(column?.type || "").trim().toLowerCase();
  return type === "number" || type === "percent" || type === "ratio" ? "desc" : "asc";
}

function getBreakdownSortableValue(row = null, column = null) {
  const key = String(column?.key || "").trim();
  if (!key) {
    return null;
  }
  const rawValue = row?.[key];
  const type = String(column?.type || "").trim().toLowerCase();
  if (type === "number" || type === "percent" || type === "ratio") {
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
  if (type === "number" || type === "percent" || type === "ratio") {
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

function getEffectiveMvpdIds() {
  if (state.query.channels.length > 0) {
    return [];
  }
  return state.query.drilldownMvpdIds.length > 0 ? state.query.drilldownMvpdIds.slice() : state.query.baseMvpdIds.slice();
}

function getFilterLabel() {
  const environmentLabel = String(state.environmentLabel || state.environmentKey || "N/A").trim();
  const tenantLabel = String(state.tenantScope || "").trim() || "Pending";
  const requestorLabel = String(state.requestorHint || "").trim() || "None";
  const mvpdLabel = getEffectiveMvpdIds().join(", ") || "All MVPDs";
  return `Env: ${environmentLabel} | Tenant: ${tenantLabel} | Requestor Hint: ${requestorLabel} | MVPD: ${mvpdLabel} | ${state.timezoneLabel || "PST effective"}`;
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
    { label: "Tenant", value: state.tenantScope || "Pending" },
    { label: "Requestor Hint", value: state.requestorHint || "None" },
    { label: "Controller MVPD", value: state.query.baseMvpdIds.join(", ") || "All" },
    { label: "Active MVPD", value: getEffectiveMvpdIds().join(", ") || "Global scope" },
    { label: "Platforms", value: state.query.platforms.join(", ") || "All" },
    { label: "Channels", value: state.query.channels.join(", ") || "All" },
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
    els.runButton.disabled = state.loading || !state.cmHealthReady || !hasValidDates;
  }
  if (els.resetButton) {
    els.resetButton.disabled = state.loading || !state.query.initialized;
  }
  if (els.startDateInput) {
    els.startDateInput.disabled = state.loading || !state.cmHealthReady;
  }
  if (els.endDateInput) {
    els.endDateInput.disabled = state.loading || !state.cmHealthReady;
  }
  document.body.classList.toggle("net-busy", state.loading);
  document.body.setAttribute("aria-busy", state.loading ? "true" : "false");
  updateGranularityButtons();
}

function renderWorkspaceEnvironmentBadge() {
  if (!els.pageEnvBadge || !els.pageEnvBadgeValue) {
    return;
  }
  const label = String(state.environmentLabel || state.environmentKey || "Production").trim() || "Production";
  const title = `Environment: ${label}`;
  els.pageEnvBadgeValue.textContent = label;
  els.pageEnvBadgeValue.setAttribute("aria-hidden", "false");
  els.pageEnvBadge.dataset.environmentKey = String(state.environmentKey || "release-production").trim() || "release-production";
  els.pageEnvBadge.dataset.environmentLabel = label;
  els.pageEnvBadge.title = title;
  els.pageEnvBadge.setAttribute("aria-label", title);
}

function getContextCaption() {
  if (!state.controllerOnline) {
    return "Waiting for the UnderPAR side panel to bind the live CM controller context.";
  }
  if (!state.programmerId) {
    return "Select an ENV x Media Company with a Concurrency Monitoring tenant match in UnderPAR to hydrate this dashboard.";
  }
  if (!state.cmHealthReady) {
    return "UnderPAR is still hydrating the Concurrency Monitoring tenant scope for the selected ENV x Media Company.";
  }
  const tenantNames = state.matchedTenants
    .map((entry) => firstNonEmptyString([entry?.tenantName, entry?.tenantId]))
    .filter(Boolean)
    .slice(0, 2)
    .join(", ");
  return `Bound to tenant ${state.tenantScope || "unknown"}. RequestorId stays a correlation hint only because CMU usage reports are tenant-native.${tenantNames ? ` Matched tenants: ${tenantNames}.` : ""}`;
}

function updateControllerBanner() {
  if (els.controllerState) {
    els.controllerState.textContent = `CM HEALTH Dashboard | ${getProgrammerLabel()}`;
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
    baseMvpdIds: normalizeStringList(state.mvpdIds),
    drilldownMvpdIds: [],
    platforms: normalizeStringList(state.platforms),
    channels: normalizeStringList(state.channels),
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
  const previousCmHealthReady = state.cmHealthReady === true;
  const controllerChanged =
    !state.query.initialized ||
    nextSelectionKey !== previousControllerSelectionKey ||
    nextProgrammerId !== previousProgrammerId ||
    nextEnvironmentKey !== previousEnvironmentKey;
  const runtimeContextChanged =
    (nextWorkspaceContextKey && previousWorkspaceContextKey && nextWorkspaceContextKey !== previousWorkspaceContextKey) ||
    (nextRequestToken > 0 && previousRequestToken > 0 && nextRequestToken !== previousRequestToken);
  const readinessActivated = !previousCmHealthReady && payload?.cmHealthReady === true;
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
    payload?.cmHealthReady === true &&
    !state.loading;

  state.controllerOnline = payload?.controllerOnline === true;
  state.cmHealthReady = payload?.cmHealthReady === true;
  state.programmerId = String(payload?.programmerId || "");
  state.programmerName = String(payload?.programmerName || "");
  state.mediaCompany = String(payload?.mediaCompany || "");
  state.tenantScope = String(payload?.tenantScope || "");
  state.matchedTenants = Array.isArray(payload?.matchedTenants) ? payload.matchedTenants : [];
  state.requestorHint = String(payload?.requestorHint || "");
  state.mvpdIds = normalizeStringList(payload?.mvpdIds);
  state.platforms = normalizeStringList(payload?.platforms);
  state.channels = normalizeStringList(payload?.channels);
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
    void runDashboard("Refreshing CM HEALTH dashboard for the selected UnderPAR context...");
  }
}

function buildQueryContextPayload() {
  return {
    programmerId: String(state.programmerId || "").trim(),
    programmerName: String(state.programmerName || "").trim(),
    tenantScope: String(state.tenantScope || "").trim(),
    requestorHint: String(state.requestorHint || "").trim(),
    drilldownMvpdIds: getEffectiveMvpdIds(),
    platforms: state.query.platforms.slice(),
    channels: state.query.channels.slice(),
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
    baseMvpdIds: normalizeStringList(state.mvpdIds),
    drilldownMvpdIds: normalizeStringList(queryContext?.drilldownMvpdIds || queryContext?.mvpdIds),
    platforms: normalizeStringList(queryContext?.platforms),
    channels: normalizeStringList(queryContext?.channels),
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
        `${formatCompactNumber(report?.platformRows?.[0]?.startedSessions || 0)} started sessions | ${formatPercent(
          report?.platformRows?.[0]?.failureRate
        )} failure`
      )
    );
  }
  if (String(summary?.topApplicationLabel || "").trim()) {
    cards.push(
      renderInsightCard(
        "App Focus",
        summary.topApplicationLabel,
        `${formatCompactNumber(report?.applicationRows?.[0]?.issueEvents || 0)} issue events | ${formatPercent(
          report?.applicationRows?.[0]?.trafficShare
        )} traffic share`
      )
    );
  }
  if (String(summary?.topChannelLabel || "").trim()) {
    cards.push(
      renderInsightCard(
        "Channel Lead",
        summary.topChannelLabel,
        `${formatCompactNumber(report?.channelRows?.[0]?.startedSessions || 0)} started sessions | ${formatPercent(
          report?.channelRows?.[0]?.interruptionRate
        )} interruption`
      )
    );
  }
  if (String(summary?.topMvpdLabel || "").trim()) {
    cards.push(
      renderInsightCard(
        "MVPD Focus",
        summary.topMvpdLabel,
        `${formatCompactNumber(report?.mvpdRows?.[0]?.activeUsers || 0)} active users | ${formatPercent(
          report?.mvpdRows?.[0]?.failureRate
        )} failure`
      )
    );
  }
  if (String(summary?.topConcurrencyLabel || "").trim()) {
    cards.push(
      renderInsightCard(
        "Concurrency Pressure",
        summary.topConcurrencyLabel,
        `${formatCompactNumber(report?.concurrencyRows?.[0]?.users || 0)} users | ${formatPercent(
          report?.concurrencyRows?.[0]?.userShare
        )} share`
      )
    );
  }
  if (String(summary?.topActivityLabel || "").trim()) {
    cards.push(
      renderInsightCard(
        "Activity Pressure",
        summary.topActivityLabel,
        `${formatCompactNumber(report?.activityRows?.[0]?.users || 0)} users | ${formatPercent(
          report?.activityRows?.[0]?.userShare
        )} share`
      )
    );
  }
  if (cards.length === 0) {
    return "";
  }
  return `<section class="esm-health-insight-grid">${cards.join("")}</section>`;
}

function renderBreakdownTable(tableKey, title, copy, rows = [], columns = [], errorText = "", messageText = "") {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const normalizedColumns = Array.isArray(columns) ? columns : [];
  const normalizedError = String(errorText || "").trim();
  const normalizedMessage = String(messageText || "").trim();
  const sortRule = normalizeBreakdownSortRule(state.tableSorts?.[String(tableKey || "").trim()] || null);
  const sortedRows = sortBreakdownRows(normalizedRows, normalizedColumns, sortRule);
  const hasRows = normalizedRows.length > 0;
  const defaultOpen = hasRows || Boolean(normalizedError || normalizedMessage);
  const stateLabel = hasRows
    ? `${normalizedRows.length} row${normalizedRows.length === 1 ? "" : "s"}`
    : normalizedError
      ? "Issue"
      : normalizedMessage
        ? "Scoped"
        : "No rows";
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
          } else if (column.type === "ratio") {
            display = formatRatio(rawValue);
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
  const noteHtml = normalizedMessage
    ? `<p class="esm-health-table-copy${normalizedError ? " esm-health-section-error" : ""}">${escapeHtml(normalizedMessage)}</p>`
    : "";
  const emptyCopy = normalizedError || normalizedMessage || "No rows returned for this hotspot view.";

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
              ${noteHtml}
              <div class="esm-health-table-wrap">
                <table class="esm-health-table">
                  <thead>
                    <tr>${headerHtml}</tr>
                  </thead>
                  <tbody>${bodyHtml}</tbody>
                </table>
              </div>
            `
            : `<p class="esm-health-table-copy ${normalizedError ? "esm-health-section-error" : ""}">${escapeHtml(emptyCopy)}</p>`
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
      '<article class="rest-report-card"><header class="rest-report-head"><p class="rest-report-title">CM HEALTH Dashboard</p></header><p class="esm-health-table-copy">No CM HEALTH report loaded yet.</p></article>';
    return;
  }

  const summary = report?.summary && typeof report.summary === "object" ? report.summary : {};
  const backboneSeries = Array.isArray(report?.backboneSeries) ? report.backboneSeries : [];
  const latestBackbone = backboneSeries.length > 0 ? backboneSeries[backboneSeries.length - 1] : null;
  const checkedAtLabel = formatDateTime(report?.checkedAt);
  const sectionSummary = `${Number(report?.loadedSections || 0)}/${Number(report?.totalSections || 0)} sections loaded`;
  const introBits = [
    `Tenant ${String(report?.queryContext?.tenantScope || state.tenantScope || "?").trim()}`,
    `${String(report?.queryContext?.start || "").trim() || "?"} -> ${String(report?.queryContext?.end || "").trim() || "?"}`,
    `Requestor Hint ${String(report?.queryContext?.requestorHint || state.requestorHint || "None").trim() || "None"}`,
    String(report?.queryContext?.timezoneLabel || state.timezoneLabel || "PST effective").trim(),
  ];

  els.cardsHost.innerHTML = `
    <article class="rest-report-card">
      <header class="rest-report-head">
        <p class="rest-report-title">CM HEALTH Overview</p>
        <p class="rest-report-meta"><strong>Checked:</strong> ${escapeHtml(checkedAtLabel)} | <strong>Range:</strong> ${escapeHtml(
          introBits.join(" | ")
        )} | <strong>Status:</strong> ${escapeHtml(sectionSummary)}</p>
        <p class="esm-health-overview-copy">${escapeHtml(
          report?.partial === true
            ? "Dashboard loaded with partial data. Sections with failures or CMU dimensional limits are flagged below."
            : "Dashboard loaded from Concurrency Monitoring / CMU using the current UnderPAR tenant context."
        )}</p>
        ${
          report?.error
            ? `<p class="esm-health-overview-copy esm-health-section-error">${escapeHtml(report.error)}</p>`
            : ""
        }
      </header>
    </article>

    <section class="esm-health-kpi-grid">
      <article class="rest-report-card esm-health-kpi-card">
        <header class="rest-report-head">
          <p class="esm-health-kpi-label">Started Sessions</p>
          <p class="esm-health-kpi-value">${escapeHtml(formatCompactNumber(summary.startedSessions || 0))}</p>
          <p class="esm-health-overview-copy">Total CM session starts for the selected tenant window.</p>
        </header>
      </article>
      <article class="rest-report-card esm-health-kpi-card">
        <header class="rest-report-head">
          <p class="esm-health-kpi-label">Completed Sessions</p>
          <p class="esm-health-kpi-value">${escapeHtml(formatCompactNumber(summary.completedSessions || 0))}</p>
          <p class="esm-health-overview-copy">${escapeHtml(formatPercent(summary.completionRate))} completion across started sessions.</p>
        </header>
      </article>
      <article class="rest-report-card esm-health-kpi-card">
        <header class="rest-report-head">
          <p class="esm-health-kpi-label">Failed Attempts</p>
          <p class="esm-health-kpi-value">${escapeHtml(formatCompactNumber(summary.failedAttempts || 0))}</p>
          <p class="esm-health-overview-copy">${escapeHtml(formatPercent(summary.failureRate))} failure rate.</p>
        </header>
      </article>
      <article class="rest-report-card esm-health-kpi-card">
        <header class="rest-report-head">
          <p class="esm-health-kpi-label">Interrupted Sessions</p>
          <p class="esm-health-kpi-value">${escapeHtml(
            formatCompactNumber((summary.dismissedSessions || 0) + (summary.killedSessions || 0))
          )}</p>
          <p class="esm-health-overview-copy">${escapeHtml(formatPercent(summary.interruptionRate))} dismissal + kill pressure.</p>
        </header>
      </article>
      <article class="rest-report-card esm-health-kpi-card">
        <header class="rest-report-head">
          <p class="esm-health-kpi-label">Active Users</p>
          <p class="esm-health-kpi-value">${escapeHtml(formatCompactNumber(summary.latestActiveUsers || 0))}</p>
          <p class="esm-health-overview-copy">${escapeHtml(summary.latestBucketLabel || "Latest CM bucket")} snapshot.</p>
        </header>
      </article>
      <article class="rest-report-card esm-health-kpi-card">
        <header class="rest-report-head">
          <p class="esm-health-kpi-label">Active Sessions</p>
          <p class="esm-health-kpi-value">${escapeHtml(formatCompactNumber(summary.latestActiveSessions || 0))}</p>
          <p class="esm-health-overview-copy">${escapeHtml(formatRatio(summary.avgSessionsPerUser))} average sessions per user.</p>
        </header>
      </article>
      <article class="rest-report-card esm-health-kpi-card">
        <header class="rest-report-head">
          <p class="esm-health-kpi-label">Hotspot Footprint</p>
          <p class="esm-health-kpi-value">${escapeHtml(formatCompactNumber(summary.activePlatforms || 0))}</p>
          <p class="esm-health-overview-copy">${escapeHtml(
            `${formatCompactNumber(summary.activeApplications || 0)} apps | ${formatCompactNumber(summary.activeChannels || 0)} channels`
          )}</p>
        </header>
      </article>
      <article class="rest-report-card esm-health-kpi-card">
        <header class="rest-report-head">
          <p class="esm-health-kpi-label">Pressure Buckets</p>
          <p class="esm-health-kpi-value">${escapeHtml(formatCompactNumber(summary.activeMvpds || 0))}</p>
          <p class="esm-health-overview-copy">${escapeHtml(
            `${formatCompactNumber(summary.activeConcurrencyLevels || 0)} concurrency | ${formatCompactNumber(summary.activeActivityLevels || 0)} activity`
          )}</p>
        </header>
      </article>
    </section>

    ${renderInsightCards(report)}

    <section class="esm-health-chart-grid">
      ${renderChartCard(
        "Started Sessions",
        latestBackbone?.startedSessions,
        "Daily, hourly, or monthly rollup of CM session starts.",
        backboneSeries,
        (entry) => Number(entry?.startedSessions || 0),
        formatCompactNumber,
        String(report?.sectionErrors?.backbone || "").trim()
      )}
      ${renderChartCard(
        "Active Sessions",
        latestBackbone?.activeSessions,
        "Current in-flight CM sessions over time.",
        backboneSeries,
        (entry) => Number(entry?.activeSessions || 0),
        formatCompactNumber,
        String(report?.sectionErrors?.backbone || "").trim()
      )}
      ${renderChartCard(
        "Active Users",
        latestBackbone?.activeUsers,
        "Unique active viewers represented by CM buckets.",
        backboneSeries,
        (entry) => Number(entry?.activeUsers || 0),
        formatCompactNumber,
        String(report?.sectionErrors?.backbone || "").trim()
      )}
      ${renderChartCard(
        "Completion Rate",
        latestBackbone?.completionRate,
        "Session completion ratio over time.",
        backboneSeries,
        (entry) => Number(entry?.completionRate || 0),
        formatPercent,
        String(report?.sectionErrors?.backbone || "").trim()
      )}
      ${renderChartCard(
        "Failure Rate",
        latestBackbone?.failureRate,
        "Failed-start pressure over time.",
        backboneSeries,
        (entry) => Number(entry?.failureRate || 0),
        formatPercent,
        String(report?.sectionErrors?.backbone || "").trim()
      )}
      ${renderChartCard(
        "Interruption Rate",
        latestBackbone?.interruptionRate,
        "Dismissed plus killed session pressure over time.",
        backboneSeries,
        (entry) => Number(entry?.interruptionRate || 0),
        formatPercent,
        String(report?.sectionErrors?.backbone || "").trim()
      )}
    </section>

    <section class="esm-health-table-grid">
      ${CM_HEALTH_BREAKDOWN_TABLES.map((table) =>
        renderBreakdownTable(
          table.key,
          table.title,
          table.copy,
          Array.isArray(report?.[table.rowsKey]) ? report[table.rowsKey] : [],
          table.columns,
          String(report?.sectionErrors?.[table.errorKey] || "").trim(),
          String(report?.sectionMessages?.[table.errorKey] || "").trim()
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
  setStatus("Running CM HEALTH dashboard...");
}

function handleReportResult(payload = {}) {
  state.loading = false;
  state.report = payload && typeof payload === "object" ? payload : null;
  syncQueryFromReport(payload);
  renderReport();
  syncActionButtonsDisabled();
  if (!state.report) {
    setStatus("No CM HEALTH data returned.", "error");
    return;
  }
  if (state.report.ok === true) {
    setStatus(`Loaded CM HEALTH dashboard (${Number(state.report.loadedSections || 0)}/${Number(state.report.totalSections || 0)} sections).`);
    return;
  }
  if (state.report.partial === true) {
    setStatus(
      `Loaded CM HEALTH dashboard with partial data (${Number(state.report.loadedSections || 0)}/${Number(
        state.report.totalSections || 0
      )} sections).`
    );
    return;
  }
  setStatus(String(state.report.error || "CM HEALTH query failed."), "error");
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
    if (state.loading || !state.query.initialized || !state.programmerId || !state.cmHealthReady) {
      return;
    }
    void runDashboard("Refreshing CM HEALTH dashboard for the selected UnderPAR context...");
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
      type: CM_HEALTH_WORKSPACE_MESSAGE_TYPE,
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

async function runDashboard(statusMessage = "Running CM HEALTH dashboard...") {
  if (state.loading) {
    return;
  }
  if (!state.cmHealthReady || !state.programmerId) {
    setStatus("No CM-enabled Media Company is selected in UnderPAR.", "error");
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
    setStatus(String(result?.error || "Unable to load CM HEALTH dashboard."), "error");
  }
}

async function rerunLatestReport() {
  if (state.loading) {
    return;
  }
  if (!state.query.initialized) {
    setStatus("No previous CM HEALTH report is available to refresh.", "error");
    return;
  }
  await runDashboard("Refreshing CM HEALTH dashboard...");
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
    state.query.channels = [];
  } else if (normalizedType === "platform") {
    state.query.platforms = toggleDrilldownArray(state.query.platforms, normalizedValue);
  } else if (normalizedType === "channel") {
    state.query.channels = toggleDrilldownArray(state.query.channels, normalizedValue);
    state.query.drilldownMvpdIds = [];
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
  const tableDefinition = CM_HEALTH_BREAKDOWN_TABLES.find((entry) => String(entry?.key || "").trim() === normalizedTableKey) || null;
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
  if (state.cmHealthReady) {
    await runDashboard("Resetting CM HEALTH filters...");
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
    if (message?.type !== CM_HEALTH_WORKSPACE_MESSAGE_TYPE || message?.channel !== "workspace-event") {
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
    setStatus(result?.error || "Unable to contact UnderPAR CM HEALTH controller.", "error");
  }
}

void init();
