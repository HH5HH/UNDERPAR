const REGISTERED_APPLICATION_HEALTH_WORKSPACE_MESSAGE_TYPE = "underpar:registered-application-health-workspace";

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
  return name || id || "Selected Media Company";
}

function getFilterLabel() {
  const requestorId = String(state.requestorId || "").trim();
  const environmentLabel = String(state.environmentLabel || state.environmentKey || "").trim();
  if (!state.programmerId) {
    return "Select a Media Company in HEALTH > Status and click REG APPS.";
  }
  return [
    `Media Company: ${getProgrammerLabel()}`,
    requestorId ? `Selected RequestorId: ${requestorId}` : "Selected RequestorId: none",
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
  const disableRerun = state.loading || !canRunCurrentContextReport();
  const disableClear = state.loading || !hasRenderableReport();
  const networkBusy = state.loading || state.hydratingGuids.size > 0;
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

function updateControllerBanner() {
  if (els.controllerState) {
    els.controllerState.textContent = `Registered Application Health | ${getProgrammerLabel()}`;
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
  const previousSelectionKey = String(state.selectionKey || "").trim();
  const previousProgrammerId = String(state.programmerId || "").trim();
  const previousRequestorId = String(state.requestorId || "").trim();
  const previousEnvironmentKey = String(state.environmentKey || "").trim();
  const previousReady = state.registeredApplicationHealthReady === true;
  const controllerChanged =
    nextSelectionKey !== previousSelectionKey ||
    nextProgrammerId !== previousProgrammerId ||
    nextEnvironmentKey !== previousEnvironmentKey;
  const requestorChanged = nextRequestorId !== previousRequestorId;
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
  if (controllerChanged) {
    closeJwtInspector();
    state.loading = false;
    getExpandedGuidStore().clear();
    state.hydratingGuids.clear();
  }
  if (shouldClearStaleReport) {
    state.report = null;
    state.jwtDecodeCache.clear();
  }
  updateControllerBanner();
  if (controllerChanged || requestorChanged || shouldClearStaleReport) {
    renderReport();
  }
  if (shouldAutoRefreshForControllerUpdate) {
    void runCurrentContextReport({
      statusMessage: "Refreshing Registered Application Health for the selected UnderPAR context...",
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

function buildSoftwareStatementDownloadFileName(app = null) {
  const label = firstNonEmptyString([app?.name, app?.guid, "registered-application"]);
  const sanitized = label.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "registered-application";
  return `${sanitized}.jwt`;
}

function downloadSoftwareStatementToken(token = "", app = null) {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) {
    setStatus("No software statement JWT is available to download.", "error");
    return;
  }
  const blob = new Blob([normalizedToken], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = buildSoftwareStatementDownloadFileName(app);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
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
  return hints.some((value) => String(value || "").trim().toLowerCase() === selectedRequestorId);
}

function decorateApplication(app = null, index = 0) {
  const token = String(app?.softwareStatement || "").trim();
  const inspection = token ? getDecodedJwt(token) : null;
  const hydrating = state.hydratingGuids.has(String(app?.guid || "").trim());
  return {
    index,
    app,
    inspection,
    selectedRequestorMatch: appMatchesSelectedRequestor(app),
    hydrating,
  };
}

function getDecoratedApplications() {
  return getReportApplications().map((app, index) => decorateApplication(app, index));
}

function buildRequestorSummary(app = {}) {
  return firstNonEmptyString([
    app.requestorHint,
    Array.isArray(app.serviceProviderHints) ? app.serviceProviderHints.join(", ") : "",
    "No requestor hints",
  ]);
}

function buildScopeSummary(app = {}) {
  return Array.isArray(app.scopeLabels) && app.scopeLabels.length > 0 ? app.scopeLabels.join(", ") : "No scopes";
}

function renderApplicationSummaryFacts(app = {}) {
  const summaryFacts = [
    ["Client ID", firstNonEmptyString([app.clientId, "Not returned"])],
    ["Type", firstNonEmptyString([app.type, "Not returned"])],
    ["Requestor Hints", buildRequestorSummary(app)],
    ["Scope Coverage", buildScopeSummary(app)],
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
    return '<article class="rest-report-card"><p class="regapp-empty-state">No registered applications were returned for this Media Company.</p></article>';
  }
  return `
    <section class="regapp-card-grid">
      ${applications
        .map((entry) => {
          const app = entry.app || {};
          const summaryBadges = [
            entry.selectedRequestorMatch ? '<span class="regapp-chip regapp-chip--success">Selected RequestorId</span>' : "",
            String(app.hydrationError || "").trim() ? '<span class="regapp-chip regapp-chip--danger">Hydration Warning</span>' : "",
          ]
            .filter(Boolean)
            .join("");
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
                    <p class="regapp-app-summary-title">${escapeHtml(firstNonEmptyString([app.name, app.guid, "Registered Application"]))}</p>
                    <p class="regapp-app-summary-meta">${escapeHtml(
                      firstNonEmptyString([app.requestorHint, app.serviceProviderSummary, "No requestor hints"])
                    )}</p>
                    ${renderApplicationSummaryFacts(app)}
                  </div>
                  <div class="regapp-app-summary-actions">
                    ${summaryBadges ? `<div class="regapp-chip-stack">${summaryBadges}</div>` : ""}
                    <button
                      type="button"
                      class="regapp-app-summary-btn"
                      data-software-statement-download-guid="${escapeHtml(guid)}"
                    >${entry.hydrating ? "Loading JWT..." : "Download JWT"}</button>
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
    let emptyMessage = "No Registered Application Health report loaded yet.";
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

  const applications = getDecoratedApplications();
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
  let app = getApplicationByGuid(normalizedGuid);
  if (appNeedsHydration(app)) {
    app = await ensureApplicationHydrated(normalizedGuid, { reason: "download" });
  }
  const token = String(app?.softwareStatement || "").trim();
  if (!token) {
    setStatus("This registered application does not expose a downloadable software statement JWT.", "error");
    return;
  }
  downloadSoftwareStatementToken(token, app);
  setStatus(`Downloaded software statement for ${firstNonEmptyString([app?.name, app?.guid, "registered application"])}.`);
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
    setStatus("No Registered Application Health data returned.", "error");
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
  setStatus(String(state.report?.error || "Registered Application Health failed."), "error");
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
      statusMessage: "Refreshing Registered Application Health for the selected UnderPAR context...",
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
    setStatus("Select a Media Company before opening Registered Application Health.", "error");
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
          ? "Refreshing Registered Application Health..."
          : "Loading Registered Application Health...")
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
            ? "Unable to refresh Registered Application Health."
            : "Unable to load Registered Application Health.")
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
    setStatus(result?.error || "Unable to contact UnderPAR Registered Application Health controller.", "error");
  }
}

void init();
