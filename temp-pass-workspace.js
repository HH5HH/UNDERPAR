const TEMP_PASS_WORKSPACE_MESSAGE_TYPE = "underpar:temp-pass-workspace";

const state = {
  windowId: 0,
  controllerOnline: false,
  tempPassReady: false,
  profilesReady: false,
  authorizeReady: false,
  resetReady: false,
  programmerId: "",
  programmerName: "",
  requestorId: "",
  selectionKey: "",
  deviceId: "",
  restAppGuid: "",
  restAppName: "",
  resetAppGuid: "",
  resetAppName: "",
  adobePassEnvironment: null,
  activeAction: "",
  results: [],
  formDirty: {
    deviceId: false,
  },
};

const els = {
  controllerState: document.getElementById("workspace-controller-state"),
  filterState: document.getElementById("workspace-filter-state"),
  status: document.getElementById("workspace-status"),
  clearButton: document.getElementById("workspace-clear-all"),
  pageEnvBadge: document.getElementById("page-env-badge"),
  pageEnvBadgeValue: document.getElementById("page-env-badge-value"),
  requestorInput: document.getElementById("workspace-requestor"),
  mvpdInput: document.getElementById("workspace-temp-pass-mvpd"),
  deviceIdInput: document.getElementById("workspace-device-id"),
  genericKeyInput: document.getElementById("workspace-generic-key"),
  resourceIdsInput: document.getElementById("workspace-resource-ids"),
  identityJsonInput: document.getElementById("workspace-identity-json"),
  resetAllDevicesInput: document.getElementById("workspace-reset-all-devices"),
  resetAllGenericInput: document.getElementById("workspace-reset-all-generic"),
  profilesButton: document.getElementById("workspace-run-profiles"),
  authorizeButton: document.getElementById("workspace-run-authorize"),
  resetDeviceButton: document.getElementById("workspace-run-reset-device"),
  resetGenericButton: document.getElementById("workspace-run-reset-generic"),
  restAppPill: document.getElementById("workspace-rest-app-pill"),
  resetAppPill: document.getElementById("workspace-reset-app-pill"),
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

function stringifyJsonForDisplay(value) {
  if (value == null || value === "") {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
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

function parseResourceIds(value = "") {
  return String(value || "")
    .split(/[,\n\r;]+/g)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
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
    restV2Base: "https://sp.auth.adobe.com/api/v2",
  };
}

function buildWorkspaceEnvironmentTooltip(environment) {
  const resolved = resolveWorkspaceAdobePassEnvironment(environment);
  return [
    `Environment : ${String(resolved?.label || resolved?.key || "Production").trim() || "Production"}`,
    `REST V2 : ${String(resolved?.restV2Base || "n/a").trim() || "n/a"}`,
    `Reset TempPASS : ${String(resolved?.mgmtBase || "n/a").trim() || "n/a"}/reset-tempass/v3/reset`,
  ].join("\n");
}

function renderWorkspaceEnvironmentBadge() {
  if (!els.pageEnvBadge || !els.pageEnvBadgeValue) {
    return;
  }
  const environment = resolveWorkspaceAdobePassEnvironment(state.adobePassEnvironment);
  const registry = getWorkspaceEnvironmentRegistry();
  const environmentKey = String(environment?.key || "release-production").trim() || "release-production";
  const label = String(environment?.label || "Production").trim() || "Production";
  const badgeLabel =
    String(registry?.buildEnvironmentBadgeLabel?.(environment) || `Release ${label}`).trim() || `Release ${label}`;
  const title = buildWorkspaceEnvironmentTooltip(environment);
  els.pageEnvBadgeValue.textContent = badgeLabel;
  els.pageEnvBadgeValue.setAttribute("aria-hidden", "false");
  els.pageEnvBadge.dataset.environmentKey = environmentKey;
  els.pageEnvBadge.title = title;
  els.pageEnvBadge.setAttribute("aria-label", title);
  els.pageEnvBadge.dataset.environmentLabel = badgeLabel;
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
  if (!state.requestorId) {
    return "Select a RequestorId in UnderPAR, then enter the TempPASS MVPD here.";
  }
  return `RequestorId: ${state.requestorId} | Current device: ${state.deviceId || "Unavailable"}`;
}

function setStatus(message = "", type = "info") {
  if (!els.status) {
    return;
  }
  const text = String(message || "").trim();
  els.status.textContent = text;
  els.status.hidden = text.length === 0;
  els.status.classList.remove("error", "success", "info");
  els.status.classList.add(type === "error" ? "error" : type === "success" ? "success" : "info");
}

function applyControllerState(payload = {}) {
  const previousRequestorId = String(state.requestorId || "").trim();
  state.controllerOnline = payload?.controllerOnline === true;
  state.tempPassReady = payload?.tempPassReady === true;
  state.profilesReady = payload?.profilesReady === true;
  state.authorizeReady = payload?.authorizeReady === true;
  state.resetReady = payload?.resetReady === true;
  state.programmerId = String(payload?.programmerId || "");
  state.programmerName = String(payload?.programmerName || "");
  state.requestorId = String(payload?.requestorId || "");
  state.selectionKey = String(payload?.selectionKey || "");
  state.deviceId = String(payload?.deviceId || "");
  state.restAppGuid = String(payload?.restAppGuid || "");
  state.restAppName = String(payload?.restAppName || "");
  state.resetAppGuid = String(payload?.resetAppGuid || "");
  state.resetAppName = String(payload?.resetAppName || "");
  state.adobePassEnvironment =
    payload?.adobePassEnvironment && typeof payload.adobePassEnvironment === "object"
      ? { ...payload.adobePassEnvironment }
      : null;

  if (els.requestorInput) {
    els.requestorInput.value = state.requestorId;
  }
  if (els.deviceIdInput && (!state.formDirty.deviceId || !String(els.deviceIdInput.value || "").trim() || previousRequestorId !== state.requestorId)) {
    els.deviceIdInput.value = state.deviceId;
  }
  if (els.restAppPill) {
    els.restAppPill.textContent = state.restAppName || "REST V2 app unavailable";
    els.restAppPill.classList.toggle("is-missing", !state.restAppGuid);
  }
  if (els.resetAppPill) {
    els.resetAppPill.textContent = state.resetAppName || "Reset app unavailable";
    els.resetAppPill.classList.toggle("is-missing", !state.resetAppGuid);
  }
  updateControllerBanner();
  renderWorkspaceEnvironmentBadge();
  syncActionButtonsDisabled();
}

function updateControllerBanner() {
  if (els.controllerState) {
    els.controllerState.textContent = `TempPASS Workspace | ${getProgrammerLabel()}`;
  }
  if (els.filterState) {
    els.filterState.textContent = getFilterLabel();
  }
}

function collectFormValues() {
  return {
    actionKey: "",
    tempPassMvpd: String(els.mvpdInput?.value || "").trim(),
    deviceId: String(els.deviceIdInput?.value || "").trim(),
    genericKey: String(els.genericKeyInput?.value || "").trim(),
    resourceIds: String(els.resourceIdsInput?.value || "").trim(),
    identityJson: String(els.identityJsonInput?.value || "").trim(),
    resetAllDevices: els.resetAllDevicesInput?.checked === true,
    resetAllGeneric: els.resetAllGenericInput?.checked === true,
  };
}

function syncActionButtonsDisabled() {
  const formValues = collectFormValues();
  const hasMvpd = Boolean(formValues.tempPassMvpd);
  const hasResources = parseResourceIds(formValues.resourceIds).length > 0;
  const hasDeviceTarget = formValues.resetAllDevices || Boolean(formValues.deviceId);
  const hasGenericTarget = formValues.resetAllGeneric || Boolean(formValues.genericKey);
  const busy = Boolean(state.activeAction);
  if (els.profilesButton) {
    els.profilesButton.disabled = busy || !state.profilesReady || !state.requestorId || !hasMvpd;
  }
  if (els.authorizeButton) {
    els.authorizeButton.disabled = busy || !state.authorizeReady || !state.requestorId || !hasMvpd || !hasResources;
  }
  if (els.resetDeviceButton) {
    els.resetDeviceButton.disabled = busy || !state.resetReady || !state.requestorId || !hasMvpd || !hasDeviceTarget;
  }
  if (els.resetGenericButton) {
    els.resetGenericButton.disabled = busy || !state.resetReady || !state.requestorId || !hasMvpd || !hasGenericTarget;
  }
  if (els.clearButton) {
    els.clearButton.disabled = busy || state.results.length === 0;
  }
  if (els.deviceIdInput) {
    els.deviceIdInput.disabled = busy || els.resetAllDevicesInput?.checked === true;
  }
  if (els.genericKeyInput) {
    els.genericKeyInput.disabled = busy || els.resetAllGenericInput?.checked === true;
  }
}

function renderProfileRows(result = null) {
  const profileRows = Array.isArray(result?.profileRows) ? result.profileRows : [];
  if (profileRows.length === 0) {
    return '<p class="workspace-empty-copy">No temporary profiles were returned.</p>';
  }
  return profileRows
    .map((row) => {
      const attributes = Array.isArray(row?.attributes) ? row.attributes : [];
      const attributeMarkup =
        attributes.length > 0
          ? `<div class="temp-pass-attribute-list">${attributes
              .map(
                (attribute) =>
                  `<span class="temp-pass-attribute-pill"><strong>${escapeHtml(attribute?.key || "")}</strong>${escapeHtml(
                    attribute?.value || ""
                  )}</span>`
              )
              .join("")}</div>`
          : "";
      return `
        <article class="temp-pass-result-subcard">
          <p class="temp-pass-result-subtitle">${escapeHtml(String(row?.profileKey || "Temporary Profile").trim() || "Temporary Profile")}</p>
          <p class="temp-pass-result-meta">
            subject=${escapeHtml(String(row?.subject || "").trim() || "n/a")} |
            session=${escapeHtml(String(row?.sessionId || "").trim() || "n/a")} |
            expires=${escapeHtml(formatDateTime(row?.notAfterMs))}
          </p>
          ${attributeMarkup}
        </article>
      `;
    })
    .join("");
}

function renderDecisionRows(result = null) {
  const rows = Array.isArray(result?.decisionRows) ? result.decisionRows : [];
  if (rows.length === 0) {
    return '<p class="workspace-empty-copy">No authorization decisions were returned.</p>';
  }
  const bodyRows = rows
    .map((row) => {
      const decision = String(row?.decision || "").trim() || "Unknown";
      const decisionClass = decision.toLowerCase() === "permit" ? "permit" : decision.toLowerCase() === "deny" ? "deny" : "unknown";
      return `
        <tr>
          <td>${escapeHtml(String(row?.resourceId || "").trim() || "n/a")}</td>
          <td><span class="temp-pass-decision-badge ${decisionClass}">${escapeHtml(decision)}</span></td>
          <td>${escapeHtml(String(row?.source || "").trim() || "n/a")}</td>
          <td>${escapeHtml(String(row?.errorCode || row?.errorDetails || "").trim() || "-")}</td>
        </tr>
      `;
    })
    .join("");
  return `
    <div class="temp-pass-table-wrap">
      <table class="temp-pass-table">
        <thead>
          <tr>
            <th>Resource</th>
            <th>Decision</th>
            <th>Source</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `;
}

function renderRawPayload(result = null) {
  const payloadText = stringifyJsonForDisplay(result?.responsePayload || result?.responsePreview || "");
  if (!payloadText) {
    return "";
  }
  return `
    <details class="temp-pass-raw-payload">
      <summary>Raw response</summary>
      <pre>${escapeHtml(payloadText)}</pre>
    </details>
  `;
}

function renderResultCard(result = null) {
  if (!result || typeof result !== "object") {
    return "";
  }
  const ok = result.ok === true;
  const status = Number(result.status || 0);
  const checkedAt = formatDateTime(result.checkedAt);
  const actionLabel = firstNonEmptyString([result.actionLabel, result.actionKey, "TempPASS"]);
  const badgeClass = ok ? "ok" : "error";
  const metaLine = [
    `RequestorId=${String(result.requestorId || "").trim() || "n/a"}`,
    `TempPASS=${String(result.tempPassMvpd || "").trim() || "n/a"}`,
    `HTTP ${status || 0}${String(result.statusText || "").trim() ? ` ${String(result.statusText || "").trim()}` : ""}`,
    `Checked=${checkedAt}`,
  ].join(" | ");
  let bodyMarkup = "";
  if (result.resultType === "profiles") {
    bodyMarkup = renderProfileRows(result);
  } else if (result.resultType === "authorize") {
    bodyMarkup = renderDecisionRows(result);
  } else {
    const scopeText =
      result.resetMode === "generic"
        ? result.resetAllGeneric
          ? "Applied to all generic identities."
          : `Generic key: ${String(result.genericKey || "").trim() || "n/a"}`
        : result.resetAllDevices
          ? "Applied to all devices."
          : `Device ID: ${String(result.deviceId || "").trim() || "n/a"}`;
    bodyMarkup = `<p class="workspace-empty-copy">${escapeHtml(scopeText)}</p>`;
  }
  const errorMarkup = ok ? "" : `<p class="workspace-error-copy">${escapeHtml(String(result.error || "Request failed.").trim())}</p>`;
  const identityMarkup = result.identityPresent
    ? `<p class="temp-pass-identity-copy">Promotional identity: <code>${escapeHtml(String(result.identityPreview || "").trim() || "present")}</code></p>`
    : "";
  const summaryMarkup =
    result.resultType === "authorize"
      ? `<p class="temp-pass-summary-copy">Permit=${Number(result.permitCount || 0)} | Deny=${Number(result.denyCount || 0)} | Unknown=${Number(result.unknownCount || 0)}</p>`
      : result.resultType === "profiles"
        ? `<p class="temp-pass-summary-copy">Profiles returned: ${Number(result.profileCount || 0)}</p>`
        : "";
  return `
    <article class="temp-pass-result-card">
      <header class="temp-pass-result-head">
        <div>
          <p class="temp-pass-result-title">${escapeHtml(actionLabel)}</p>
          <p class="temp-pass-result-meta">${escapeHtml(metaLine)}</p>
        </div>
        <span class="temp-pass-result-badge ${badgeClass}">${ok ? "OK" : "ERROR"}</span>
      </header>
      <div class="temp-pass-result-body">
        ${identityMarkup}
        ${summaryMarkup}
        ${errorMarkup}
        ${bodyMarkup}
        ${renderRawPayload(result)}
      </div>
    </article>
  `;
}

function renderResults() {
  if (!els.cardsHost) {
    return;
  }
  if (!Array.isArray(state.results) || state.results.length === 0) {
    els.cardsHost.innerHTML = `
      <article class="temp-pass-empty-state">
        <p class="temp-pass-empty-title">No TempPASS results yet.</p>
        <p class="workspace-empty-copy">Run PROFILE, AUTHORIZE, or one of the reset actions to populate this workspace.</p>
      </article>
    `;
    return;
  }
  els.cardsHost.innerHTML = state.results.map((result) => renderResultCard(result)).join("");
}

function handleResultsSync(payload = {}) {
  const selectionKey = String(payload?.selectionKey || "").trim();
  if (selectionKey && state.selectionKey && selectionKey !== state.selectionKey) {
    return;
  }
  state.results = Array.isArray(payload?.results) ? payload.results.slice() : [];
  renderResults();
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
  if (event === "results-sync") {
    handleResultsSync(payload);
    return;
  }
  if (event === "request-start") {
    state.activeAction = String(payload?.actionKey || "").trim().toLowerCase();
    syncActionButtonsDisabled();
    setStatus(`Running ${state.activeAction || "TempPASS"}...`);
    return;
  }
  if (event === "result-result") {
    state.activeAction = "";
    syncActionButtonsDisabled();
    if (payload?.ok === true) {
      setStatus(`${firstNonEmptyString([payload?.actionLabel, payload?.actionKey, "TempPASS"])} completed.`, "success");
    } else {
      setStatus(String(payload?.error || "TempPASS request failed."), "error");
    }
    return;
  }
  if (event === "workspace-clear") {
    state.activeAction = "";
    state.results = [];
    renderResults();
    syncActionButtonsDisabled();
    setStatus("");
    return;
  }
  if (event === "environment-switch-rerun") {
    if (payload?.adobePassEnvironment && typeof payload.adobePassEnvironment === "object") {
      state.adobePassEnvironment = { ...payload.adobePassEnvironment };
      renderWorkspaceEnvironmentBadge();
    }
    state.activeAction = "";
    syncActionButtonsDisabled();
    setStatus("Environment changed. TempPASS context refreshed.");
  }
}

async function sendWorkspaceAction(action, payload = {}) {
  try {
    return await chrome.runtime.sendMessage({
      type: TEMP_PASS_WORKSPACE_MESSAGE_TYPE,
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

async function runWorkspaceAction(actionKey = "") {
  const normalizedActionKey = String(actionKey || "").trim().toLowerCase();
  if (!normalizedActionKey) {
    return;
  }
  if (!state.requestorId) {
    setStatus("Select a RequestorId in UnderPAR before using TempPASS.", "error");
    return;
  }

  state.activeAction = normalizedActionKey;
  syncActionButtonsDisabled();
  setStatus(`Running ${normalizedActionKey}...`);

  const result = await sendWorkspaceAction("run-request", {
    request: {
      actionKey: normalizedActionKey,
      selectionKey: state.selectionKey,
      tempPassMvpd: String(els.mvpdInput?.value || "").trim(),
      identityJson: String(els.identityJsonInput?.value || "").trim(),
      resourceIds: String(els.resourceIdsInput?.value || "").trim(),
      deviceId: String(els.deviceIdInput?.value || "").trim(),
      genericKey: String(els.genericKeyInput?.value || "").trim(),
      resetAllDevices: els.resetAllDevicesInput?.checked === true,
      resetAllGeneric: els.resetAllGenericInput?.checked === true,
    },
  });

  if (!result?.ok && !result?.result) {
    state.activeAction = "";
    syncActionButtonsDisabled();
    setStatus(String(result?.error || "TempPASS request failed."), "error");
  }
}

function clearWorkspace() {
  state.results = [];
  renderResults();
  syncActionButtonsDisabled();
  setStatus("");
  void sendWorkspaceAction("clear-all", {
    selectionKey: state.selectionKey,
  });
}

function registerEventHandlers() {
  if (els.clearButton) {
    els.clearButton.addEventListener("click", () => {
      clearWorkspace();
    });
  }
  if (els.profilesButton) {
    els.profilesButton.addEventListener("click", () => {
      void runWorkspaceAction("profiles");
    });
  }
  if (els.authorizeButton) {
    els.authorizeButton.addEventListener("click", () => {
      void runWorkspaceAction("authorize");
    });
  }
  if (els.resetDeviceButton) {
    els.resetDeviceButton.addEventListener("click", () => {
      void runWorkspaceAction("reset-device");
    });
  }
  if (els.resetGenericButton) {
    els.resetGenericButton.addEventListener("click", () => {
      void runWorkspaceAction("reset-generic");
    });
  }
  if (els.deviceIdInput) {
    els.deviceIdInput.addEventListener("input", () => {
      state.formDirty.deviceId = true;
      syncActionButtonsDisabled();
    });
  }
  if (els.mvpdInput) {
    els.mvpdInput.addEventListener("input", () => {
      syncActionButtonsDisabled();
    });
  }
  if (els.resourceIdsInput) {
    els.resourceIdsInput.addEventListener("input", () => {
      syncActionButtonsDisabled();
    });
  }
  if (els.genericKeyInput) {
    els.genericKeyInput.addEventListener("input", () => {
      syncActionButtonsDisabled();
    });
  }
  if (els.resetAllDevicesInput) {
    els.resetAllDevicesInput.addEventListener("change", () => {
      syncActionButtonsDisabled();
    });
  }
  if (els.resetAllGenericInput) {
    els.resetAllGenericInput.addEventListener("change", () => {
      syncActionButtonsDisabled();
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== TEMP_PASS_WORKSPACE_MESSAGE_TYPE || message?.channel !== "workspace-event") {
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
  renderWorkspaceEnvironmentBadge();
  renderResults();
  syncActionButtonsDisabled();
  const result = await sendWorkspaceAction("workspace-ready");
  if (!result?.ok) {
    setStatus(result?.error || "Unable to contact UnderPAR TempPASS controller.", "error");
  }
}

void init();
