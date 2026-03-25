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

function hasRenderableReport() {
  return Boolean(state.report);
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
    els.controllerState.textContent = `Registered Application Inspector | ${getProgrammerLabel()}`;
  }
  if (els.filterState) {
    els.filterState.textContent = getFilterLabel();
  }
  renderWorkspaceEnvironmentBadge();
  syncActionButtonsDisabled();
}

function applyControllerState(payload = {}) {
  state.controllerOnline = payload?.controllerOnline === true;
  state.registeredApplicationHealthReady = payload?.registeredApplicationHealthReady === true;
  state.programmerId = String(payload?.programmerId || "");
  state.programmerName = String(payload?.programmerName || "");
  state.requestorId = String(payload?.requestorId || "");
  state.environmentKey = String(payload?.environmentKey || "");
  state.environmentLabel = String(payload?.environmentLabel || "");
  state.selectionKey = String(payload?.selectionKey || "");
  updateControllerBanner();
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
  const jwtState = !token ? "missing" : inspection?.valid === true ? "decoded" : "undecodable";
  const jwtStateLabel = !token ? "Missing JWT" : inspection?.valid === true ? "Decoded" : "Needs Review";
  return {
    index,
    app,
    inspection,
    selectedRequestorMatch: appMatchesSelectedRequestor(app),
    jwtState,
    jwtStateLabel,
  };
}

function getDecoratedApplications() {
  return getReportApplications().map((app, index) => decorateApplication(app, index));
}

function buildMetricCardsMarkup(applications = []) {
  const totalApplications = applications.length;
  const withStatements = applications.filter((entry) => String(entry?.app?.softwareStatement || "").trim()).length;
  const decodedStatements = applications.filter((entry) => entry?.inspection?.valid === true).length;
  const selectedMatches = applications.filter((entry) => entry?.selectedRequestorMatch === true).length;
  return `
    <div class="regapp-metric-grid">
      <article class="regapp-metric-card">
        <p class="regapp-metric-label">Registered Apps</p>
        <p class="regapp-metric-value">${escapeHtml(formatCount(totalApplications))}</p>
        <p class="regapp-metric-copy">All registered applications returned for the selected Media Company.</p>
      </article>
      <article class="regapp-metric-card">
        <p class="regapp-metric-label">Software Statements</p>
        <p class="regapp-metric-value">${escapeHtml(formatCount(withStatements))}</p>
        <p class="regapp-metric-copy">Applications that currently expose a software statement JWT.</p>
      </article>
      <article class="regapp-metric-card">
        <p class="regapp-metric-label">Decoded JWTs</p>
        <p class="regapp-metric-value">${escapeHtml(formatCount(decodedStatements))}</p>
        <p class="regapp-metric-copy">Statements UnderPAR could decode locally without leaving the workspace.</p>
      </article>
      <article class="regapp-metric-card">
        <p class="regapp-metric-label">Selected RequestorId Matches</p>
        <p class="regapp-metric-value">${escapeHtml(formatCount(selectedMatches))}</p>
        <p class="regapp-metric-copy">Registered applications that claim the active RequestorId context.</p>
      </article>
    </div>
  `;
}

function buildWarningsMarkup() {
  const warnings = Array.isArray(state.report?.warnings) ? state.report.warnings : [];
  if (warnings.length === 0) {
    return "";
  }
  return `
    <div class="regapp-warning-stack">
      ${warnings
        .map(
          (warning) => `
            <article class="regapp-warning-card">
              <p class="regapp-warning-title">Hydration Warning</p>
              <p class="regapp-warning-copy">${escapeHtml(String(warning || "").trim())}</p>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function buildJwtStateChip(jwtState = "", label = "") {
  const normalizedState = String(jwtState || "").trim().toLowerCase();
  const modifier =
    normalizedState === "decoded" ? "success" : normalizedState === "missing" ? "warning" : "danger";
  return `<span class="regapp-chip regapp-chip--${modifier}">${escapeHtml(label || normalizedState || "JWT")}</span>`;
}

function buildScopeChipsMarkup(values = []) {
  const scopes = uniqueStringArray(values);
  if (scopes.length === 0) {
    return '<span class="regapp-chip">No scopes</span>';
  }
  return scopes.map((scope) => `<span class="regapp-chip">${escapeHtml(scope)}</span>`).join("");
}

function renderMatrixTable(applications = []) {
  if (applications.length === 0) {
    return '<p class="regapp-empty-state">No registered applications are loaded yet.</p>';
  }
  const rowsHtml = applications
    .map((entry) => {
      const app = entry.app || {};
      const requestorSummary = firstNonEmptyString([
        app.requestorHint,
        Array.isArray(app.serviceProviderHints) ? app.serviceProviderHints.join(", ") : "",
        "—",
      ]);
      const scopeSummary = Array.isArray(app.scopeLabels) && app.scopeLabels.length > 0 ? app.scopeLabels.join(", ") : "No scopes";
      return `
        <tr>
          <td>
            <div class="regapp-app-link">${escapeHtml(firstNonEmptyString([app.name, app.guid, "Registered Application"]))}</div>
            <div class="regapp-app-link-meta">
              ${buildJwtStateChip(entry.jwtState, entry.jwtStateLabel)}
              ${entry.selectedRequestorMatch ? '<span class="regapp-chip regapp-chip--success">Selected RequestorId</span>' : ""}
            </div>
          </td>
          <td>${escapeHtml(requestorSummary)}</td>
          <td>${escapeHtml(firstNonEmptyString([app.clientId, "—"]))}</td>
          <td>${escapeHtml(scopeSummary)}</td>
          <td>
            <button
              type="button"
              class="regapp-app-footer-btn"
              data-jwt-inspect-guid="${escapeHtml(String(app.guid || "").trim())}"
              ${String(app.softwareStatement || "").trim() ? "" : "disabled"}
            >Inspect JWT</button>
          </td>
        </tr>
      `;
    })
    .join("");
  return `
    <div class="rest-report-table-wrap">
      <table class="rest-report-table regapp-matrix-table">
        <thead>
          <tr>
            <th>Registered Application</th>
            <th>Requestor / Service Provider</th>
            <th>Client ID</th>
            <th>Scopes</th>
            <th>JWT</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;
}

function renderMetadataGrid(app = {}, entry = null) {
  const requestorSummary = firstNonEmptyString([
    app.requestorHint,
    Array.isArray(app.serviceProviderHints) ? app.serviceProviderHints.join(", ") : "",
    "No requestor hints",
  ]);
  const scopeSummary = Array.isArray(app.scopeLabels) && app.scopeLabels.length > 0 ? app.scopeLabels.join(", ") : "No scopes";
  const detailCards = [
    ["Client ID", firstNonEmptyString([app.clientId, "Not returned"])],
    ["Type", firstNonEmptyString([app.type, "Not returned"])],
    ["Requestor Hints", requestorSummary],
    ["Scope Coverage", scopeSummary],
  ];
  if (String(app.hydrationError || "").trim()) {
    detailCards.push(["Hydration", String(app.hydrationError || "").trim()]);
  }
  return `
    <div class="regapp-app-meta-grid">
      ${detailCards
        .map(
          ([label, value]) => `
            <article class="regapp-app-meta-card">
              <p class="regapp-app-meta-label">${escapeHtml(label)}</p>
              <p class="regapp-app-meta-value">${escapeHtml(value)}</p>
            </article>
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

function buildJwtInspectorMarkup(inspection = null) {
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
            buildJwtStateChip(entry.jwtState, entry.jwtStateLabel),
            entry.selectedRequestorMatch ? '<span class="regapp-chip regapp-chip--success">Selected RequestorId</span>' : "",
            String(app.hydrationError || "").trim() ? '<span class="regapp-chip regapp-chip--danger">Hydration Warning</span>' : "",
          ]
            .filter(Boolean)
            .join("");
          const defaultOpen = entry.selectedRequestorMatch || entry.jwtState !== "decoded" || entry.index === 0;
          return `
            <details class="rest-report-card regapp-app-card${entry.selectedRequestorMatch ? " is-selected-match" : ""}"${
              defaultOpen ? " open" : ""
            }>
              <summary class="regapp-app-summary">
                <div class="regapp-app-summary-copy">
                  <p class="regapp-app-summary-title">${escapeHtml(firstNonEmptyString([app.name, app.guid, "Registered Application"]))}</p>
                  <p class="regapp-app-summary-meta">
                    ${escapeHtml(firstNonEmptyString([app.requestorHint, app.serviceProviderSummary, "No requestor hints"]))}
                    ${
                      String(app.clientId || "").trim()
                        ? ` | Client ID: ${escapeHtml(String(app.clientId || "").trim())}`
                        : ""
                    }
                  </p>
                </div>
                <div class="regapp-app-summary-actions">${summaryBadges}</div>
              </summary>
              <div class="regapp-app-body">
                ${renderMetadataGrid(app, entry)}
                ${buildJwtInspectorMarkup(entry.inspection || { token: "" })}
                <div class="regapp-app-footer">
                  <button
                    type="button"
                    class="regapp-app-footer-btn"
                    data-jwt-inspect-guid="${escapeHtml(String(app.guid || "").trim())}"
                    ${String(app.softwareStatement || "").trim() ? "" : "disabled"}
                  >Open JWT Inspector</button>
                </div>
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
    els.cardsHost.innerHTML =
      '<article class="rest-report-card"><p class="regapp-empty-state">No Registered Application Inspector report loaded yet.</p></article>';
    return;
  }

  const applications = getDecoratedApplications();
  const checkedAtLabel = formatDateTime(state.report?.checkedAt);
  const queryContext = state.report?.queryContext || {};
  const selectedRequestorLabel = String(state.requestorId || queryContext?.requestorId || "").trim();

  els.cardsHost.innerHTML = `
    <article class="rest-report-card">
      <header class="rest-report-head">
        <p class="rest-report-title">Registered Application Inspector</p>
        <p class="rest-report-meta">
          <strong>Checked:</strong> ${escapeHtml(checkedAtLabel)}
          ${
            selectedRequestorLabel
              ? ` | <strong>Selected RequestorId:</strong> ${escapeHtml(selectedRequestorLabel)}`
              : ""
          }
        </p>
        <p class="regapp-overview-copy">
          Local JWT decoding for software statements across the active ${escapeHtml(
            firstNonEmptyString([state.programmerName, state.programmerId, "Media Company"])
          )} application catalog.
        </p>
      </header>
      ${buildMetricCardsMarkup(applications)}
      ${buildWarningsMarkup()}
    </article>
    <article class="rest-report-card">
      <header class="rest-report-head">
        <p class="rest-report-title">Application Matrix</p>
        <p class="rest-report-meta">Fast scan of requestor hints, client IDs, scope coverage, and JWT availability.</p>
      </header>
      ${renderMatrixTable(applications)}
    </article>
    ${renderApplicationCards(applications)}
  `;
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

function openApplicationInspectorByGuid(guid = "") {
  const normalizedGuid = String(guid || "").trim();
  if (!normalizedGuid) {
    return;
  }
  const app = getReportApplications().find((entry) => String(entry?.guid || "").trim() === normalizedGuid) || null;
  const token = String(app?.softwareStatement || "").trim();
  if (!token) {
    setStatus("This registered application does not have a software statement JWT to inspect.", "error");
    return;
  }
  openJwtInspector(token, {
    title: firstNonEmptyString([app?.name, app?.guid, "Registered Application"]),
    subtitle: firstNonEmptyString([
      app?.requestorHint,
      app?.serviceProviderSummary,
      "Decoded from the registered application software statement.",
    ]),
  });
}

function handleReportStart(payload = {}) {
  const selectionKey = String(payload?.selectionKey || "").trim();
  if (selectionKey && state.selectionKey && selectionKey !== state.selectionKey) {
    return;
  }
  state.loading = true;
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
  state.report = payload && typeof payload === "object" ? payload : null;
  state.jwtDecodeCache.clear();
  syncActionButtonsDisabled();
  renderReport();
  if (!state.report) {
    setStatus("No Registered Application Inspector data returned.", "error");
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
  setStatus(String(state.report?.error || "Registered Application Inspector failed."), "error");
}

function clearWorkspaceCards() {
  state.report = null;
  state.loading = false;
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
    renderReport();
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

async function rerunLatestReport() {
  if (state.loading) {
    return;
  }
  if (!hasRenderableReport()) {
    setStatus("No previous Registered Application Inspector report is available to refresh.", "error");
    return;
  }
  state.loading = true;
  syncActionButtonsDisabled();
  setStatus("Refreshing Registered Application Inspector...");
  const result = await sendWorkspaceAction("refresh-latest", {
    selectionKey: String(state.selectionKey || "").trim(),
  });
  if (!result?.ok) {
    state.loading = false;
    syncActionButtonsDisabled();
    setStatus(String(result?.error || "Unable to refresh Registered Application Inspector."), "error");
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
      void rerunLatestReport();
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
      const inspectButton = event.target instanceof Element ? event.target.closest("[data-jwt-inspect-guid]") : null;
      if (!(inspectButton instanceof HTMLElement)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      openApplicationInspectorByGuid(inspectButton.dataset.jwtInspectGuid || "");
    });
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
    setStatus(result?.error || "Unable to contact UnderPAR Registered Application HEALTH controller.", "error");
  }
}

void init();
