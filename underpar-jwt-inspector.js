(function attachUnderParJwtInspector(globalObject) {
  const root = globalObject || globalThis;

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
        return '<p class="up-jwt-empty-state">No decoded fields.</p>';
      }
      if (value.every((entry) => entry == null || typeof entry !== "object")) {
        return `<div class="up-jwt-array">${value
          .map((entry) => `<span class="up-jwt-array-item">${escapeHtml(renderScalarValue(entry))}</span>`)
          .join("")}</div>`;
      }
      return `
        <div class="up-jwt-object-stack">
          ${value
            .map(
              (entry, index) => `
                <section class="up-jwt-object-section">
                  <p class="up-jwt-object-title">${escapeHtml(`${title || "Item"} ${index + 1}`)}</p>
                  ${renderObjectInspector(entry)}
                </section>
              `
            )
            .join("")}
        </div>
      `;
    }

    if (!isPlainObject(value)) {
      return `<p class="up-jwt-empty-state">${escapeHtml(renderScalarValue(value))}</p>`;
    }

    const entries = Object.entries(value);
    const scalarEntries = entries.filter(([, entryValue]) => !entryValue || typeof entryValue !== "object");
    const nestedEntries = entries.filter(([, entryValue]) => entryValue && typeof entryValue === "object");
    if (scalarEntries.length === 0 && nestedEntries.length === 0) {
      return '<p class="up-jwt-empty-state">No decoded fields.</p>';
    }

    return `
      ${scalarEntries.length > 0
        ? `<dl class="up-jwt-object-list">
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
        ? `<div class="up-jwt-object-stack">
            ${nestedEntries
              .map(
                ([key, entryValue]) => `
                  <section class="up-jwt-object-section">
                    <p class="up-jwt-object-title">${escapeHtml(key)}</p>
                    ${renderObjectInspector(entryValue, key)}
                  </section>
                `
              )
              .join("")}
          </div>`
        : ""}
    `;
  }

  function renderTokenPane(inspection = null) {
    if (!inspection?.token) {
      return '<p class="up-jwt-empty-state">No software statement JWT is available.</p>';
    }
    return `
      <div class="up-jwt-token-segments">
        <article class="up-jwt-token-segment">
          <p class="up-jwt-token-segment-label">Header Segment</p>
          <code>${escapeHtml(chunkMonospaceText(inspection.headerSegment))}</code>
        </article>
        <article class="up-jwt-token-segment">
          <p class="up-jwt-token-segment-label">Payload Segment</p>
          <code>${escapeHtml(chunkMonospaceText(inspection.payloadSegment))}</code>
        </article>
        <article class="up-jwt-token-segment">
          <p class="up-jwt-token-segment-label">Signature Segment</p>
          <code>${escapeHtml(chunkMonospaceText(inspection.signatureSegment))}</code>
        </article>
      </div>
    `;
  }

  function renderSummaryCards(inspection = null) {
    if (!inspection?.token) {
      return '<p class="up-jwt-empty-state">No JWT is available to inspect.</p>';
    }
    const summary = inspection.summary || {};
    const cards = [
      ["Algorithm", firstNonEmptyString([summary.algorithm])],
      ["Type", firstNonEmptyString([summary.type])],
      ["Key ID", firstNonEmptyString([summary.keyId])],
      ["Issuer", firstNonEmptyString([summary.issuer])],
      ["Client ID", firstNonEmptyString([summary.clientId])],
      ["Subject", firstNonEmptyString([summary.subject])],
      ["Audience", firstNonEmptyString([summary.audience])],
      ["Issued", firstNonEmptyString([summary.issuedAt])],
      ["Not Before", firstNonEmptyString([summary.notBefore])],
      ["Expires", firstNonEmptyString([summary.expiresAt])],
      ["Scopes", summary.scopes && summary.scopes.length > 0 ? summary.scopes.join(", ") : ""],
      ["Decode State", inspection.valid === true ? "Decoded locally" : "Needs review"],
    ].filter(([, value]) => String(value ?? "").trim());
    return `
      <div class="up-jwt-summary-grid">
        ${cards
          .map(
            ([label, value]) => `
              <article class="up-jwt-summary-card">
                <p class="up-jwt-summary-label">${escapeHtml(label)}</p>
                <p class="up-jwt-summary-value">${escapeHtml(value)}</p>
              </article>
            `
          )
          .join("")}
      </div>
    `;
  }

  function buildInspectorMarkup(inspection = null, options = {}) {
    const normalizedInspection = inspection && typeof inspection === "object" ? inspection : null;
    const loading = options?.loading === true;
    const rawPanelTitle = firstNonEmptyString([options?.rawTitle, "JWT Segments"]);
    const rawPanelSubtitle = firstNonEmptyString([
      options?.rawSubtitle,
      "Raw JWT segments shown without sending the token to any third-party service.",
    ]);
    const loadingTitle = firstNonEmptyString([options?.loadingTitle, options?.rawTitle, "JWT Segments"]);
    const loadingSubtitle = firstNonEmptyString([
      options?.loadingSubtitle,
      "UnderPAR is decoding JWT claims locally now.",
    ]);
    if (!normalizedInspection?.token && !loading) {
      return '<p class="up-jwt-empty-state">No JWT is available to inspect.</p>';
    }
    if (loading) {
      return `
        <article class="up-jwt-panel">
          <header class="up-jwt-panel-head">
            <p class="up-jwt-panel-title">${escapeHtml(loadingTitle)}</p>
            <p class="up-jwt-panel-subtitle">${escapeHtml(loadingSubtitle)}</p>
          </header>
          <div class="up-jwt-panel-body">
            <p class="up-jwt-empty-state">UnderPAR is decoding JWT claims locally now...</p>
          </div>
        </article>
      `;
    }
    return `
      <div class="up-jwt-layout">
        <section class="up-jwt-panel">
          <header class="up-jwt-panel-head">
            <p class="up-jwt-panel-title">${escapeHtml(rawPanelTitle)}</p>
            <p class="up-jwt-panel-subtitle">${escapeHtml(rawPanelSubtitle)}</p>
          </header>
          <div class="up-jwt-panel-body">
            ${renderTokenPane(normalizedInspection)}
          </div>
        </section>
        <section class="up-jwt-panel">
          <header class="up-jwt-panel-head">
            <p class="up-jwt-panel-title">Decoded JWT</p>
            <p class="up-jwt-panel-subtitle">${
              normalizedInspection.valid === true
                ? "Header and payload were decoded locally."
                : "UnderPAR could not fully decode this token. Review the raw segments."
            }</p>
          </header>
          <div class="up-jwt-panel-body">
            ${renderSummaryCards(normalizedInspection)}
            <div class="up-jwt-sections">
              <section class="up-jwt-object-section">
                <p class="up-jwt-object-title">Header</p>
                ${renderObjectInspector(normalizedInspection.header)}
              </section>
              <section class="up-jwt-object-section">
                <p class="up-jwt-object-title">Payload</p>
                ${renderObjectInspector(normalizedInspection.payload)}
              </section>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  root.UnderParJwtInspector = {
    escapeHtml,
    firstNonEmptyString,
    uniqueStringArray,
    tryParseJson,
    isPlainObject,
    normalizeJwtTimestamp,
    decodeBase64UrlText,
    isProbablyJwt,
    extractJwtCandidateFromValue,
    extractJwtCandidateFromText,
    decodeJwtToken,
    buildInspectorMarkup,
  };
})(globalThis);
