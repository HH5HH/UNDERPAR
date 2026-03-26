const REGISTERED_APPLICATION_HEALTH_WORKSPACE_MESSAGE_TYPE = "underpar:registered-application-health-workspace";
const REGAPP_PREMIUM_SERVICE_SCOPE_BY_KEY = Object.freeze({
  restV2: "api:client:v2",
  esm: "analytics:client",
  degradation: "decisions:owner",
  resetTempPass: "temporary:passes:owner",
});
const REGAPP_PREMIUM_SERVICE_LABEL_BY_KEY = Object.freeze({
  restV2: "REST V2",
  esm: "ESM",
  degradation: "DEGRADATION",
  resetTempPass: "Reset TempPASS",
});
const REGAPP_PREMIUM_SERVICE_DISPLAY_ORDER = Object.freeze(["restV2", "esm", "degradation", "resetTempPass"]);

const state = {
  windowId: 0,
  controllerOnline: false,
  registeredApplicationHealthReady: false,
  programmerId: "",
  programmerName: "",
  requestorId: "",
  environmentKey: "",
  environmentLabel: "",
  selectionKey: "",
  loading: false,
  report: null,
  jwtDecodeCache: new Map(),
  expandedGuids: new Set(),
  hydratingGuids: new Set(),
  premiumServiceBindings: [],
  switchingServiceKeys: new Set(),
  pendingPremiumServiceSwitch: null,
};

const els = {
  controllerState: document.getElementById("workspace-controller-state"),
  filterState: document.getElementById("workspace-filter-state"),
  status: document.getElementById("workspace-status"),
  rerunIndicator: document.getElementById("workspace-rerun-indicator"),
  rerunAllButton: document.getElementById("workspace-rerun-all"),
  clearButton: document.getElementById("workspace-clear-all"),
  cardsHost: document.getElementById("workspace-cards"),
  pageEnvBadge: document.getElementById("page-env-badge"),
  pageEnvBadgeValue: document.getElementById("page-env-badge-value"),
  decodeForm: document.getElementById("workspace-jwt-decode-form"),
  decodeInput: document.getElementById("workspace-jwt-decode-input"),
  decodeClearButton: document.getElementById("workspace-jwt-decode-clear"),
  decodeSummary: document.getElementById("workspace-jwt-decode-summary"),
  dialog: document.getElementById("workspace-jwt-inspector-dialog"),
  dialogTitle: document.getElementById("workspace-jwt-inspector-title"),
  dialogSubtitle: document.getElementById("workspace-jwt-inspector-subtitle"),
  dialogBody: document.getElementById("workspace-jwt-inspector-body"),
  dialogCloseButton: document.getElementById("workspace-jwt-inspector-close"),
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

function uniqueStringArray(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [values])
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );
}

function normalizePremiumServiceSwitchRequest(value = null) {
  const serviceKey = String(value?.serviceKey || "").trim();
  const appGuid = String(value?.appGuid || value?.guid || "").trim();
  if (!serviceKey || !appGuid) {
    return null;
  }
  return {
    serviceKey,
    appGuid,
  };
}

function normalizeServicePillToneKey(value = "", options = {}) {
  const serviceKeyCompact = String(options?.serviceKey || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  if (serviceKeyCompact === "restv2") {
    return "service-rest-v2";
  }
  if (serviceKeyCompact === "esm") {
    return "service-esm";
  }
  if (serviceKeyCompact === "degradation") {
    return "service-degradation";
  }
  if (serviceKeyCompact === "resettemppass") {
    return "service-temp-pass";
  }
  if (serviceKeyCompact === "cm" || serviceKeyCompact === "cmmvpd") {
    return "service-cm";
  }
  const normalizedCompact = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  if (!normalizedCompact) {
    return "service-neutral";
  }
  if (normalizedCompact === "default") {
    return "service-default";
  }
  if (normalizedCompact === "restapiv2" || normalizedCompact === "restv2") {
    return "service-rest-v2";
  }
  if (normalizedCompact === "esm") {
    return "service-esm";
  }
  if (normalizedCompact === "degradation") {
    return "service-degradation";
  }
  if (normalizedCompact === "resettemppass" || normalizedCompact === "resettemppassdcr" || normalizedCompact === "resettemppassowner") {
    return "service-temp-pass";
  }
  if (normalizedCompact === "mvpdstatusservice" || normalizedCompact === "cmu") {
    return "service-cm";
  }
  return "service-neutral";
}

function buildServicePillMarkup(label = "", options = {}) {
  const normalizedLabel = String(label || "").trim();
  if (!normalizedLabel) {
    return "";
  }
  const toneKey = normalizeServicePillToneKey(normalizedLabel, options);
  return `<span class="regapp-service-pill regapp-service-pill--${escapeHtml(toneKey)}">${escapeHtml(normalizedLabel)}</span>`;
}

function renderServicePillList(labels = [], options = {}) {
  const pills = uniqueStringArray(labels)
    .map((label) => buildServicePillMarkup(label, options))
    .filter(Boolean);
  if (pills.length === 0) {
    return "";
  }
  return `<div class="regapp-service-pill-list">${pills.join("")}</div>`;
}

function normalizePremiumServiceBindings(bindings = []) {
  return (Array.isArray(bindings) ? bindings : [])
    .map((binding) => {
      const serviceKey = String(binding?.serviceKey || "").trim();
      const label = firstNonEmptyString([binding?.label, REGAPP_PREMIUM_SERVICE_LABEL_BY_KEY[serviceKey], serviceKey]);
      const appGuid = String(binding?.appGuid || binding?.guid || "").trim();
      const appName = firstNonEmptyString([binding?.appName, binding?.applicationName, appGuid]);
      if (!serviceKey || !label || !appGuid || !appName) {
        return null;
      }
      return {
        serviceKey,
        label,
        appGuid,
        appName,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftIndex = REGAPP_PREMIUM_SERVICE_DISPLAY_ORDER.indexOf(String(left?.serviceKey || "").trim());
      const rightIndex = REGAPP_PREMIUM_SERVICE_DISPLAY_ORDER.indexOf(String(right?.serviceKey || "").trim());
      if (leftIndex !== rightIndex) {
        return (leftIndex >= 0 ? leftIndex : Number.MAX_SAFE_INTEGER) - (rightIndex >= 0 ? rightIndex : Number.MAX_SAFE_INTEGER);
      }
      return String(left?.label || "").localeCompare(String(right?.label || ""), undefined, { sensitivity: "base" });
    });
}

function buildPremiumServiceBindingSignature(bindings = []) {
  return normalizePremiumServiceBindings(bindings)
    .map((binding) => `${binding.serviceKey}:${binding.appGuid}`)
    .join("|");
}

function tryParseJson(text, fallback = null) {
  if (typeof text !== "string" || !text.trim()) {
    return fallback;
  }
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatCount(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return "0";
  }
  try {
    return new Intl.NumberFormat("en-US").format(numeric);
  } catch {
    return String(Math.round(numeric));
  }
}

function getProgrammerLabel() {
  const name = String(state.programmerName || "").trim();
  const id = String(state.programmerId || "").trim();
  if (name && id && name !== id) {
    return `${name} (${id})`;
  }
  return name || id || "Selected ENV x Media Company";
}

function getFilterLabel() {
  const requestorId = String(state.requestorId || "").trim();
  const environmentLabel = String(state.environmentLabel || state.environmentKey || "").trim();
  if (!state.programmerId) {
    return "Select an ENV x Media Company in HEALTH > Status and click REG APPS.";
  }
  return [
    `ENV x Media Company: ${getProgrammerLabel()}`,
    requestorId ? `RequestorId: ${requestorId}` : "RequestorId: all",
    `Env: ${environmentLabel || "N/A"}`,
  ].join(" | ");
}

function setStatus(message = "", type = "info") {
  const text = String(message || "").trim();
  if (!els.status) {
    return;
  }
  els.status.textContent = text;
  els.status.classList.toggle("error", type === "error" && Boolean(text));
  els.status.hidden = !text;
}

function setDecodeSummary(message = "", type = "info") {
  if (!els.decodeSummary) {
    return;
  }
  const text = String(message || "").trim();
  els.decodeSummary.textContent = text || "Paste any JWT-looking value and UnderPAR will decode it locally.";
  els.decodeSummary.classList.toggle("is-error", type === "error" && Boolean(text));
}

function getJwtInspectorUtility() {
  return globalThis.UnderParJwtInspector && typeof globalThis.UnderParJwtInspector === "object"
    ? globalThis.UnderParJwtInspector
    : null;
}

function hasRenderableReport() {
  return Boolean(state.report);
}

function canRunCurrentContextReport() {
  return Boolean(state.programmerId && state.registeredApplicationHealthReady);
}

function syncActionButtonsDisabled() {
  const serviceSwitchBusy = state.switchingServiceKeys.size > 0;
  const disableRerun = state.loading || serviceSwitchBusy || !canRunCurrentContextReport();
  const disableClear = state.loading || serviceSwitchBusy || !hasRenderableReport();
  const networkBusy = state.loading || state.hydratingGuids.size > 0 || serviceSwitchBusy;
  document.body.classList.toggle("net-busy", networkBusy);
  document.body.setAttribute("aria-busy", networkBusy ? "true" : "false");
  if (els.rerunAllButton) {
    els.rerunAllButton.disabled = disableRerun;
    els.rerunAllButton.classList.toggle("net-busy", networkBusy);
  }
  if (els.rerunIndicator) {
    els.rerunIndicator.hidden = !networkBusy;
  }
  if (els.clearButton) {
    els.clearButton.disabled = disableClear;
  }
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

function getCurrentPremiumServiceBindings() {
  return normalizePremiumServiceBindings(state.premiumServiceBindings);
}

function getCurrentBindingForService(serviceKey = "") {
  const normalizedServiceKey = String(serviceKey || "").trim();
  if (!normalizedServiceKey) {
    return null;
  }
  return getCurrentPremiumServiceBindings().find((binding) => binding.serviceKey === normalizedServiceKey) || null;
}

function appHasServiceScope(app = null, serviceKey = "") {
  const requiredScope = String(REGAPP_PREMIUM_SERVICE_SCOPE_BY_KEY[serviceKey] || "").trim().toLowerCase();
  if (!app || !requiredScope) {
    return false;
  }
  return (Array.isArray(app?.scopes) ? app.scopes : [])
    .map((scope) => String(scope || "").trim().toLowerCase())
    .filter(Boolean)
    .includes(requiredScope);
}

function getPremiumServiceSwitchOptions(serviceKey = "") {
  const normalizedServiceKey = String(serviceKey || "").trim();
  if (!normalizedServiceKey) {
    return [];
  }
  const currentBinding = getCurrentBindingForService(normalizedServiceKey);
  const allApps = getReportApplications();
  const matchingApps = allApps.filter((app) => appHasServiceScope(app, normalizedServiceKey));
  const requestorScopedApps = state.requestorId ? matchingApps.filter((app) => appMatchesSelectedRequestor(app)) : matchingApps;
  const preferredPool = requestorScopedApps.length > 0 ? requestorScopedApps : matchingApps;
  const options = [];
  const seen = new Set();
  const pushOption = (app) => {
    const guid = String(app?.guid || "").trim();
    if (!guid || seen.has(guid)) {
      return;
    }
    seen.add(guid);
    options.push(app);
  };
  if (currentBinding?.appGuid) {
    pushOption(
      allApps.find((app) => String(app?.guid || "").trim() === currentBinding.appGuid) || {
        guid: currentBinding.appGuid,
        name: currentBinding.appName,
        scopes: [REGAPP_PREMIUM_SERVICE_SCOPE_BY_KEY[normalizedServiceKey]],
      }
    );
  }
  preferredPool.forEach((app) => pushOption(app));
  return options.sort((left, right) => {
    const leftGuid = String(left?.guid || "").trim();
    const rightGuid = String(right?.guid || "").trim();
    const leftCurrent = Number(leftGuid === String(currentBinding?.appGuid || "").trim());
    const rightCurrent = Number(rightGuid === String(currentBinding?.appGuid || "").trim());
    if (leftCurrent !== rightCurrent) {
      return rightCurrent - leftCurrent;
    }
    const leftMatch = Number(appMatchesSelectedRequestor(left));
    const rightMatch = Number(appMatchesSelectedRequestor(right));
    if (leftMatch !== rightMatch) {
      return rightMatch - leftMatch;
    }
    return firstNonEmptyString([left?.name, leftGuid]).localeCompare(firstNonEmptyString([right?.name, rightGuid]), undefined, {
      sensitivity: "base",
    });
  });
}

function getPendingPremiumServiceSwitch() {
  const pending = normalizePremiumServiceSwitchRequest(state.pendingPremiumServiceSwitch);
  if (!pending) {
    return null;
  }
  const currentBinding = getCurrentBindingForService(pending.serviceKey);
  if (!currentBinding || String(currentBinding.appGuid || "").trim() === pending.appGuid) {
    return null;
  }
  const optionGuids = getPremiumServiceSwitchOptions(pending.serviceKey)
    .map((app) => String(app?.guid || "").trim())
    .filter(Boolean);
  if (optionGuids.length > 0 && !optionGuids.includes(pending.appGuid)) {
    return null;
  }
  return pending;
}

function updateControllerBanner() {
  if (els.controllerState) {
    els.controllerState.textContent = `Registered Application Health Inspector | ${getProgrammerLabel()}`;
  }
  if (els.filterState) {
    els.filterState.textContent = getFilterLabel();
  }
  renderWorkspaceEnvironmentBadge();
  syncActionButtonsDisabled();
}

function getReportSelectionKey(report = null) {
  return firstNonEmptyString([report?.selectionKey, report?.queryContext?.selectionKey]);
}

function applyControllerState(payload = {}) {
  const nextSelectionKey = String(payload?.selectionKey || "").trim();
  const nextProgrammerId = String(payload?.programmerId || "").trim();
  const nextRequestorId = String(payload?.requestorId || "").trim();
  const nextEnvironmentKey = String(payload?.environmentKey || "").trim();
  const nextPremiumServiceBindings = normalizePremiumServiceBindings(payload?.premiumServiceBindings || []);
  const previousSelectionKey = String(state.selectionKey || "").trim();
  const previousProgrammerId = String(state.programmerId || "").trim();
  const previousRequestorId = String(state.requestorId || "").trim();
  const previousEnvironmentKey = String(state.environmentKey || "").trim();
  const previousPremiumServiceSignature = buildPremiumServiceBindingSignature(state.premiumServiceBindings);
  const nextPremiumServiceSignature = buildPremiumServiceBindingSignature(nextPremiumServiceBindings);
  const previousReady = state.registeredApplicationHealthReady === true;
  const controllerChanged =
    nextSelectionKey !== previousSelectionKey ||
    nextProgrammerId !== previousProgrammerId ||
    nextEnvironmentKey !== previousEnvironmentKey;
  const requestorChanged = nextRequestorId !== previousRequestorId;
  const premiumServiceChanged = nextPremiumServiceSignature !== previousPremiumServiceSignature;
  const readinessActivated = !previousReady && payload?.registeredApplicationHealthReady === true;
  const hadLiveControllerContext = Boolean(previousSelectionKey || previousProgrammerId || previousEnvironmentKey);
  const currentReportSelectionKey = getReportSelectionKey(state.report);
  const shouldClearStaleReport = controllerChanged && currentReportSelectionKey !== nextSelectionKey;
  const shouldAutoRefreshForControllerUpdate =
    (controllerChanged || readinessActivated) &&
    hadLiveControllerContext &&
    nextProgrammerId &&
    payload?.registeredApplicationHealthReady === true &&
    !state.loading;

  state.controllerOnline = payload?.controllerOnline === true;
  state.registeredApplicationHealthReady = payload?.registeredApplicationHealthReady === true;
  state.programmerId = nextProgrammerId;
  state.programmerName = String(payload?.programmerName || "");
  state.requestorId = nextRequestorId;
  state.environmentKey = nextEnvironmentKey;
  state.environmentLabel = String(payload?.environmentLabel || "");
  state.selectionKey = nextSelectionKey;
  state.premiumServiceBindings = nextPremiumServiceBindings;
  if (controllerChanged) {
    closeJwtInspector();
    state.loading = false;
    getExpandedGuidStore().clear();
    state.hydratingGuids.clear();
    state.switchingServiceKeys.clear();
    state.pendingPremiumServiceSwitch = null;
  } else {
    state.pendingPremiumServiceSwitch = getPendingPremiumServiceSwitch();
  }
  if (shouldClearStaleReport) {
    state.report = null;
    state.jwtDecodeCache.clear();
  }
  updateControllerBanner();
  if (controllerChanged || requestorChanged || shouldClearStaleReport || premiumServiceChanged) {
    renderReport();
  }
  if (shouldAutoRefreshForControllerUpdate) {
    void runCurrentContextReport({
      statusMessage: "Refreshing Registered Application Health Inspector for the selected UnderPAR context...",
      preferRefresh: false,
    });
  }
}

function normalizeJwtTimestamp(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "";
  }
  const milliseconds = numeric > 1000000000000 ? numeric : numeric * 1000;
  try {
    return new Date(milliseconds).toLocaleString();
  } catch {
    return "";
  }
}

function decodeBase64UrlText(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }
  let padded = normalized.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = padded.length % 4;
  if (remainder) {
    padded += "=".repeat(4 - remainder);
  }
  try {
    return decodeURIComponent(escape(atob(padded)));
  } catch {
    try {
      return atob(padded);
    } catch {
      return "";
    }
  }
}

function isProbablyJwt(value) {
  const normalized = String(value || "").trim();
  return normalized.length >= 30 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(normalized);
}

function extractJwtCandidateFromValue(value, seen = new Set()) {
  if (typeof value === "string") {
    const normalized = value.trim();
    if (isProbablyJwt(normalized)) {
      return normalized;
    }
    const bearerMatch = normalized.match(/bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/i);
    if (bearerMatch?.[1] && isProbablyJwt(bearerMatch[1])) {
      return bearerMatch[1];
    }
    const rawMatch = normalized.match(/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/);
    return rawMatch?.[1] && isProbablyJwt(rawMatch[1]) ? rawMatch[1] : "";
  }
  if (!value || typeof value !== "object") {
    return "";
  }
  if (seen.has(value)) {
    return "";
  }
  seen.add(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      const candidate = extractJwtCandidateFromValue(entry, seen);
      if (candidate) {
        return candidate;
      }
    }
    return "";
  }
  for (const entry of Object.values(value)) {
    const candidate = extractJwtCandidateFromValue(entry, seen);
    if (candidate) {
      return candidate;
    }
  }
  return "";
}

function extractJwtCandidateFromText(rawText = "") {
  const sharedInspector = getJwtInspectorUtility();
  if (sharedInspector?.extractJwtCandidateFromText) {
    return String(sharedInspector.extractJwtCandidateFromText(rawText) || "").trim();
  }
  const normalized = String(rawText || "").trim();
  if (!normalized) {
    return "";
  }
  const direct = extractJwtCandidateFromValue(normalized);
  if (direct) {
    return direct;
  }
  const parsed = tryParseJson(normalized, null);
  return extractJwtCandidateFromValue(parsed);
}

function decodeJwtSection(token = "", index = 0) {
  const parts = String(token || "").trim().split(".");
  const rawValue = String(parts[index] || "").trim();
  const text = decodeBase64UrlText(rawValue);
  const parsed = tryParseJson(text, null);
  return {
    rawValue,
    text,
    parsed: isPlainObject(parsed) ? parsed : null,
  };
}

function collectJwtScopeValues(payload = null) {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const scopeCandidates = [];
  const append = (value) => {
    if (value == null) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => append(entry));
      return;
    }
    if (typeof value === "object") {
      append(value.scope);
      append(value.scopes);
      append(value.permissions);
      append(value.value);
      return;
    }
    String(value || "")
      .split(/[\s,]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .forEach((entry) => scopeCandidates.push(entry));
  };
  append(payload.scope);
  append(payload.scopes);
  append(payload.permissions);
  append(payload.client?.scope);
  append(payload.client?.scopes);
  append(payload.clientApplication?.scope);
  append(payload.clientApplication?.scopes);
  return uniqueStringArray(scopeCandidates);
}

function buildJwtInspectionSummary(result = null) {
  const header = isPlainObject(result?.header) ? result.header : {};
  const payload = isPlainObject(result?.payload) ? result.payload : {};
  const audience = uniqueStringArray(Array.isArray(payload.aud) ? payload.aud : [payload.aud]).join(", ");
  return {
    algorithm: firstNonEmptyString([header.alg]),
    type: firstNonEmptyString([header.typ]),
    keyId: firstNonEmptyString([header.kid]),
    issuer: firstNonEmptyString([payload.iss, payload.issuer]),
    subject: firstNonEmptyString([payload.sub, payload.subject]),
    audience,
    clientId: firstNonEmptyString([payload.client_id, payload.clientId, payload.azp]),
    issuedAt: normalizeJwtTimestamp(payload.iat),
    notBefore: normalizeJwtTimestamp(payload.nbf),
    expiresAt: normalizeJwtTimestamp(payload.exp),
    scopes: collectJwtScopeValues(payload),
  };
}

function decodeJwtToken(token = "") {
  const sharedInspector = getJwtInspectorUtility();
  if (sharedInspector?.decodeJwtToken) {
    return sharedInspector.decodeJwtToken(token);
  }
  const normalized = String(token || "").trim();
  const parts = normalized.split(".");
  const headerSection = decodeJwtSection(normalized, 0);
  const payloadSection = decodeJwtSection(normalized, 1);
  const valid = parts.length === 3 && Boolean(headerSection.parsed) && Boolean(payloadSection.parsed);
  const result = {
    token: normalized,
    valid,
    header: headerSection.parsed,
    payload: payloadSection.parsed,
    headerSegment: headerSection.rawValue,
    payloadSegment: payloadSection.rawValue,
    signatureSegment: String(parts[2] || "").trim(),
    headerText: headerSection.text,
    payloadText: payloadSection.text,
    error: valid ? "" : "UnderPAR could not parse this JWT into a valid header and payload object.",
  };
  result.summary = buildJwtInspectionSummary(result);
  return result;
}

function getDecodedJwt(token = "") {
  const normalized = String(token || "").trim();
  if (!normalized) {
    return null;
  }
  if (!state.jwtDecodeCache.has(normalized)) {
    state.jwtDecodeCache.set(normalized, decodeJwtToken(normalized));
  }
  return state.jwtDecodeCache.get(normalized) || null;
}

function chunkMonospaceText(value = "", chunkSize = 64) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }
  const chunks = [];
  for (let index = 0; index < normalized.length; index += chunkSize) {
    chunks.push(normalized.slice(index, index + chunkSize));
  }
  return chunks.join("\n");
}

function getReportApplications() {
  return Array.isArray(state.report?.applications) ? state.report.applications : [];
}

function getApplicationByGuid(guid = "") {
  const normalizedGuid = String(guid || "").trim();
  if (!normalizedGuid) {
    return null;
  }
  return getReportApplications().find((entry) => String(entry?.guid || "").trim() === normalizedGuid) || null;
}

function getExpandedGuidStore() {
  if (!(state.expandedGuids instanceof Set)) {
    state.expandedGuids = new Set();
  }
  return state.expandedGuids;
}

function setApplicationExpandedState(guid = "", expanded = false) {
  const normalizedGuid = String(guid || "").trim();
  if (!normalizedGuid) {
    return;
  }
  const expandedGuids = getExpandedGuidStore();
  if (expanded) {
    expandedGuids.add(normalizedGuid);
    return;
  }
  expandedGuids.delete(normalizedGuid);
}

function pruneExpandedApplications() {
  const expandedGuids = getExpandedGuidStore();
  if (expandedGuids.size === 0) {
    return;
  }
  const availableGuids = new Set(
    getReportApplications()
      .map((app) => String(app?.guid || "").trim())
      .filter(Boolean)
  );
  for (const guid of Array.from(expandedGuids)) {
    if (!availableGuids.has(guid)) {
      expandedGuids.delete(guid);
    }
  }
}

function appNeedsHydration(app = null) {
  if (!app || typeof app !== "object") {
    return false;
  }
  return !String(app.softwareStatement || "").trim();
}

function setApplicationHydrationState(guid = "", active = false) {
  const normalizedGuid = String(guid || "").trim();
  if (!normalizedGuid) {
    return;
  }
  if (active) {
    state.hydratingGuids.add(normalizedGuid);
  } else {
    state.hydratingGuids.delete(normalizedGuid);
  }
  syncActionButtonsDisabled();
  renderReport();
}

function appMatchesSelectedRequestor(app = null) {
  const selectedRequestorId = String(state.requestorId || "").trim().toLowerCase();
  if (!selectedRequestorId) {
    return false;
  }
  const hints = uniqueStringArray([app?.requestorHint, ...(Array.isArray(app?.serviceProviderHints) ? app.serviceProviderHints : [])]);
  return hints.some((value) => {
    const normalizedValue = String(value || "").trim();
    if (!normalizedValue) {
      return false;
    }
    const tokenMatch = normalizedValue.match(/^@[^:]+:(.+)$/i);
    const comparableValue = String(tokenMatch ? tokenMatch[1] : normalizedValue).trim().toLowerCase();
    return comparableValue === selectedRequestorId;
  });
}

function decorateApplication(app = null, index = 0) {
  const token = String(app?.softwareStatement || "").trim();
  const inspection = token ? getDecodedJwt(token) : null;
  const hydrating = state.hydratingGuids.has(String(app?.guid || "").trim());
  const inUseServiceLabels = getCurrentPremiumServiceBindings()
    .filter((binding) => String(binding?.appGuid || "").trim() === String(app?.guid || "").trim())
    .map((binding) => String(binding?.label || "").trim())
    .filter(Boolean);
  return {
    index,
    app,
    inspection,
    selectedRequestorMatch: appMatchesSelectedRequestor(app),
    hydrating,
    inUseServiceLabels,
  };
}

function getDecoratedApplications() {
  return getReportApplications().map((app, index) => decorateApplication(app, index));
}

function filterApplicationsForSelectedRequestor(applications = []) {
  const selectedRequestorId = String(state.requestorId || "").trim().toLowerCase();
  const entries = Array.isArray(applications) ? applications.slice() : [];
  if (!selectedRequestorId) {
    return entries;
  }
  return entries.filter((entry) => {
    if (entry?.selectedRequestorMatch === true) {
      return true;
    }
    const app = entry?.app && typeof entry.app === "object" ? entry.app : {};
    const hints = uniqueStringArray([
      app.requestorHint,
      ...(Array.isArray(app.serviceProviderHints) ? app.serviceProviderHints : []),
    ]);
    return hints.some((value) => {
      const normalizedValue = String(value || "").trim();
      if (!normalizedValue) {
        return false;
      }
      const tokenMatch = normalizedValue.match(/^@[^:]+:(.+)$/i);
      const comparableValue = String(tokenMatch ? tokenMatch[1] : normalizedValue).trim().toLowerCase();
      return comparableValue === selectedRequestorId;
    });
  });
}

function buildRequestorSummary(app = {}) {
  return firstNonEmptyString([
    app.requestorHint,
    Array.isArray(app.serviceProviderHints) ? app.serviceProviderHints.join(", ") : "",
    "No requestor hints",
  ]);
}

function buildApplicationSummaryMeta(app = {}) {
  const summary = String(buildRequestorSummary(app) || "").trim().toLowerCase();
  const candidate = String(firstNonEmptyString([app.serviceProviderSummary]) || "").trim();
  if (!candidate) {
    return "";
  }
  return String(candidate || "").trim().toLowerCase() === summary ? "" : candidate;
}

function renderApplicationSummaryFacts(app = {}) {
  const summaryFacts = [
    ["Requestor Hints", buildRequestorSummary(app)],
  ];
  return `
    <div class="regapp-app-summary-facts">
      ${summaryFacts
        .map(
          ([label, value]) => `
            <span class="regapp-app-summary-fact">
              <span class="regapp-app-summary-fact-label">${escapeHtml(label)}</span>
              <span class="regapp-app-summary-fact-value">${escapeHtml(value)}</span>
            </span>
          `
        )
        .join("")}
    </div>
    ${
      Array.isArray(app.scopeLabels) && app.scopeLabels.length > 0
        ? `<div class="regapp-app-summary-scopes">${renderServicePillList(app.scopeLabels)}</div>`
        : ""
    }
  `;
}

function renderTokenPane(inspection = null) {
  if (!inspection?.token) {
    return '<p class="regapp-empty-state">No software statement JWT was returned for this application.</p>';
  }
  return `
    <div class="regapp-token-segments">
      <article class="regapp-token-segment">
        <p class="regapp-token-segment-label">Header Segment</p>
        <code>${escapeHtml(chunkMonospaceText(inspection.headerSegment))}</code>
      </article>
      <article class="regapp-token-segment">
        <p class="regapp-token-segment-label">Payload Segment</p>
        <code>${escapeHtml(chunkMonospaceText(inspection.payloadSegment))}</code>
      </article>
      <article class="regapp-token-segment">
        <p class="regapp-token-segment-label">Signature Segment</p>
        <code>${escapeHtml(chunkMonospaceText(inspection.signatureSegment))}</code>
      </article>
    </div>
  `;
}

function renderScalarValue(value) {
  if (value == null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NaN";
  }
  return String(value);
}

function renderObjectInspector(value, title = "") {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '<p class="regapp-empty-state">No decoded fields.</p>';
    }
    if (value.every((entry) => entry == null || typeof entry !== "object")) {
      return `<div class="regapp-jwt-array">${value
        .map((entry) => `<span class="regapp-jwt-array-item">${escapeHtml(renderScalarValue(entry))}</span>`)
        .join("")}</div>`;
    }
    return `
      <div class="regapp-jwt-object-stack">
        ${value
          .map(
            (entry, index) => `
              <section class="regapp-jwt-object-section">
                <p class="regapp-jwt-object-title">${escapeHtml(`${title || "Item"} ${index + 1}`)}</p>
                ${renderObjectInspector(entry)}
              </section>
            `
          )
          .join("")}
      </div>
    `;
  }

  if (!isPlainObject(value)) {
    return `<p class="regapp-empty-state">${escapeHtml(renderScalarValue(value))}</p>`;
  }

  const entries = Object.entries(value);
  const scalarEntries = entries.filter(([, entryValue]) => !entryValue || typeof entryValue !== "object");
  const nestedEntries = entries.filter(([, entryValue]) => entryValue && typeof entryValue === "object");
  if (scalarEntries.length === 0 && nestedEntries.length === 0) {
    return '<p class="regapp-empty-state">No decoded fields.</p>';
  }

  return `
    ${scalarEntries.length > 0
      ? `<dl class="regapp-jwt-object-list">
          ${scalarEntries
            .map(
              ([key, entryValue]) => `
                <dt>${escapeHtml(key)}</dt>
                <dd>${escapeHtml(renderScalarValue(entryValue))}</dd>
              `
            )
            .join("")}
        </dl>`
      : ""}
    ${nestedEntries.length > 0
      ? `<div class="regapp-jwt-object-stack">
          ${nestedEntries
            .map(
              ([key, entryValue]) => `
                <section class="regapp-jwt-object-section">
                  <p class="regapp-jwt-object-title">${escapeHtml(key)}</p>
                  ${renderObjectInspector(entryValue, key)}
                </section>
              `
            )
            .join("")}
        </div>`
      : ""}
  `;
}

function renderJwtSummaryCards(inspection = null) {
  if (!inspection?.token) {
    return '<p class="regapp-empty-state">No JWT was returned for this application.</p>';
  }
  const summary = inspection.summary || {};
  const cards = [
    ["Algorithm", firstNonEmptyString([summary.algorithm, "Not returned"])],
    ["Type", firstNonEmptyString([summary.type, "Not returned"])],
    ["Key ID", firstNonEmptyString([summary.keyId, "Not returned"])],
    ["Issuer", firstNonEmptyString([summary.issuer, "Not returned"])],
    ["Client ID", firstNonEmptyString([summary.clientId, "Not returned"])],
    ["Subject", firstNonEmptyString([summary.subject, "Not returned"])],
    ["Audience", firstNonEmptyString([summary.audience, "Not returned"])],
    ["Issued", firstNonEmptyString([summary.issuedAt, "Not returned"])],
    ["Not Before", firstNonEmptyString([summary.notBefore, "Not returned"])],
    ["Expires", firstNonEmptyString([summary.expiresAt, "Not returned"])],
    ["Scopes", summary.scopes && summary.scopes.length > 0 ? summary.scopes.join(", ") : "Not returned"],
    ["Decode State", inspection.valid === true ? "Decoded locally" : "Needs review"],
  ];
  return `
    <div class="regapp-jwt-summary-grid">
      ${cards
        .map(
          ([label, value]) => `
            <article class="regapp-jwt-summary-card">
              <p class="regapp-jwt-summary-label">${escapeHtml(label)}</p>
              <p class="regapp-jwt-summary-value">${escapeHtml(value)}</p>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function buildJwtInspectorMarkup(inspection = null, options = {}) {
  const sharedInspector = getJwtInspectorUtility();
  if (sharedInspector?.buildInspectorMarkup) {
    return sharedInspector.buildInspectorMarkup(inspection, options);
  }
  if (options?.loading === true) {
    return '<p class="regapp-empty-state">Hydrating software statement and decoding JWT claims for this registered application...</p>';
  }
  if (!inspection?.token) {
    return '<p class="regapp-empty-state">No JWT is available to inspect.</p>';
  }
  return `
    <div class="regapp-jwt-inspector-layout">
      <section class="regapp-panel">
        <header class="regapp-panel-head">
          <p class="regapp-panel-title">Software Statement</p>
          <p class="regapp-panel-subtitle">Raw JWT segments shown without sending the token to any third-party service.</p>
        </header>
        <div class="regapp-panel-body">
          ${renderTokenPane(inspection)}
        </div>
      </section>
      <section class="regapp-panel">
        <header class="regapp-panel-head">
          <p class="regapp-panel-title">Decoded JWT</p>
          <p class="regapp-panel-subtitle">${
            inspection.valid === true
              ? "Header and payload were decoded locally."
              : "UnderPAR could not fully decode this token. Review the raw segments."
          }</p>
        </header>
        <div class="regapp-panel-body">
          ${renderJwtSummaryCards(inspection)}
          <div class="regapp-app-panels">
            <section class="regapp-jwt-object-section">
              <p class="regapp-jwt-object-title">Header</p>
              ${renderObjectInspector(inspection.header)}
            </section>
            <section class="regapp-jwt-object-section">
              <p class="regapp-jwt-object-title">Payload</p>
              ${renderObjectInspector(inspection.payload)}
            </section>
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderApplicationCards(applications = []) {
  if (applications.length === 0) {
    return `<article class="rest-report-card"><p class="regapp-empty-state">${escapeHtml(
      state.requestorId
        ? `No registered applications are associated with RequestorId ${state.requestorId}.`
        : "No registered applications were returned for this ENV x Media Company."
    )}</p></article>`;
  }
  return `
    <section class="regapp-card-grid">
      ${applications
        .map((entry) => {
          const app = entry.app || {};
          const summaryBadges = [
            String(app.hydrationError || "").trim() ? '<span class="regapp-chip regapp-chip--danger">Hydration Warning</span>' : "",
          ]
            .filter(Boolean)
            .join("");
          const upIndicator = Array.isArray(entry.inUseServiceLabels) && entry.inUseServiceLabels.length > 0
            ? `<span class="regapp-up-indicator" title="${escapeHtml(
                `In use by UP for ${entry.inUseServiceLabels.join(", ")}`
              )}" aria-label="${escapeHtml(`In use by UP for ${entry.inUseServiceLabels.join(", ")}`)}">UP</span>`
            : "";
          const guid = String(app.guid || "").trim();
          const expanded = getExpandedGuidStore().has(guid);
          const hasSoftwareStatement = Boolean(String(app.softwareStatement || "").trim());
          return `
            <details
              class="rest-report-card regapp-app-card${entry.selectedRequestorMatch ? " is-selected-match" : ""}"
              data-regapp-guid="${escapeHtml(guid)}"${expanded ? " open" : ""}
            >
              <summary class="regapp-app-summary">
                <div class="regapp-app-summary-main">
                  <div class="regapp-app-summary-copy">
                    <div class="regapp-app-summary-title-row">
                      <p class="regapp-app-summary-title">${escapeHtml(firstNonEmptyString([app.name, app.guid, "Registered Application"]))}</p>
                      ${upIndicator}
                    </div>
                    ${
                      buildApplicationSummaryMeta(app)
                        ? `<p class="regapp-app-summary-meta">${escapeHtml(buildApplicationSummaryMeta(app))}</p>`
                        : ""
                    }
                    ${renderApplicationSummaryFacts(app)}
                  </div>
                  <div class="regapp-app-summary-actions">
                    ${summaryBadges ? `<div class="regapp-chip-stack">${summaryBadges}</div>` : ""}
                    <button
                      type="button"
                      class="regapp-app-summary-btn"
                      data-software-statement-download-guid="${escapeHtml(guid)}"
                    >DOWNLOAD</button>
                  </div>
                </div>
              </summary>
              <div class="regapp-app-body">
                ${String(app.hydrationError || "").trim()
                  ? `<p class="regapp-app-body-alert">${escapeHtml(String(app.hydrationError || "").trim())}</p>`
                  : ""}
                ${entry.hydrating && !hasSoftwareStatement
                  ? buildJwtInspectorMarkup(null, { loading: true })
                  : buildJwtInspectorMarkup(entry.inspection || { token: "" })}
              </div>
            </details>
          `;
        })
        .join("")}
    </section>
  `;
}

function renderReport() {
  if (!els.cardsHost) {
    return;
  }
  if (!state.report) {
    let emptyMessage = "No Registered Application Health Inspector report loaded yet.";
    if (state.loading && state.programmerId) {
      emptyMessage = "Loading registered applications for the selected ENV x Media Company...";
    } else if (!state.programmerId) {
      emptyMessage = "Select an ENV x Media Company in HEALTH > Status and click REG APPS.";
    } else if (!state.registeredApplicationHealthReady) {
      emptyMessage = "UnderPAR is still hydrating the Adobe Pass registered application context for the selected ENV x Media Company.";
    }
    els.cardsHost.innerHTML = `<article class="rest-report-card"><p class="regapp-empty-state">${escapeHtml(
      emptyMessage
    )}</p></article>`;
    return;
  }

  const applications = filterApplicationsForSelectedRequestor(getDecoratedApplications());
  els.cardsHost.innerHTML = renderApplicationCards(applications);
}

function openJwtInspector(token = "", options = {}) {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) {
    setStatus("No JWT is available to inspect.", "error");
    return;
  }
  const inspection = getDecodedJwt(normalizedToken);
  if (!inspection || !els.dialog || !els.dialogBody || !els.dialogTitle || !els.dialogSubtitle) {
    return;
  }
  els.dialogTitle.textContent = firstNonEmptyString([options.title, "JWT Inspector"]);
  els.dialogSubtitle.textContent = firstNonEmptyString([
    options.subtitle,
    inspection.valid === true ? "Decoded locally inside UnderPAR." : inspection.error,
  ]);
  els.dialogBody.innerHTML = buildJwtInspectorMarkup(inspection);
  if (typeof els.dialog.showModal === "function") {
    if (!els.dialog.open) {
      els.dialog.showModal();
    }
  }
}

function closeJwtInspector() {
  if (els.dialog?.open) {
    els.dialog.close();
  }
}

function inspectAdHocJwtInput() {
  const rawInput = String(els.decodeInput?.value || "").trim();
  if (!rawInput) {
    setDecodeSummary("Paste a JWT or token-bearing payload first.", "error");
    return;
  }
  const token = extractJwtCandidateFromText(rawInput);
  if (!token) {
    setDecodeSummary("UnderPAR could not locate a JWT in that input.", "error");
    return;
  }
  setDecodeSummary("Decoded JWT locally. Review the inspector dialog for details.");
  openJwtInspector(token, {
    title: "JWT Inspector",
    subtitle: "Decoded from ad hoc workspace input.",
  });
}

async function ensureApplicationHydrated(guid = "", options = {}) {
  const normalizedGuid = String(guid || "").trim();
  if (!normalizedGuid) {
    return null;
  }
  const existingApp = getApplicationByGuid(normalizedGuid);
  if (!appNeedsHydration(existingApp)) {
    return existingApp;
  }
  const alreadyHydrating = state.hydratingGuids.has(normalizedGuid);
  if (!alreadyHydrating) {
    setApplicationHydrationState(normalizedGuid, true);
  }
  const result = await sendWorkspaceAction("hydrate-application", {
    selectionKey: String(state.selectionKey || "").trim(),
    guid: normalizedGuid,
    reason: firstNonEmptyString([options.reason, "expand"]),
  });
  if (!alreadyHydrating) {
    setApplicationHydrationState(normalizedGuid, false);
  }
  if (!result?.ok) {
    setStatus(String(result?.error || "Unable to hydrate this registered application."), "error");
  }
  return (
    (result?.application && typeof result.application === "object" ? result.application : null) ||
    getApplicationByGuid(normalizedGuid)
  );
}

async function downloadSoftwareStatementByGuid(guid = "") {
  const normalizedGuid = String(guid || "").trim();
  if (!normalizedGuid) {
    return;
  }
  const app = getApplicationByGuid(normalizedGuid);
  const result = await sendWorkspaceAction("download-application", {
    selectionKey: String(state.selectionKey || "").trim(),
    guid: normalizedGuid,
    queryContext: {
      programmerId: String(state.programmerId || "").trim(),
      programmerName: String(state.programmerName || "").trim(),
      requestorId: String(state.requestorId || "").trim(),
      environmentKey: String(state.environmentKey || "").trim(),
      environmentLabel: String(state.environmentLabel || "").trim(),
      selectionKey: String(state.selectionKey || "").trim(),
    },
  });
  if (!result?.ok) {
    setStatus(String(result?.error || "Unable to download this registered application."), "error");
    return;
  }
  const appLabel = firstNonEmptyString([app?.name, app?.guid, "registered application"]);
  const fileName = String(result?.fileName || "").trim();
  const warning = String(result?.warning || "").trim();
  setStatus(
    [fileName ? `Downloaded ${appLabel} as ${fileName}.` : `Downloaded ${appLabel}.`, warning].filter(Boolean).join(" "),
    warning ? "info" : "success"
  );
}

function setPremiumServiceSwitchBusy(serviceKey = "", busy = false) {
  const normalizedServiceKey = String(serviceKey || "").trim();
  if (!normalizedServiceKey) {
    return;
  }
  if (busy) {
    state.switchingServiceKeys.add(normalizedServiceKey);
  } else {
    state.switchingServiceKeys.delete(normalizedServiceKey);
  }
  updateControllerBanner();
  renderReport();
}

async function switchPremiumServiceApplication(serviceKey = "", guid = "") {
  const normalizedServiceKey = String(serviceKey || "").trim();
  const normalizedGuid = String(guid || "").trim();
  if (!normalizedServiceKey || !normalizedGuid || !state.programmerId) {
    return;
  }
  const currentBinding = getCurrentBindingForService(normalizedServiceKey);
  if (String(currentBinding?.appGuid || "").trim() === normalizedGuid) {
    return;
  }
  setPremiumServiceSwitchBusy(normalizedServiceKey, true);
  const result = await sendWorkspaceAction("switch-premium-service-application", {
    selectionKey: String(state.selectionKey || "").trim(),
    serviceKey: normalizedServiceKey,
    guid: normalizedGuid,
    queryContext: {
      programmerId: String(state.programmerId || "").trim(),
      programmerName: String(state.programmerName || "").trim(),
      requestorId: String(state.requestorId || "").trim(),
      environmentKey: String(state.environmentKey || "").trim(),
      environmentLabel: String(state.environmentLabel || "").trim(),
      selectionKey: String(state.selectionKey || "").trim(),
    },
  });
  setPremiumServiceSwitchBusy(normalizedServiceKey, false);
  if (!result?.ok) {
    setStatus(String(result?.error || "Unable to switch this premium service registered application."), "error");
    return;
  }
  state.pendingPremiumServiceSwitch = null;
  state.premiumServiceBindings = normalizePremiumServiceBindings(
    state.premiumServiceBindings.map((binding) =>
      binding?.serviceKey === normalizedServiceKey
        ? {
            ...binding,
            appGuid: normalizedGuid,
            appName: firstNonEmptyString([result?.appName, normalizedGuid]),
          }
        : binding
    )
  );
  const serviceLabel = firstNonEmptyString([
    result?.serviceLabel,
    REGAPP_PREMIUM_SERVICE_LABEL_BY_KEY[normalizedServiceKey],
    normalizedServiceKey,
  ]);
  const appLabel = firstNonEmptyString([result?.appName, normalizedGuid, "registered application"]);
  renderReport();
  setStatus(`Switched ${serviceLabel} to ${appLabel}.`, "success");
}

function handleReportStart(payload = {}) {
  const selectionKey = String(payload?.selectionKey || "").trim();
  if (selectionKey && state.selectionKey && selectionKey !== state.selectionKey) {
    return;
  }
  state.loading = true;
  state.hydratingGuids.clear();
  syncActionButtonsDisabled();
  renderReport();
  setStatus("Inspecting registered applications...");
}

function handleReportResult(payload = {}) {
  const selectionKey = String(payload?.selectionKey || "").trim();
  if (selectionKey && state.selectionKey && selectionKey !== state.selectionKey) {
    return;
  }
  state.loading = false;
  state.hydratingGuids.clear();
  state.report = payload && typeof payload === "object" ? payload : null;
  state.jwtDecodeCache.clear();
  pruneExpandedApplications();
  syncActionButtonsDisabled();
  renderReport();
  if (!state.report) {
    setStatus("No Registered Application Health Inspector data returned.", "error");
    return;
  }
  if (state.report.ok === true) {
    setStatus(
      `Loaded ${formatCount(state.report?.totalApplications || 0)} registered application${
        Number(state.report?.totalApplications || 0) === 1 ? "" : "s"
      }.`
    );
    return;
  }
  if (state.report.partial === true) {
    setStatus(
      `Loaded ${formatCount(state.report?.totalApplications || 0)} registered application${
        Number(state.report?.totalApplications || 0) === 1 ? "" : "s"
      } with warnings.`
    );
    return;
  }
  setStatus(String(state.report?.error || "Registered Application Health Inspector failed."), "error");
}

function clearWorkspaceCards() {
  state.report = null;
  state.loading = false;
  getExpandedGuidStore().clear();
  state.hydratingGuids.clear();
  state.jwtDecodeCache.clear();
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
  if (event === "application-hydration-start") {
    const selectionKey = String(payload?.selectionKey || "").trim();
    const guid = String(payload?.guid || "").trim();
    if (!guid) {
      return;
    }
    if (!selectionKey || !state.selectionKey || selectionKey === state.selectionKey) {
      setApplicationHydrationState(guid, true);
    }
    return;
  }
  if (event === "application-hydration-complete") {
    const selectionKey = String(payload?.selectionKey || "").trim();
    const guid = String(payload?.guid || "").trim();
    if (!guid) {
      return;
    }
    if (!selectionKey || !state.selectionKey || selectionKey === state.selectionKey) {
      setApplicationHydrationState(guid, false);
    }
    return;
  }
  if (event === "environment-switch-rerun") {
    if (state.loading || !canRunCurrentContextReport()) {
      return;
    }
    void runCurrentContextReport({
      statusMessage: "Refreshing Registered Application Health Inspector for the selected UnderPAR context...",
      preferRefresh: false,
    });
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
      type: REGISTERED_APPLICATION_HEALTH_WORKSPACE_MESSAGE_TYPE,
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

async function runCurrentContextReport(options = {}) {
  if (state.loading) {
    return;
  }
  if (!state.programmerId) {
    setStatus("Select an ENV x Media Company before opening Registered Application Health Inspector.", "error");
    return;
  }
  if (!state.registeredApplicationHealthReady) {
    setStatus("UnderPAR is still hydrating the Adobe Pass registered application context for the selected ENV x Media Company.", "error");
    return;
  }
  const preferRefresh = options.preferRefresh !== false;
  const action = hasRenderableReport() && preferRefresh ? "refresh-latest" : "run-dashboard";
  state.loading = true;
  syncActionButtonsDisabled();
  setStatus(
    String(
      options.statusMessage ||
        (action === "refresh-latest"
          ? "Refreshing Registered Application Health Inspector..."
          : "Loading Registered Application Health Inspector...")
    ).trim()
  );
  const result = await sendWorkspaceAction(action, {
    selectionKey: String(state.selectionKey || "").trim(),
    queryContext: {
      programmerId: String(state.programmerId || "").trim(),
      programmerName: String(state.programmerName || "").trim(),
      requestorId: String(state.requestorId || "").trim(),
      environmentKey: String(state.environmentKey || "").trim(),
      environmentLabel: String(state.environmentLabel || "").trim(),
      selectionKey: String(state.selectionKey || "").trim(),
    },
  });
  if (!result?.ok) {
    state.loading = false;
    syncActionButtonsDisabled();
    setStatus(
      String(
        result?.error ||
          (action === "refresh-latest"
            ? "Unable to refresh Registered Application Health Inspector."
            : "Unable to load Registered Application Health Inspector.")
      ),
      "error"
    );
  }
}

function clearWorkspace() {
  closeJwtInspector();
  clearWorkspaceCards();
  setDecodeSummary("");
  void sendWorkspaceAction("clear-all", {
    selectionKey: String(state.selectionKey || "").trim(),
  });
}

function registerEventHandlers() {
  if (els.rerunAllButton) {
    els.rerunAllButton.addEventListener("click", () => {
      void runCurrentContextReport();
    });
  }
  if (els.clearButton) {
    els.clearButton.addEventListener("click", () => {
      clearWorkspace();
    });
  }
  if (els.decodeForm) {
    els.decodeForm.addEventListener("submit", (event) => {
      event.preventDefault();
      inspectAdHocJwtInput();
    });
  }
  if (els.decodeClearButton) {
    els.decodeClearButton.addEventListener("click", () => {
      if (els.decodeInput) {
        els.decodeInput.value = "";
      }
      setDecodeSummary("");
    });
  }
  if (els.cardsHost) {
    els.cardsHost.addEventListener("click", (event) => {
      const downloadButton =
        event.target instanceof Element ? event.target.closest("[data-software-statement-download-guid]") : null;
      if (downloadButton instanceof HTMLElement) {
        event.preventDefault();
        event.stopPropagation();
        void downloadSoftwareStatementByGuid(downloadButton.dataset.softwareStatementDownloadGuid || "");
      }
    });
    els.cardsHost.addEventListener(
      "toggle",
      (event) => {
        const details = event.target instanceof HTMLDetailsElement ? event.target : null;
        if (!details) {
          return;
        }
        const guid = String(details.dataset.regappGuid || "").trim();
        if (!guid) {
          return;
        }
        setApplicationExpandedState(guid, details.open);
        if (!details.open) {
          renderReport();
          return;
        }
        void ensureApplicationHydrated(guid, { reason: "expand" });
      },
      true
    );
  }
  if (els.dialogCloseButton) {
    els.dialogCloseButton.addEventListener("click", () => {
      closeJwtInspector();
    });
  }
  if (els.dialog) {
    els.dialog.addEventListener("click", (event) => {
      if (event.target === els.dialog) {
        closeJwtInspector();
      }
    });
  }
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== REGISTERED_APPLICATION_HEALTH_WORKSPACE_MESSAGE_TYPE || message?.channel !== "workspace-event") {
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
    setStatus(result?.error || "Unable to contact UnderPAR Registered Application Health Inspector controller.", "error");
  }
}

void init();
