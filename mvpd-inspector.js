const MVPD_INSPECTOR_MESSAGE_TYPE = "underpar:mvpd-inspector";

const state = {
  environmentKey: "",
  entityType: "mvpd",
  mvpdId: "",
  loading: false,
  snapshot: null,
};

const els = {
  title: document.getElementById("mvpd-inspector-title"),
  context: document.getElementById("mvpd-inspector-context"),
  status: document.getElementById("mvpd-inspector-status"),
  refreshButton: document.getElementById("mvpd-inspector-refresh"),
  overview: document.getElementById("mvpd-inspector-overview"),
  associations: document.getElementById("mvpd-inspector-associations"),
  calls: document.getElementById("mvpd-inspector-calls"),
  sections: document.getElementById("mvpd-inspector-sections"),
  sources: document.getElementById("mvpd-inspector-sources"),
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
  for (const value of Array.isArray(values) ? values : [values]) {
    const text = String(value || "").trim();
    if (text) {
      return text;
    }
  }
  return "";
}

function parseInspectorQueryState() {
  const params = new URLSearchParams(globalThis.location?.search || "");
  return {
    environmentKey: String(params.get("environmentKey") || "").trim(),
    entityType: String(params.get("entityType") || "").trim().toLowerCase() === "mvpdproxy" ? "mvpdproxy" : "mvpd",
    mvpdId: String(params.get("mvpdId") || "").trim(),
  };
}

function setStatus(message = "", tone = "info") {
  if (!els.status) {
    return;
  }
  els.status.textContent = String(message || "").trim();
  els.status.dataset.tone = String(tone || "info").trim().toLowerCase() || "info";
}

function setLoadingState(isLoading) {
  state.loading = isLoading === true;
  if (els.refreshButton) {
    els.refreshButton.disabled = state.loading;
    els.refreshButton.querySelector(".spectrum-Button-label").textContent = state.loading ? "Loading" : "Refresh";
  }
}

async function sendInspectorAction(action, payload = {}) {
  const response = await chrome.runtime.sendMessage({
    type: MVPD_INSPECTOR_MESSAGE_TYPE,
    channel: "workspace-action",
    action: String(action || "").trim(),
    ...payload,
  });
  if (!response?.ok) {
    throw new Error(String(response?.error || "Unable to connect to UnderPAR MVPD controller."));
  }
  return response;
}

function formatWhen(timestamp) {
  const value = Number(timestamp || 0);
  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function renderOverview(snapshot) {
  if (!els.overview) {
    return;
  }
  const entries = Array.isArray(snapshot?.overview) ? snapshot.overview : [];
  if (entries.length === 0) {
    els.overview.hidden = true;
    els.overview.innerHTML = "";
    return;
  }
  els.overview.hidden = false;
  els.overview.innerHTML = entries
    .map((entry) => {
      const label = String(entry?.label || "").trim() || "Value";
      const value = String(entry?.value || "").trim() || "\u2013";
      return `
        <article class="mvpd-inspector-overview-card">
          <p class="mvpd-inspector-overview-label">${escapeHtml(label)}</p>
          <p class="mvpd-inspector-overview-value">${escapeHtml(value)}</p>
        </article>
      `;
    })
    .join("");
}

function renderChipGroup(title, values = [], tone = "muted") {
  const chips = (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (chips.length === 0) {
    return "";
  }
  return `
    <section>
      <div class="mvpd-inspector-panel-head">
        <h2 class="mvpd-inspector-panel-title">${escapeHtml(title)}</h2>
        <span class="mvpd-inspector-panel-meta">${chips.length} item${chips.length === 1 ? "" : "s"}</span>
      </div>
      <div class="mvpd-inspector-chip-list">
        ${chips
          .map((value) => `<span class="mvpd-inspector-chip" data-tone="${escapeHtml(tone)}">${escapeHtml(value)}</span>`)
          .join("")}
      </div>
    </section>
  `;
}

function renderAssociations(snapshot) {
  if (!els.associations) {
    return;
  }
  const associatedIds = Array.isArray(snapshot?.associatedServiceProviderIds) ? snapshot.associatedServiceProviderIds : [];
  const resourceIds = Array.isArray(snapshot?.resourceIds) ? snapshot.resourceIds : [];
  const rawResourceIds = Array.isArray(snapshot?.resourceIdsRaw) ? snapshot.resourceIdsRaw : [];
  const tmsIds = Array.isArray(snapshot?.tmsIds) ? snapshot.tmsIds : [];
  const integrationRows = Array.isArray(snapshot?.integrationRows) ? snapshot.integrationRows : [];

  if (associatedIds.length === 0 && resourceIds.length === 0 && rawResourceIds.length === 0 && tmsIds.length === 0 && integrationRows.length === 0) {
    els.associations.hidden = true;
    els.associations.innerHTML = "";
    return;
  }

  const integrationMarkup =
    integrationRows.length > 0
      ? `
        <div class="mvpd-inspector-table-wrap">
          <table class="mvpd-inspector-table">
            <thead>
              <tr>
                <th>Channel / Requestor</th>
                <th>Integration ID</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${integrationRows
                .map((row) => {
                  const requestorId = String(row?.serviceProviderId || "").trim() || "\u2013";
                  const integrationId = String(row?.integrationId || "").trim() || "\u2013";
                  const statusLabel = row?.enabled === false ? "Disabled" : "Enabled";
                  const tone = row?.enabled === false ? "disabled" : "enabled";
                  return `
                    <tr>
                      <td><code>${escapeHtml(requestorId)}</code></td>
                      <td><code>${escapeHtml(integrationId)}</code></td>
                      <td><span class="mvpd-inspector-chip" data-tone="${tone}">${escapeHtml(statusLabel)}</span></td>
                    </tr>
                  `;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      `
      : `<div class="mvpd-inspector-empty">No integration records were resolved for this MVPD selection.</div>`;

  els.associations.hidden = false;
  els.associations.innerHTML = `
    <div class="mvpd-inspector-panel-head">
      <h2 class="mvpd-inspector-panel-title">Associations</h2>
      <span class="mvpd-inspector-panel-meta">${escapeHtml(snapshot?.entityKindLabel || "MVPD")}</span>
    </div>
    ${renderChipGroup("Channels / Requestors", associatedIds)}
    ${renderChipGroup("Resource IDs", resourceIds, "enabled")}
    ${renderChipGroup("Raw Resource IDs", rawResourceIds)}
    ${renderChipGroup("TMS Maps", tmsIds)}
    <section>
      <div class="mvpd-inspector-panel-head">
        <h2 class="mvpd-inspector-panel-title">Integration Coverage</h2>
        <span class="mvpd-inspector-panel-meta">${integrationRows.length} integration${integrationRows.length === 1 ? "" : "s"}</span>
      </div>
      ${integrationMarkup}
    </section>
  `;
}

function renderCalls(snapshot) {
  if (!els.calls) {
    return;
  }
  const calls = Array.isArray(snapshot?.calls) ? snapshot.calls : [];
  if (calls.length === 0) {
    els.calls.hidden = true;
    els.calls.innerHTML = "";
    return;
  }

  els.calls.hidden = false;
  els.calls.innerHTML = `
    <div class="mvpd-inspector-panel-head">
      <h2 class="mvpd-inspector-panel-title">Call Ledger</h2>
      <span class="mvpd-inspector-panel-meta">${calls.length} call${calls.length === 1 ? "" : "s"}</span>
    </div>
    <div class="mvpd-inspector-table-wrap">
      <table class="mvpd-inspector-table">
        <thead>
          <tr>
            <th>Call</th>
            <th>Status</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          ${calls
            .map((call) => {
              const ok = call?.ok === true;
              const statusLabel = ok ? "OK" : "Fail";
              const tone = ok ? "enabled" : "disabled";
              const status = Number.isFinite(Number(call?.status)) && Number(call?.status) > 0 ? String(call.status) : "\u2013";
              const duration = Number.isFinite(Number(call?.durationMs)) && Number(call?.durationMs) >= 0 ? `${call.durationMs} ms` : "\u2013";
              const url = String(call?.url || "").trim();
              const error = String(call?.error || "").trim();
              return `
                <tr>
                  <td>
                    <strong>${escapeHtml(String(call?.label || call?.key || "Call"))}</strong>
                    ${url ? `<span class="mvpd-inspector-call-url">${escapeHtml(url)}</span>` : ""}
                    ${error ? `<span class="mvpd-inspector-call-error">${escapeHtml(error)}</span>` : ""}
                  </td>
                  <td>
                    <span class="mvpd-inspector-chip" data-tone="${tone}">${escapeHtml(statusLabel)} ${escapeHtml(status)}</span>
                  </td>
                  <td>${escapeHtml(duration)}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderEntriesTable(entries = []) {
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  if (normalizedEntries.length === 0) {
    return `<div class="mvpd-inspector-empty">No fields were returned for this section.</div>`;
  }
  return `
    <div class="mvpd-inspector-table-wrap">
      <table class="mvpd-inspector-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Value</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          ${normalizedEntries
            .map((entry) => {
              const path = String(entry?.path || "").trim() || "\u2013";
              const value = String(entry?.value || "").trim() || "\u2013";
              const source = String(entry?.source || "").trim() || "\u2013";
              return `
                <tr>
                  <td><code>${escapeHtml(path)}</code></td>
                  <td>${escapeHtml(value)}</td>
                  <td><code>${escapeHtml(source)}</code></td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSections(snapshot) {
  if (!els.sections) {
    return;
  }
  const sections = Array.isArray(snapshot?.sections) ? snapshot.sections : [];
  if (sections.length === 0) {
    els.sections.innerHTML = `<div class="mvpd-inspector-empty">No inspector sections were generated for this MVPD selection.</div>`;
    return;
  }

  els.sections.innerHTML = sections
    .map((section, index) => {
      const title = String(section?.title || section?.id || "Section").trim();
      const subtitle = String(section?.subtitle || "").trim();
      const entries = Array.isArray(section?.entries) ? section.entries : [];
      return `
        <details class="mvpd-inspector-section"${index < 4 ? " open" : ""}>
          <summary class="mvpd-inspector-section-summary">
            <div>
              <p class="mvpd-inspector-section-title">${escapeHtml(title)}</p>
              ${subtitle ? `<p class="mvpd-inspector-section-subtitle">${escapeHtml(subtitle)}</p>` : ""}
            </div>
            <span class="mvpd-inspector-section-meta">${entries.length} field${entries.length === 1 ? "" : "s"}</span>
          </summary>
          <div class="mvpd-inspector-section-body">${renderEntriesTable(entries)}</div>
        </details>
      `;
    })
    .join("");
}

function renderSourceSamples(snapshot) {
  if (!els.sources) {
    return;
  }
  const sourceSamples = Array.isArray(snapshot?.sourceSamples) ? snapshot.sourceSamples : [];
  if (sourceSamples.length === 0) {
    els.sources.hidden = true;
    els.sources.innerHTML = "";
    return;
  }

  els.sources.hidden = false;
  els.sources.innerHTML = `
    <div class="mvpd-inspector-panel-head">
      <h2 class="mvpd-inspector-panel-title">Source Samples</h2>
      <span class="mvpd-inspector-panel-meta">${sourceSamples.length} payload sample${sourceSamples.length === 1 ? "" : "s"}</span>
    </div>
    ${sourceSamples
      .map((source) => {
        const label = String(source?.label || source?.key || "Source").trim();
        const entries = Array.isArray(source?.entries) ? source.entries : [];
        return `
          <details class="mvpd-inspector-section">
            <summary class="mvpd-inspector-section-summary">
              <div>
                <p class="mvpd-inspector-section-title">${escapeHtml(label)}</p>
                <p class="mvpd-inspector-section-subtitle">${escapeHtml(String(source?.key || "").trim())}</p>
              </div>
              <span class="mvpd-inspector-section-meta">${entries.length} sample field${entries.length === 1 ? "" : "s"}</span>
            </summary>
            <div class="mvpd-inspector-section-body">${renderEntriesTable(entries)}</div>
          </details>
        `;
      })
      .join("")}
  `;
}

function renderSnapshot(snapshot) {
  state.snapshot = snapshot;
  const mvpdLabel = firstNonEmptyString([snapshot?.mvpdLabel, snapshot?.mvpdId, state.mvpdId, "MVPD"]);
  const entityKindLabel = firstNonEmptyString([snapshot?.entityKindLabel, state.entityType === "mvpdproxy" ? "Proxy MVPD" : "Direct MVPD"]);
  const proxyOwnerLabel = String(snapshot?.proxyOwnerLabel || "").trim();
  const fetchedAt = formatWhen(snapshot?.fetchedAt);
  const contextParts = [
    firstNonEmptyString([snapshot?.environmentLabel, state.environmentKey]),
    entityKindLabel,
    `${mvpdLabel}${snapshot?.mvpdId && snapshot?.mvpdId !== mvpdLabel ? ` (${snapshot.mvpdId})` : ""}`,
    proxyOwnerLabel ? `Owner: ${proxyOwnerLabel}` : "",
    fetchedAt ? `Fetched: ${fetchedAt}` : "",
  ].filter(Boolean);
  if (els.context) {
    els.context.textContent = contextParts.join("  •  ");
  }
  if (els.title) {
    els.title.textContent = mvpdLabel;
  }
  document.title = `MVPD Inspector | ${mvpdLabel}`;
  renderOverview(snapshot);
  renderAssociations(snapshot);
  renderCalls(snapshot);
  renderSections(snapshot);
  renderSourceSamples(snapshot);
}

async function loadSnapshot() {
  if (!state.environmentKey || !state.mvpdId) {
    setStatus("MVPD Inspector requires environmentKey and mvpdId in the URL.", "error");
    return;
  }

  setLoadingState(true);
  setStatus("Loading MVPD inspector snapshot...", "info");

  try {
    const response = await sendInspectorAction("load-snapshot", {
      environmentKey: state.environmentKey,
      entityType: state.entityType,
      mvpdId: state.mvpdId,
    });
    renderSnapshot(response.snapshot || null);
    setStatus("MVPD inspector snapshot loaded.", "success");
  } catch (error) {
    state.snapshot = null;
    if (els.overview) els.overview.hidden = true;
    if (els.associations) els.associations.hidden = true;
    if (els.calls) els.calls.hidden = true;
    if (els.sources) els.sources.hidden = true;
    if (els.sections) {
      els.sections.innerHTML = `<div class="mvpd-inspector-empty">${escapeHtml(
        error instanceof Error ? error.message : String(error)
      )}</div>`;
    }
    setStatus(error instanceof Error ? error.message : String(error), "error");
  } finally {
    setLoadingState(false);
  }
}

function initializeInspector() {
  const queryState = parseInspectorQueryState();
  state.environmentKey = queryState.environmentKey;
  state.entityType = queryState.entityType;
  state.mvpdId = queryState.mvpdId;

  if (els.refreshButton) {
    els.refreshButton.addEventListener("click", () => {
      void loadSnapshot();
    });
  }

  void loadSnapshot();
}

initializeInspector();
