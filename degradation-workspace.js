const DEGRADATION_WORKSPACE_MESSAGE_TYPE = "underpar:degradation-workspace";
const BLONDIE_BUTTON_STATES = new Set(["inactive", "ready", "active", "ack"]);
const BLONDIE_BUTTON_ACK_RESET_MS = 2000;
const BLONDIE_BUTTON_INACTIVE_MESSAGE =
  "No zip-zap without SLACKTIVATION.  Please feed ZIP.KEY to UP Tab inside Developer Tools";
const BLONDIE_BUTTON_ICON_URLS = (() => {
  const resolveIconUrl = (path) =>
    typeof chrome !== "undefined" && chrome?.runtime?.getURL ? chrome.runtime.getURL(path) : path;
  return {
    inactive: resolveIconUrl("icons/blondie-active.svg"),
    ready: resolveIconUrl("icons/blondie-slacktivated.svg"),
    active: resolveIconUrl("icons/blondie-ack.svg"),
    ack: resolveIconUrl("icons/blondie-inactive.svg"),
  };
})();
const blondieAckResetTimerByButton = new WeakMap();

const state = {
  windowId: 0,
  controllerOnline: false,
  adobePassEnvironment: null,
  slackReady: false,
  slackUserName: "",
  degradationReady: false,
  programmerId: "",
  programmerName: "",
  requestorId: "",
  mvpd: "",
  mvpdLabel: "",
  mvpdScopeLabel: "",
  selectionKey: "",
  appGuid: "",
  appName: "",
  reports: [],
  batchRunning: false,
  pendingAutoRerunCards: [],
  pendingAutoRerunSelectionKey: "",
  autoRerunInFlightSelectionKey: "",
  pendingWorkspaceDeeplink: null,
  pendingWorkspaceDeeplinkConsuming: false,
};

const els = {
  controllerState: document.getElementById("workspace-controller-state"),
  filterState: document.getElementById("workspace-filter-state"),
  status: document.getElementById("workspace-status"),
  rerunIndicator: document.getElementById("workspace-rerun-indicator"),
  blondieAllButton: document.getElementById("workspace-blondie-all"),
  rerunAllButton: document.getElementById("workspace-rerun-all"),
  clearButton: document.getElementById("workspace-clear-all"),
  cardsHost: document.getElementById("workspace-cards"),
  pageEnvBadge: document.getElementById("page-env-badge"),
  pageEnvBadgeValue: document.getElementById("page-env-badge-value"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
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

function getEnvironmentKey(environment = null) {
  return String(environment?.key || "").trim();
}

function getWorkspaceEnvironmentRegistry() {
  return globalThis.UnderParEnvironment || null;
}

function resolveWorkspaceAdobePassEnvironment(value = null) {
  const embedded = value && typeof value === "object" && !Array.isArray(value) ? value : null;
  const registry = getWorkspaceEnvironmentRegistry();
  if (embedded) {
    return registry?.getEnvironment ? registry.getEnvironment(embedded.key || embedded) : { ...embedded };
  }
  if (registry?.getEnvironment) {
    return registry.getEnvironment(value || "release-production");
  }
  return {
    key: "release-production",
    label: "Production",
    route: "release-production",
    mgmtBase: "https://mgmt.auth.adobe.com",
    degradationBase: "https://mgmt.auth.adobe.com/control/v3/degradation",
  };
}

function buildWorkspaceEnvironmentTooltip(environment) {
  const resolved = resolveWorkspaceAdobePassEnvironment(environment);
  const registry = getWorkspaceEnvironmentRegistry();
  if (registry?.buildEnvironmentBadgeTooltip) {
    return String(registry.buildEnvironmentBadgeTooltip(resolved, "degradation") || "").trim();
  }
  const route = String(resolved.route || "release-production").trim() || "release-production";
  const label = String(resolved.label || (route === "release-staging" ? "Staging" : "Production")).trim() || "Production";
  const mgmtBase = String(
    resolved.mgmtBase || (route === "release-staging" ? "https://mgmt.auth-staging.adobe.com" : "https://mgmt.auth.adobe.com")
  ).trim();
  const degradationBase = String(resolved.degradationBase || `${mgmtBase}/control/v3/degradation`).trim();
  return [`Environment : ${label}`, `DEGRADATION : ${degradationBase}`].join("\n").trim();
}

function renderWorkspaceEnvironmentBadge() {
  if (!els.pageEnvBadge || !els.pageEnvBadgeValue) {
    return;
  }
  const environment = resolveWorkspaceAdobePassEnvironment(state.adobePassEnvironment);
  const label = String(environment?.label || "").trim() || "Production";
  const title = buildWorkspaceEnvironmentTooltip(environment) || label;
  els.pageEnvBadgeValue.textContent = "";
  els.pageEnvBadgeValue.setAttribute("aria-hidden", "true");
  els.pageEnvBadge.title = title;
  els.pageEnvBadge.setAttribute("aria-label", title);
}

function buildWorkspaceDeeplinkSelectionKey(context = null) {
  const environmentKey = firstNonEmptyString([
    context?.environmentKey,
    context?.adobePassEnvironmentKey,
    getEnvironmentKey(state.adobePassEnvironment),
    getEnvironmentKey(resolveWorkspaceAdobePassEnvironment()),
  ]);
  const programmerId = String(context?.programmerId || "").trim();
  const requestorId = String(context?.requestorId || "").trim();
  const mvpd = String(context?.mvpd || "").trim();
  if (!programmerId) {
    return "";
  }
  return [environmentKey || "release-production", programmerId, requestorId || "*", mvpd || "*"].join("|");
}

function parseWorkspaceDeeplinkBoolean(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function normalizeWorkspaceDeeplinkEndpointKeys(value = null) {
  const rawValues = Array.isArray(value) ? value : String(value || "").split(",");
  const output = [];
  const seen = new Set();
  rawValues.forEach((entry) => {
    const normalized = String(entry || "").trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    output.push(normalized);
  });
  return output;
}

function parseWorkspaceDeeplinkPayloadFromLocation() {
  const query = String(window.location.hash || "").startsWith("#")
    ? window.location.hash.slice(1)
    : String(window.location.search || "").replace(/^\?/, "");
  if (!query) {
    return null;
  }
  const params = new URLSearchParams(query);
  const endpointKeys = normalizeWorkspaceDeeplinkEndpointKeys(params.get("endpointKeys") || params.get("endpointKey") || "");
  const endpointKey = firstNonEmptyString([params.get("endpointKey"), params.get("endpointPath"), endpointKeys[0]]).toLowerCase();
  const programmerId = String(params.get("programmerId") || "").trim();
  const requestorId = String(params.get("requestorId") || "").trim();
  if ((!endpointKey && endpointKeys.length === 0) || !programmerId || !requestorId) {
    return null;
  }
  const mvpd = String(params.get("mvpd") || "").trim();
  const includeAllMvpd = parseWorkspaceDeeplinkBoolean(params.get("includeAllMvpd") || "") || !mvpd;
  const environmentKey = firstNonEmptyString([
    params.get("environmentKey"),
    params.get("adobePassEnvironmentKey"),
    getEnvironmentKey(resolveWorkspaceAdobePassEnvironment()),
  ]);
  const selectionKey =
    String(params.get("selectionKey") || "").trim() ||
    buildWorkspaceDeeplinkSelectionKey({
      environmentKey,
      programmerId,
      requestorId,
      mvpd: includeAllMvpd ? "" : mvpd,
    });
  return {
    endpointKey: endpointKey || endpointKeys[0] || "",
    endpointKeys: endpointKeys.length > 0 ? endpointKeys : [endpointKey].filter(Boolean),
    endpointPath: String(params.get("endpointPath") || "").trim(),
    requestUrl: String(params.get("requestUrl") || "").trim(),
    displayNodeLabel: firstNonEmptyString([params.get("displayNodeLabel"), params.get("datasetLabel"), params.get("endpointTitle")]),
    programmerId,
    programmerName: String(params.get("programmerName") || "").trim(),
    requestorId,
    mvpd: includeAllMvpd ? "" : mvpd,
    mvpdLabel: String(params.get("mvpdLabel") || "").trim(),
    includeAllMvpd,
    environmentKey,
    environmentLabel: String(params.get("environmentLabel") || "").trim(),
    selectionKey,
    source: String(params.get("source") || "blondie-button").trim() || "blondie-button",
    createdAt: Math.max(0, Number(params.get("createdAt") || Date.now() || 0)),
  };
}

function clearWorkspaceDeeplinkFromLocation() {
  try {
    const nextUrl = new URL(window.location.href);
    nextUrl.hash = "";
    [
      "endpointKey",
      "endpointKeys",
      "endpointPath",
      "requestUrl",
      "displayNodeLabel",
      "datasetLabel",
      "endpointTitle",
      "programmerId",
      "programmerName",
      "requestorId",
      "mvpd",
      "mvpdLabel",
      "includeAllMvpd",
      "environmentKey",
      "environmentLabel",
      "selectionKey",
      "source",
      "createdAt",
    ].forEach((key) => nextUrl.searchParams.delete(key));
    const nextHref = `${String(nextUrl.pathname || "")}${String(nextUrl.search || "")}`;
    window.history.replaceState(null, document.title, nextHref || window.location.pathname);
  } catch {
    // Ignore history cleanup failures.
  }
}

function normalizeReport(report = null) {
  if (!report || typeof report !== "object") {
    return null;
  }
  const rows = Array.isArray(report.rows) ? report.rows : [];
  const columns = Array.isArray(report.columns)
    ? report.columns.map((value) => String(value || "").trim()).filter(Boolean)
    : rows.length > 0
      ? Object.keys(rows[0]).map((value) => String(value || "").trim()).filter(Boolean)
      : [];
  const normalized = {
    ...report,
    reportId: String(report.reportId || "").trim(),
    queryKey: String(report.queryKey || report.reportId || "").trim(),
    endpointTitle: String(report.endpointTitle || report.endpointPath || "DEGRADATION Status").trim(),
    mvpdScopeLabel: String(report.mvpdScopeLabel || "").trim(),
    requestUrl: String(report.requestUrl || "").trim(),
    statusText: String(report.statusText || "").trim(),
    error: String(report.error || "").trim(),
    columns,
    rows,
    rowCount: Number(report.rowCount || rows.length || 0),
    activeCount: Number(report.activeCount || 0),
    status: Number(report.status || 0),
    fetchedAt: Number(report.fetchedAt || 0),
    durationMs: Number(report.durationMs || 0),
    ok: report.ok === true,
    programmerId: String(report.programmerId || "").trim(),
    mvpd: String(report.mvpd || "").trim(),
    apiVersion: String(report.apiVersion || "").trim(),
    selectionKey: String(report.selectionKey || "").trim(),
  };
  return normalized;
}

function normalizeReports(reportList = []) {
  return (Array.isArray(reportList) ? reportList : [])
    .map((item) => normalizeReport(item))
    .filter(Boolean)
    .sort((left, right) => Number(right.fetchedAt || 0) - Number(left.fetchedAt || 0));
}

function getReportIdentity(report = null) {
  return firstNonEmptyString([report?.queryKey, report?.reportId]);
}

function getReportPayload(report = null) {
  if (!report || typeof report !== "object") {
    return null;
  }
  const mvpd = String(report.mvpd || "").trim();
  const requestorId = firstNonEmptyString([report.requestorId, report.programmerId, state.requestorId]);
  return {
    reportId: String(report.reportId || "").trim(),
    queryKey: String(report.queryKey || "").trim(),
    endpointKey: String(report.endpointKey || "").trim().toLowerCase(),
    endpointPath: String(report.endpointPath || "").trim(),
    requestUrl: String(report.requestUrl || "").trim(),
    programmerId: String(report.programmerId || "").trim(),
    requestorId,
    mvpd,
    mvpdScopeLabel: String(report.mvpdScopeLabel || "").trim(),
    includeAllMvpd: report?.includeAllMvpd === true || !mvpd,
    selectionKey: String(report.selectionKey || state.selectionKey || "").trim(),
  };
}

function setStatus(message = "", type = "info") {
  if (!els.status) {
    return;
  }
  const text = String(message || "").trim();
  els.status.textContent = text;
  els.status.classList.toggle("success", type === "success");
  els.status.classList.toggle("error", type === "error");
}

async function copyTextToClipboard(text = "") {
  const normalized = String(text || "");
  if (!normalized) {
    return false;
  }

  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(normalized);
      return true;
    } catch {
      // continue to fallback
    }
  }

  const textArea = document.createElement("textarea");
  textArea.value = normalized;
  textArea.setAttribute("readonly", "readonly");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  textArea.style.pointerEvents = "none";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    textArea.remove();
  }
  return copied;
}

function findReportById(reportId = "") {
  const normalizedId = String(reportId || "").trim();
  if (!normalizedId) {
    return null;
  }
  return state.reports.find((report) => String(report?.reportId || "").trim() === normalizedId) || null;
}

async function copyReportRequestUrl(reportId = "") {
  const report = findReportById(reportId);
  if (!report) {
    return;
  }
  const requestUrl = firstNonEmptyString([report.requestUrl]);
  if (!requestUrl) {
    setStatus("Request URL unavailable for copy.", "error");
    return;
  }
  const copied = await copyTextToClipboard(requestUrl);
  if (copied) {
    setStatus("DEGRADATION request URL copied.", "success");
  } else {
    setStatus("Unable to copy DEGRADATION request URL.", "error");
  }
}

function syncActionButtonsDisabled() {
  const hasCards = state.reports.length > 0;
  const isBusy = state.batchRunning === true;
  if (els.blondieAllButton) {
    els.blondieAllButton.disabled = isBusy || !hasCards;
    els.blondieAllButton.classList.toggle("net-busy", isBusy);
    els.blondieAllButton.setAttribute("aria-busy", isBusy ? "true" : "false");
  }
  if (els.rerunAllButton) {
    els.rerunAllButton.disabled = isBusy || !hasCards;
    els.rerunAllButton.classList.toggle("net-busy", isBusy);
    els.rerunAllButton.setAttribute("aria-busy", isBusy ? "true" : "false");
    els.rerunAllButton.title = isBusy ? "Re-run all (loading...)" : "Re-run all";
  }
  if (els.rerunIndicator) {
    els.rerunIndicator.hidden = !isBusy;
  }
  if (els.clearButton) {
    els.clearButton.disabled = isBusy || !hasCards;
  }
}

function canUseBlondieButton() {
  return state.slackReady === true;
}

function getBlondieButtonDefaultState() {
  return canUseBlondieButton() ? "ready" : "inactive";
}

function clearBlondieButtonAckReset(button) {
  const timerId = blondieAckResetTimerByButton.get(button);
  if (timerId) {
    window.clearTimeout(timerId);
    blondieAckResetTimerByButton.delete(button);
  }
}

function getBlondieButtonState(button = null) {
  const stateValue = String(button?.dataset?.blondieState || "").trim().toLowerCase();
  return BLONDIE_BUTTON_STATES.has(stateValue) ? stateValue : getBlondieButtonDefaultState();
}

function getBlondieButtonTitle(buttonState = "") {
  const normalizedState = BLONDIE_BUTTON_STATES.has(String(buttonState || "").trim().toLowerCase())
    ? String(buttonState || "").trim().toLowerCase()
    : getBlondieButtonDefaultState();
  if (normalizedState === "active") {
    return ":blondiebtn: is delivering your Slack CSV...";
  }
  if (normalizedState === "ack") {
    return "Slack acknowledged :blondiebtn: delivery.";
  }
  if (canUseBlondieButton()) {
    return "zip-zip data to SLACK when it's sitting in SLACKTIVATED state";
  }
  return BLONDIE_BUTTON_INACTIVE_MESSAGE;
}

function renderBlondieButtonState(button, nextState = "", options = {}) {
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }
  const preserveTimer = options?.preserveTimer === true;
  if (!preserveTimer) {
    clearBlondieButtonAckReset(button);
  }
  let normalizedState = String(nextState || "").trim().toLowerCase();
  if (!BLONDIE_BUTTON_STATES.has(normalizedState)) {
    normalizedState = getBlondieButtonDefaultState();
  }
  const title = getBlondieButtonTitle(normalizedState);
  button.dataset.blondieState = normalizedState;
  button.disabled = false;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.setAttribute("aria-busy", normalizedState === "active" ? "true" : "false");
  const icon = button.querySelector(".underpar-blondie-icon");
  if (icon instanceof HTMLImageElement) {
    icon.src = BLONDIE_BUTTON_ICON_URLS[normalizedState] || BLONDIE_BUTTON_ICON_URLS.inactive;
  }
}

function queueBlondieButtonAckReset(button) {
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }
  clearBlondieButtonAckReset(button);
  const timerId = window.setTimeout(() => {
    blondieAckResetTimerByButton.delete(button);
    renderBlondieButtonState(button, getBlondieButtonDefaultState());
  }, BLONDIE_BUTTON_ACK_RESET_MS);
  blondieAckResetTimerByButton.set(button, timerId);
}

function syncBlondieButtons(root = document) {
  if (!root?.querySelectorAll) {
    return;
  }
  root.querySelectorAll(".underpar-blondie-btn").forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    const currentState = getBlondieButtonState(button);
    if (!canUseBlondieButton()) {
      renderBlondieButtonState(button, "inactive");
      return;
    }
    if (currentState === "active" || currentState === "ack") {
      renderBlondieButtonState(button, currentState, { preserveTimer: true });
      return;
    }
    renderBlondieButtonState(button, "ready");
  });
}

function sanitizeCsvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function sanitizeFileNameSegment(value, fallback = "value") {
  const text = String(value || "")
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return text || fallback;
}

function formatDegradationReportCellValue(rawValue) {
  if (rawValue == null) {
    return "N/A";
  }
  if (Array.isArray(rawValue)) {
    const compactValues = rawValue.map((item) => formatDegradationReportCellValue(item)).filter((item) => item && item !== "N/A");
    return compactValues.length > 0 ? compactValues.join(" | ") : "N/A";
  }
  if (typeof rawValue === "object") {
    const preferred = firstNonEmptyString([
      rawValue.id,
      rawValue.name,
      rawValue.label,
      rawValue.value,
      rawValue.status,
      rawValue.message,
    ]);
    return preferred || "Structured value";
  }
  const text = String(rawValue).trim();
  if (!text) {
    return "N/A";
  }
  if (
    (text.startsWith("{") && text.endsWith("}")) ||
    (text.startsWith("[") && text.endsWith("]")) ||
    (text.startsWith("<") && text.endsWith(">"))
  ) {
    return "Structured value";
  }
  return text;
}

function buildDegradationReportCsvFileName(report = null) {
  const mediaCompany = sanitizeFileNameSegment(firstNonEmptyString([state.programmerName, state.programmerId]), "MediaCompany");
  const endpoint = sanitizeFileNameSegment(firstNonEmptyString([report?.endpointKey, report?.endpointPath, report?.endpointTitle]), "dgr");
  const requestor = sanitizeFileNameSegment(firstNonEmptyString([report?.programmerId, state.requestorId]), "requestor");
  const scope = sanitizeFileNameSegment(report?.mvpd || "all-mvpds", "all-mvpds");
  const rawEnvironment = String(report?.requestUrl || state.adobePassEnvironment?.degradationBase || "").trim().toLowerCase();
  const envTag = rawEnvironment.includes("staging") || rawEnvironment.includes("stage") ? "STAGE" : "PROD";
  const stamp = new Date(report?.fetchedAt || Date.now()).toISOString().replace(/[:.]/g, "-");
  return `${mediaCompany}_clickDGR_${endpoint}_${requestor}_${scope}_${envTag}_${stamp}.csv`;
}

function triggerFileDownload(content, fileName, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

function downloadDegradationReportCsv(reportId = "") {
  const report = findReportById(reportId);
  if (!report || !report.ok) {
    return;
  }
  const columns = Array.isArray(report.columns) ? report.columns : [];
  const rows = Array.isArray(report.rows) ? report.rows : [];
  if (columns.length === 0 || rows.length === 0) {
    return;
  }
  const csvBody = [
    columns.map((column) => sanitizeCsvCell(column)).join(","),
    ...rows.map((row) => columns.map((column) => sanitizeCsvCell(formatDegradationReportCellValue(row?.[column]))).join(",")),
  ].join("\n");
  triggerFileDownload(csvBody, buildDegradationReportCsvFileName(report), "text/csv;charset=utf-8");
}

function buildDegradationBlondieScopeLabel(report = null) {
  const requestorId = firstNonEmptyString([report?.requestorId, report?.programmerId, state.requestorId, "N/A"]);
  const scopeLabel = firstNonEmptyString([
    report?.mvpdScopeLabel,
    report?.includeAllMvpd === true || !String(report?.mvpd || "").trim() ? "ALL MVPDs" : "",
    report?.mvpd,
    state.mvpdScopeLabel,
    "ALL MVPDs",
  ]);
  return `${requestorId} X ${scopeLabel}`;
}

function buildDegradationBlondieStatusSummary(report = null) {
  if (!report || typeof report !== "object") {
    return "";
  }
  const scopeLabel = buildDegradationBlondieScopeLabel(report);
  if (report.ok === true) {
    const activeCount = Math.max(0, Number(report.activeCount || report.rowCount || 0));
    if (Number(report.rowCount || 0) > 0) {
      return `${activeCount} active rule${activeCount === 1 ? "" : "s"} for ${scopeLabel}.`;
    }
    return `No rules active for ${scopeLabel}.`;
  }
  const httpLabel = Number(report.status || 0) > 0 ? `HTTP ${Number(report.status || 0)} ${String(report.statusText || "").trim()}`.trim() : "Request Error";
  const message = String(report.error || "Request failed.").trim() || "Request failed.";
  return `${httpLabel}: ${message}`;
}

function buildDegradationBlondieReportItem(report = null) {
  if (!report || typeof report !== "object") {
    return null;
  }
  const title = firstNonEmptyString([report.endpointTitle, report.endpointKey, report.endpointPath, "DEGRADATION Status"]);
  const summary = buildDegradationBlondieStatusSummary(report);
  if (!title || !summary) {
    return null;
  }
  return {
    title,
    summary,
    requestUrl: String(report.requestUrl || "").trim(),
    endpointKey: String(report.endpointKey || "").trim().toLowerCase(),
    endpointPath: String(report.endpointPath || "").trim(),
    rowCount: Math.max(0, Number(report.rowCount || 0)),
    activeCount: Math.max(0, Number(report.activeCount || 0)),
    ok: report.ok === true,
    status: Math.max(0, Number(report.status || 0)),
    statusText: String(report.statusText || "").trim(),
    error: String(report.error || "").trim(),
  };
}

function buildDegradationBlondieExportPayload(report = null) {
  const reportItem = buildDegradationBlondieReportItem(report);
  if (!reportItem) {
    return null;
  }
  const requestorId = firstNonEmptyString([report.requestorId, report.programmerId, state.requestorId]);
  const mediaCompanyId = String(state.programmerId || "").trim();
  const environmentKey = getEnvironmentKey(state.adobePassEnvironment) || "release-production";
  const includeAllMvpd = report?.includeAllMvpd === true || !String(report.mvpd || "").trim();
  return {
    workspaceKey: "degradation",
    workspaceLabel: "DEGRADATION",
    displayNodeLabel: String(report.endpointTitle || "DEGRADATION Status").trim(),
    datasetLabel: `${String(report.endpointTitle || "DEGRADATION Status").trim()} | ${getNoRulesScopeLabel(report)}`,
    requestLabel: String(report.endpointTitle || "DEGRADATION Status").trim(),
    requestUrl: String(report.requestUrl || "").trim(),
    programmerId: mediaCompanyId,
    programmerName: String(state.programmerName || "").trim(),
    requestorId,
    mvpd: includeAllMvpd ? "" : String(report.mvpd || "").trim(),
    mvpdLabel: String(state.mvpdLabel || "").trim(),
    mvpdScopeLabel: String(report.mvpdScopeLabel || state.mvpdScopeLabel || "").trim(),
    adobePassEnvironmentKey: environmentKey,
    adobePassEnvironmentLabel: String(state.adobePassEnvironment?.label || "").trim(),
    endpointKey: String(report.endpointKey || "").trim().toLowerCase(),
    endpointPath: String(report.endpointPath || "").trim(),
    endpointKeys: [String(report.endpointKey || "").trim().toLowerCase()].filter(Boolean),
    includeAllMvpd,
    selectionKey:
      String(report.selectionKey || state.selectionKey || "").trim() ||
      buildWorkspaceDeeplinkSelectionKey({
        environmentKey,
        programmerId: mediaCompanyId,
        requestorId,
        mvpd: includeAllMvpd ? "" : String(report.mvpd || "").trim(),
      }),
    messageOnly: true,
    skipCsvAttachment: true,
    reportCount: 1,
    reportItems: [reportItem],
    columns: [],
    rows: [],
    rowCount: Math.max(0, Number(report.rowCount || 0)),
  };
}

function buildDegradationBlondieBatchExportPayload(reportList = state.reports) {
  const reports = Array.isArray(reportList) ? reportList.filter((report) => report && typeof report === "object") : [];
  const reportItems = reports.map((report) => buildDegradationBlondieReportItem(report)).filter(Boolean);
  if (reportItems.length === 0) {
    return null;
  }
  const requestorId = firstNonEmptyString([state.requestorId, reports[0]?.requestorId, reports[0]?.programmerId, ""]);
  const mvpd = String(state.mvpd || reports[0]?.mvpd || "").trim();
  const includeAllMvpd = !mvpd;
  const endpointKeys = [...new Set(reportItems.map((item) => String(item.endpointKey || "").trim().toLowerCase()).filter(Boolean))];
  const mediaCompanyId = String(state.programmerId || "").trim();
  const environmentKey = getEnvironmentKey(state.adobePassEnvironment) || "release-production";
  const scopeLabel = firstNonEmptyString([state.mvpdScopeLabel, includeAllMvpd ? "ALL MVPDs" : mvpd, "ALL MVPDs"]);
  return {
    workspaceKey: "degradation",
    workspaceLabel: "DEGRADATION",
    displayNodeLabel: endpointKeys.length > 1 ? "DEGRADATION GET ALL" : reportItems[0].title,
    datasetLabel: `${endpointKeys.length > 1 ? "DEGRADATION GET ALL" : reportItems[0].title} | ${requestorId || "N/A"} X ${scopeLabel}`,
    requestLabel: endpointKeys.length > 1 ? "GET ALL" : reportItems[0].title,
    requestUrl: endpointKeys.length === 1 ? String(reportItems[0].requestUrl || "").trim() : "",
    programmerId: mediaCompanyId,
    programmerName: String(state.programmerName || "").trim(),
    requestorId,
    mvpd: includeAllMvpd ? "" : mvpd,
    mvpdLabel: String(state.mvpdLabel || "").trim(),
    mvpdScopeLabel: scopeLabel,
    adobePassEnvironmentKey: environmentKey,
    adobePassEnvironmentLabel: String(state.adobePassEnvironment?.label || "").trim(),
    endpointKey: endpointKeys.length > 1 ? "all" : endpointKeys[0] || "",
    endpointPath: endpointKeys.length > 1 ? "all" : endpointKeys[0] || "",
    endpointKeys,
    includeAllMvpd,
    selectionKey:
      String(state.selectionKey || "").trim() ||
      buildWorkspaceDeeplinkSelectionKey({
        environmentKey,
        programmerId: mediaCompanyId,
        requestorId,
        mvpd: includeAllMvpd ? "" : mvpd,
      }),
    messageOnly: true,
    skipCsvAttachment: true,
    reportCount: reportItems.length,
    reportItems,
    columns: [],
    rows: [],
    rowCount: reports.reduce((count, report) => count + Math.max(0, Number(report?.rowCount || 0)), 0),
  };
}

function buildBlondieButtonMarkup(reportIdAttr = "") {
  const initialState = getBlondieButtonDefaultState();
  const title = escapeHtml(getBlondieButtonTitle(initialState));
  return `<button type="button" class="degradation-report-action-btn underpar-blondie-btn" data-action="blondie-export" data-report-id="${reportIdAttr}" data-blondie-state="${escapeHtml(initialState)}" title="${title}" aria-label="${title}">
          <img class="underpar-blondie-icon" src="${escapeHtml(BLONDIE_BUTTON_ICON_URLS[initialState])}" alt="" aria-hidden="true" />
        </button>`;
}

function renderReportFooter(report = null) {
  if (!report || typeof report !== "object") {
    return "";
  }
  const reportIdAttr = escapeHtml(String(report.reportId || ""));
  const hasCsv = report.ok === true && Number(report.rowCount || 0) > 0;
  return `
    <footer class="degradation-report-footer">
      <div class="underpar-export-actions">
        ${buildBlondieButtonMarkup(reportIdAttr)}
        ${hasCsv ? `<a class="degradation-report-csv-link" href="#" data-action="download-csv" data-report-id="${reportIdAttr}">CSV</a>` : ""}
      </div>
      <div class="degradation-report-footer-controls">
        <p class="degradation-report-last-modified">Last modified: ${escapeHtml(new Date(report.fetchedAt || Date.now()).toLocaleString())}</p>
      </div>
    </footer>
  `;
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
  const requestor = String(state.requestorId || "").trim();
  const mvpdScope = String(state.mvpdScopeLabel || "").trim() || "ALL MVPDs";
  return `Requestor: ${requestor || "N/A"} | Scope: ${mvpdScope}`;
}

function updateControllerBanner() {
  if (els.controllerState) {
    els.controllerState.textContent = `DEGRADATION Workspace | ${getProgrammerLabel()}`;
  }
  if (els.filterState) {
    els.filterState.textContent = getFilterLabel();
  }
  renderWorkspaceEnvironmentBadge();
  syncActionButtonsDisabled();
}

function getCurrentRerunCards(reportList = state.reports) {
  return (Array.isArray(reportList) ? reportList : [])
    .map((report) => getReportPayload(report))
    .filter((card) => card && card.endpointKey);
}

function clearPendingAutoRerun() {
  state.pendingAutoRerunCards = [];
  state.pendingAutoRerunSelectionKey = "";
  state.autoRerunInFlightSelectionKey = "";
}

function hasWorkspaceRefreshTransition() {
  return state.pendingAutoRerunCards.length > 0 || Boolean(String(state.autoRerunInFlightSelectionKey || "").trim());
}

function queuePendingAutoRerun(nextSelectionKey = "") {
  const cards = getCurrentRerunCards();
  if (cards.length === 0) {
    return false;
  }
  state.pendingAutoRerunCards = cards;
  state.pendingAutoRerunSelectionKey = String(nextSelectionKey || state.selectionKey || "").trim();
  const reportLabel = `${cards.length} report${cards.length === 1 ? "" : "s"}`;
  setStatus(`Refreshing ${reportLabel} for ${getProgrammerLabel()}...`);
  return true;
}

function maybeConsumePendingAutoRerun() {
  if (state.batchRunning || state.controllerOnline !== true || state.degradationReady !== true) {
    return;
  }
  const cards = Array.isArray(state.pendingAutoRerunCards)
    ? state.pendingAutoRerunCards.filter((card) => card && card.endpointKey)
    : [];
  if (cards.length === 0) {
    state.pendingAutoRerunCards = [];
    state.pendingAutoRerunSelectionKey = "";
    return;
  }
  const expectedSelectionKey = String(state.pendingAutoRerunSelectionKey || "").trim();
  const currentSelectionKey = String(state.selectionKey || "").trim();
  if (expectedSelectionKey && currentSelectionKey && expectedSelectionKey !== currentSelectionKey) {
    return;
  }
  const inFlightSelectionKey = expectedSelectionKey || currentSelectionKey;
  state.autoRerunInFlightSelectionKey = inFlightSelectionKey;
  void rerunAllCards({
    cards,
    reason: "manual-reload",
    selectionKey: expectedSelectionKey || currentSelectionKey,
  }).then((started) => {
    if (!started) {
      if (String(state.autoRerunInFlightSelectionKey || "").trim() === inFlightSelectionKey) {
        state.autoRerunInFlightSelectionKey = "";
      }
      return;
    }
    state.pendingAutoRerunCards = [];
    state.pendingAutoRerunSelectionKey = "";
  });
}

function buildPendingWorkspaceDeeplinkContextLabel(pending = null) {
  if (!pending || typeof pending !== "object") {
    return "";
  }
  const environmentLabel = firstNonEmptyString([pending.environmentLabel, pending.environmentKey]);
  const programmerLabel = firstNonEmptyString([pending.programmerName, pending.programmerId]);
  const requestorLabel = String(pending.requestorId || "").trim();
  const mvpdLabel = pending.includeAllMvpd === true ? "ALL MVPDs" : firstNonEmptyString([pending.mvpdLabel, pending.mvpd]);
  return [environmentLabel, programmerLabel, requestorLabel, mvpdLabel].filter(Boolean).join(" / ");
}

function buildPendingWorkspaceDeeplinkReportLabel(pending = null) {
  if (!pending || typeof pending !== "object") {
    return "the saved DEGRADATION request";
  }
  if (Array.isArray(pending.endpointKeys) && pending.endpointKeys.length > 1) {
    return firstNonEmptyString([pending.displayNodeLabel, "the saved DEGRADATION GET ALL request"]);
  }
  return firstNonEmptyString([pending.displayNodeLabel, pending.endpointKey, "the saved DEGRADATION request"]);
}

function buildPendingWorkspaceDeeplinkSetupMessage(pending = null) {
  const reportLabel = buildPendingWorkspaceDeeplinkReportLabel(pending);
  const contextLabel = buildPendingWorkspaceDeeplinkContextLabel(pending);
  if (contextLabel) {
    return `To rerun ${reportLabel} from Slack, set up DEGRADATION for ${contextLabel}. It will run once the setup matches.`;
  }
  return `Set up DEGRADATION to rerun ${reportLabel} from Slack.`;
}

async function maybeConsumePendingWorkspaceDeeplink() {
  const pending = state.pendingWorkspaceDeeplink;
  if (!pending || state.pendingWorkspaceDeeplinkConsuming) {
    return;
  }
  if (!state.controllerOnline) {
    return;
  }
  if (!state.degradationReady || !String(state.programmerId || "").trim()) {
    setStatus(buildPendingWorkspaceDeeplinkSetupMessage(pending), "info");
    return;
  }
  const currentSelectionKey =
    String(state.selectionKey || "").trim() ||
    buildWorkspaceDeeplinkSelectionKey({
      environmentKey: getEnvironmentKey(state.adobePassEnvironment),
      programmerId: state.programmerId,
      requestorId: state.requestorId,
      mvpd: state.mvpd,
    });
  const expectedSelectionKey = String(pending.selectionKey || "").trim();
  if (expectedSelectionKey && currentSelectionKey !== expectedSelectionKey) {
    setStatus(buildPendingWorkspaceDeeplinkSetupMessage(pending), "info");
    return;
  }

  state.pendingWorkspaceDeeplinkConsuming = true;
  try {
    const endpointKeys =
      Array.isArray(pending.endpointKeys) && pending.endpointKeys.length > 0
        ? pending.endpointKeys
        : [String(pending.endpointKey || "").trim().toLowerCase()].filter(Boolean);
    const started = await rerunAllCards({
      cards: endpointKeys.map((endpointKey, index) => ({
          reportId: "workspace-deeplink",
          queryKey: endpointKey || pending.endpointKey,
          endpointKey,
          endpointPath: index === 0 ? pending.endpointPath : "",
          requestUrl: pending.requestUrl,
          programmerId: pending.requestorId,
          requestorId: pending.requestorId,
          mvpd: pending.mvpd,
          includeAllMvpd: pending.includeAllMvpd === true || !pending.mvpd,
          selectionKey: pending.selectionKey,
        })),
      reason: "workspace-deeplink",
      selectionKey: pending.selectionKey,
    });
    if (!started) {
      return;
    }
    state.pendingWorkspaceDeeplink = null;
    clearWorkspaceDeeplinkFromLocation();
  } finally {
    state.pendingWorkspaceDeeplinkConsuming = false;
  }
}

function applyControllerState(payload = {}) {
  const previousSelectionKey = String(state.selectionKey || "").trim();
  const previousProgrammerId = String(state.programmerId || "").trim();
  const previousProgrammerName = String(state.programmerName || "").trim();
  const previousEnvironmentKey = getEnvironmentKey(state.adobePassEnvironment);
  const controllerReason = String(payload?.controllerReason || "").trim().toLowerCase();
  const nextEnvironment =
    payload?.adobePassEnvironment && typeof payload.adobePassEnvironment === "object"
      ? {
          ...payload.adobePassEnvironment,
        }
      : state.adobePassEnvironment;
  const nextEnvironmentKey = getEnvironmentKey(nextEnvironment);
  const nextProgrammerId = String(payload?.programmerId || "");
  const nextProgrammerName = String(payload?.programmerName || "");
  const nextSelectionKey = String(payload?.selectionKey || previousSelectionKey || "").trim();
  const selectionChanged = Boolean(previousSelectionKey && nextSelectionKey && previousSelectionKey !== nextSelectionKey);
  const environmentChanged = Boolean(previousEnvironmentKey && nextEnvironmentKey && previousEnvironmentKey !== nextEnvironmentKey);
  const programmerChanged =
    Boolean(previousProgrammerId || previousProgrammerName) &&
    (previousProgrammerId !== String(nextProgrammerId || "").trim() ||
      (previousProgrammerName &&
        nextProgrammerName &&
        previousProgrammerName.toLowerCase() !== String(nextProgrammerName || "").trim().toLowerCase()));

  state.controllerOnline = payload?.controllerOnline === true;
  state.adobePassEnvironment = nextEnvironment;
  state.degradationReady = payload?.degradationReady === true;
  state.slackReady = payload?.slack?.ready === true;
  state.slackUserName = String(payload?.slack?.userName || "").trim();
  state.programmerId = nextProgrammerId;
  state.programmerName = nextProgrammerName;
  state.requestorId = String(payload?.requestorId || "");
  state.mvpd = String(payload?.mvpd || "");
  state.mvpdLabel = String(payload?.mvpdLabel || "");
  state.mvpdScopeLabel = String(payload?.mvpdScopeLabel || "");
  state.selectionKey = nextSelectionKey;
  state.appGuid = String(payload?.appGuid || "");
  state.appName = String(payload?.appName || "");
  const selectionTransition = selectionChanged || environmentChanged || programmerChanged;
  const shouldSuppressAutoRerun = Boolean(state.pendingWorkspaceDeeplink) || controllerReason.includes("deeplink");
  if (selectionTransition && shouldSuppressAutoRerun) {
    clearPendingAutoRerun();
    if (state.reports.length > 0) {
      clearWorkspaceCards();
    }
  } else if (selectionTransition && state.reports.length > 0) {
    queuePendingAutoRerun(nextSelectionKey);
  } else if (selectionTransition && state.reports.length === 0) {
    state.pendingAutoRerunCards = [];
    state.pendingAutoRerunSelectionKey = String(nextSelectionKey || "").trim();
  }
  updateControllerBanner();
  syncBlondieButtons();
  syncActionButtonsDisabled();
  maybeConsumePendingAutoRerun();
  void maybeConsumePendingWorkspaceDeeplink();
}

function getScopeValues(report = null) {
  const requestor = firstNonEmptyString([report?.programmerId, state.requestorId, "N/A"]);
  const scope = firstNonEmptyString([report?.mvpdScopeLabel, report?.mvpd, state.mvpdScopeLabel, "ALL MVPDs"]);
  return {
    requestor,
    scope,
  };
}

function getNoRulesScopeLabel(report = null) {
  const { requestor, scope } = getScopeValues(report);
  return `${requestor} X ${scope}`;
}

function getNoRulesActiveMessage(report = null) {
  return `No rules active for ${getNoRulesScopeLabel(report)}.`;
}

function renderScopeEmphasisHtml(report = null) {
  const { requestor, scope } = getScopeValues(report);
  return `<span class="degradation-report-scope-value">${escapeHtml(requestor)}</span><span class="degradation-report-scope-sep"> X </span><span class="degradation-report-scope-value">${escapeHtml(scope)}</span>`;
}

function renderNoRulesCompactHtml(report = null) {
  const methodLabel = firstNonEmptyString([report?.endpointTitle, "DEGRADATION Status"]);
  return `${escapeHtml(methodLabel)}: No rules active for ${renderScopeEmphasisHtml(report)}.`;
}

function renderTable(report = null) {
  const columns = Array.isArray(report?.columns) ? report.columns : [];
  const rows = Array.isArray(report?.rows) ? report.rows : [];
  if (columns.length === 0 || rows.length === 0) {
    return `<p class="degradation-report-empty">${escapeHtml(getNoRulesActiveMessage(report))}</p>`;
  }

  const headerHtml = columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("");

  const bodyHtml = rows
    .map((row) => {
      const cells = columns
        .map((column) => {
          const raw = row?.[column];
          const value = formatDegradationReportCellValue(raw);
          if (String(column).trim().toLowerCase() === "active") {
            const isActive = value.toUpperCase() === "YES";
            const pillClass = isActive ? "degradation-active-pill" : "degradation-active-pill no";
            const pillLabel = isActive ? "YES" : "NO";
            return `<td><span class="${pillClass}">${pillLabel}</span></td>`;
          }
          return `<td>${escapeHtml(value || "N/A")}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `
    <div class="degradation-report-table-wrap">
      <table class="degradation-report-table">
        <thead>
          <tr>${headerHtml}</tr>
        </thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    </div>
  `;
}

function renderReportCard(report = null) {
  if (!report || typeof report !== "object") {
    return "";
  }
  const requestLine = firstNonEmptyString([
    report.requestUrl,
    `${report.endpointPath || ""}${report.programmerId ? `?programmer=${report.programmerId}` : ""}`,
  ]);
  const statusTitle = `GET: ${requestLine || "N/A"}`;
  const footerMarkup = renderReportFooter(report);
  if (report.ok && Number(report.rowCount || 0) === 0) {
    return `
      <article class="degradation-report-card degradation-report-card--no-active">
        <p class="degradation-report-no-active-line">
          <button
            type="button"
            class="degradation-report-no-active-copy"
            data-action="copy-request-url"
            data-report-id="${escapeHtml(String(report.reportId || ""))}"
            title="${escapeHtml(statusTitle)}"
            aria-label="Copy DEGRADATION request URL to clipboard"
          >${renderNoRulesCompactHtml(report)}</button>
        </p>
        ${footerMarkup}
      </article>
    `;
  }
  const activeRules = Number(report.activeCount || report.rowCount || 0);
  const activeRuleLabel = `${activeRules} active rule${activeRules === 1 ? "" : "s"}`;
  const programmerScopeHtml = renderScopeEmphasisHtml(report);
  const httpLabel = report.status > 0 ? `HTTP ${report.status} ${report.statusText || ""}`.trim() : "Request Error";
  const errorMarkup = report.ok
    ? ""
    : `<p class="degradation-report-error">${escapeHtml(report.error || "Request failed.")}</p>`;
  return `
    <article class="degradation-report-card">
      <header class="degradation-report-head">
        <div class="degradation-report-title-row">
          <p class="degradation-report-title">${escapeHtml(report.endpointTitle || "DEGRADATION Status")}</p>
          <p class="degradation-report-http ${report.ok ? "" : "error"}">${escapeHtml(httpLabel)}</p>
        </div>
        <p class="degradation-report-subtitle">${programmerScopeHtml}</p>
        <p class="degradation-report-meta">${escapeHtml(report.ok ? activeRuleLabel : "Request failed")}</p>
      </header>
      ${errorMarkup}
      ${report.ok ? renderTable(report) : ""}
      ${footerMarkup}
    </article>
  `;
}

function renderReports() {
  if (!els.cardsHost) {
    return;
  }
  if (state.reports.length === 0) {
    els.cardsHost.innerHTML = "";
    syncActionButtonsDisabled();
    return;
  }
  const cardsMarkup = state.reports.map((report) => renderReportCard(report)).join("");
  els.cardsHost.innerHTML = cardsMarkup;
  syncBlondieButtons(els.cardsHost);
  syncActionButtonsDisabled();
}

function replaceReports(reportList = []) {
  state.reports = normalizeReports(reportList);
  renderReports();
}

function upsertReport(report = null) {
  const normalized = normalizeReport(report);
  if (!normalized) {
    return;
  }
  const identity = getReportIdentity(normalized);
  const nextReports = [];
  let inserted = false;

  if (identity) {
    nextReports.push(normalized);
    inserted = true;
    state.reports.forEach((existing) => {
      const existingIdentity = getReportIdentity(existing);
      if (!existingIdentity || existingIdentity !== identity) {
        nextReports.push(existing);
      }
    });
  }

  if (!inserted) {
    nextReports.push(normalized, ...state.reports);
  }

  state.reports = normalizeReports(nextReports).slice(0, 30);
  if (normalized.selectionKey) {
    state.selectionKey = normalized.selectionKey;
  }
  renderReports();
}

function clearWorkspaceCards() {
  state.reports = [];
  renderReports();
}

function handleReportsSync(payload = {}) {
  const reports = normalizeReports(payload?.reports);
  const selectionKey = String(payload?.selectionKey || "").trim();
  if (selectionKey) {
    state.selectionKey = selectionKey;
  }
  if (hasWorkspaceRefreshTransition()) {
    return;
  }
  replaceReports(reports);
  if (reports.length > 0) {
    setStatus(`Loaded ${reports.length} DEGRADATION report card${reports.length === 1 ? "" : "s"}.`, "success");
  } else {
    setStatus("No DEGRADATION report cards are cached for this selection.", "info");
  }
}

function handleReportResult(payload = {}) {
  const report = normalizeReport(payload);
  if (!report) {
    return;
  }
  upsertReport(report);
  if (report.ok) {
    setStatus("", "info");
  } else {
    setStatus(`${report.endpointTitle}: ${report.error || "Request failed."}`, "error");
  }
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
  if (event === "reports-sync") {
    handleReportsSync(payload);
    return;
  }
  if (event === "report-result") {
    handleReportResult(payload);
    return;
  }
  if (event === "batch-start") {
    state.batchRunning = true;
    syncActionButtonsDisabled();
    const total = Number(payload?.total || 0);
    const reason = String(payload?.reason || "").trim().toLowerCase();
    if (reason === "workspace-deeplink") {
      setStatus(total === 1 ? "Loading DEGRADATION report from Slack..." : `Loading ${total} DEGRADATION reports from Slack...`);
    } else if (reason === "manual-reload") {
      setStatus(total > 0 ? `Reloading ${total} report(s)...` : "Reloading reports...");
    } else {
      setStatus(total > 0 ? `Re-running ${total} report(s)...` : "Re-running reports...");
    }
    return;
  }
  if (event === "batch-end") {
    state.batchRunning = false;
    state.autoRerunInFlightSelectionKey = "";
    syncActionButtonsDisabled();
    const total = Number(payload?.total || 0);
    const reason = String(payload?.reason || "").trim().toLowerCase();
    if (reason === "workspace-deeplink") {
      setStatus(total === 1 ? "Loaded DEGRADATION report from Slack." : `Loaded ${total} DEGRADATION reports from Slack.`, "success");
    } else {
      setStatus(total > 0 ? `Re-run completed for ${total} report(s).` : "Re-run completed.");
    }
    maybeConsumePendingAutoRerun();
    return;
  }
  if (event === "environment-switch-rerun") {
    if (state.batchRunning) {
      return;
    }
    if (state.pendingAutoRerunCards.length > 0) {
      maybeConsumePendingAutoRerun();
      return;
    }
    if (state.reports.length === 0) {
      return;
    }
    void rerunAllCards({
      reason: "manual-reload",
    });
    return;
  }
  if (event === "workspace-clear") {
    clearPendingAutoRerun();
    clearWorkspaceCards();
    setStatus("DEGRADATION workspace cleared.", "info");
  }
}

async function sendWorkspaceAction(action, payload = {}) {
  try {
    return await chrome.runtime.sendMessage({
      type: DEGRADATION_WORKSPACE_MESSAGE_TYPE,
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

function clearWorkspace() {
  clearPendingAutoRerun();
  clearWorkspaceCards();
  void sendWorkspaceAction("clear-all", {
    selectionKey: String(state.selectionKey || "").trim(),
  });
  setStatus("DEGRADATION workspace cleared.", "info");
}

async function rerunAllCards(options = {}) {
  if (state.batchRunning) {
    return false;
  }
  const cards = Array.isArray(options?.cards)
    ? options.cards.filter((card) => card && card.endpointKey)
    : getCurrentRerunCards();
  if (cards.length === 0) {
    setStatus("No reports are open.");
    return false;
  }

  state.batchRunning = true;
  syncActionButtonsDisabled();
  const reason = String(options?.reason || "manual-reload").trim().toLowerCase();
  if (reason === "workspace-deeplink") {
    setStatus(cards.length === 1 ? "Loading DEGRADATION report from Slack..." : `Loading ${cards.length} DEGRADATION reports from Slack...`);
  } else if (reason === "manual-reload") {
    setStatus(`Reloading ${cards.length} report(s)...`);
  } else {
    setStatus(`Re-running ${cards.length} report(s)...`);
  }
  const result = await sendWorkspaceAction("rerun-all", {
    cards,
    reason,
    selectionKey: String(options?.selectionKey || state.selectionKey || "").trim(),
  });
  if (!result?.ok) {
    state.batchRunning = false;
    syncActionButtonsDisabled();
    setStatus(result?.error || "Unable to re-run reports.", "error");
    return false;
  }
  return true;
}

async function deliverAllCardsToBlondie() {
  if (!(els.blondieAllButton instanceof HTMLButtonElement)) {
    return;
  }
  const currentState = getBlondieButtonState(els.blondieAllButton);
  if (currentState === "active" || currentState === "ack" || state.batchRunning) {
    return;
  }
  if (!canUseBlondieButton()) {
    renderBlondieButtonState(els.blondieAllButton, "inactive");
    setStatus(BLONDIE_BUTTON_INACTIVE_MESSAGE, "error");
    return;
  }
  const exportPayload = buildDegradationBlondieBatchExportPayload();
  if (!exportPayload) {
    setStatus("No visible DEGRADATION reports are available for :blondiebtn:.", "error");
    return;
  }

  state.batchRunning = true;
  renderBlondieButtonState(els.blondieAllButton, "active");
  syncActionButtonsDisabled();
  setStatus(
    `:blondiebtn: is delivering ${Math.max(0, Number(exportPayload.reportCount || 0))} DEGRADATION report${Number(exportPayload.reportCount || 0) === 1 ? "" : "s"} to Slack...`
  );

  try {
    const result = await sendWorkspaceAction("blondie-export-all", {
      exportPayload,
    });
    state.batchRunning = false;
    syncActionButtonsDisabled();
    if (!result?.ok) {
      renderBlondieButtonState(els.blondieAllButton, getBlondieButtonDefaultState());
      setStatus(result?.error || "Unable to deliver DEGRADATION reports with :blondiebtn:.", "error");
      return;
    }
    renderBlondieButtonState(els.blondieAllButton, "ack");
    queueBlondieButtonAckReset(els.blondieAllButton);
    const reportCount = Math.max(0, Number(exportPayload.reportCount || 0));
    setStatus(
      `:blondiebtn: delivered ${reportCount} DEGRADATION report${reportCount === 1 ? "" : "s"} to your ZipTool panel.`,
      "success"
    );
  } catch (error) {
    state.batchRunning = false;
    syncActionButtonsDisabled();
    renderBlondieButtonState(els.blondieAllButton, getBlondieButtonDefaultState());
    setStatus(error instanceof Error ? error.message : "Unable to deliver DEGRADATION reports with :blondiebtn:.", "error");
  }
}

function registerEventHandlers() {
  if (els.blondieAllButton) {
    els.blondieAllButton.addEventListener("click", () => {
      void deliverAllCardsToBlondie();
    });
  }
  if (els.rerunAllButton) {
    els.rerunAllButton.addEventListener("click", () => {
      void rerunAllCards();
    });
  }
  if (els.clearButton) {
    els.clearButton.addEventListener("click", () => {
      clearWorkspace();
    });
  }
  if (els.cardsHost) {
    els.cardsHost.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }
      const csvTrigger = event.target.closest('a[data-action="download-csv"]');
      if (csvTrigger instanceof HTMLAnchorElement) {
        event.preventDefault();
        downloadDegradationReportCsv(String(csvTrigger.getAttribute("data-report-id") || "").trim());
        setStatus("CSV download started.", "success");
        return;
      }
      const blondieTrigger = event.target.closest('button[data-action="blondie-export"]');
      if (blondieTrigger instanceof HTMLButtonElement) {
        event.preventDefault();
        const currentBlondieState = getBlondieButtonState(blondieTrigger);
        if (currentBlondieState === "active" || currentBlondieState === "ack") {
          return;
        }
        if (!canUseBlondieButton()) {
          renderBlondieButtonState(blondieTrigger, "inactive");
          setStatus(BLONDIE_BUTTON_INACTIVE_MESSAGE, "error");
          return;
        }
        const report = findReportById(String(blondieTrigger.getAttribute("data-report-id") || "").trim());
        const exportPayload = buildDegradationBlondieExportPayload(report);
        if (!exportPayload) {
          setStatus("No visible DEGRADATION report data is available for :blondiebtn:.", "error");
          return;
        }
        renderBlondieButtonState(blondieTrigger, "active");
        void sendWorkspaceAction("blondie-export", {
          exportPayload,
        })
          .then((result) => {
            if (!result?.ok) {
              renderBlondieButtonState(blondieTrigger, getBlondieButtonDefaultState());
              setStatus(result?.error || "Unable to deliver the DEGRADATION report with :blondiebtn:.", "error");
              return;
            }
            renderBlondieButtonState(blondieTrigger, "ack");
            queueBlondieButtonAckReset(blondieTrigger);
            setStatus(":blondiebtn: delivered 1 DEGRADATION report to your ZipTool panel.", "success");
          })
          .catch((error) => {
            renderBlondieButtonState(blondieTrigger, getBlondieButtonDefaultState());
            setStatus(error instanceof Error ? error.message : "Unable to deliver the DEGRADATION report with :blondiebtn:.", "error");
          });
        return;
      }
      const copyUrlTrigger = event.target.closest('button[data-action="copy-request-url"]');
      if (!(copyUrlTrigger instanceof HTMLButtonElement)) {
        return;
      }
      event.preventDefault();
      void copyReportRequestUrl(String(copyUrlTrigger.getAttribute("data-report-id") || "").trim());
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== DEGRADATION_WORKSPACE_MESSAGE_TYPE || message?.channel !== "workspace-event") {
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
  state.pendingWorkspaceDeeplink = parseWorkspaceDeeplinkPayloadFromLocation();
  registerEventHandlers();
  updateControllerBanner();
  renderReports();
  if (state.pendingWorkspaceDeeplink) {
    const label = firstNonEmptyString([
      state.pendingWorkspaceDeeplink.displayNodeLabel,
      state.pendingWorkspaceDeeplink.endpointKey,
      "DEGRADATION report",
    ]);
    setStatus(`Waiting to load ${label} from Slack...`);
  }
  const result = await sendWorkspaceAction("workspace-ready");
  if (!result?.ok) {
    setStatus(result?.error || "Unable to contact UnderPAR DEGRADATION controller.", "error");
    return;
  }
  void maybeConsumePendingWorkspaceDeeplink();
}

void init();
