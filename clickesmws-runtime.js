(() => {
  const ESM_SOURCE_UTC_OFFSET_MINUTES = -8 * 60;
  const WORKSPACE_TABLE_VISIBLE_ROW_CAP = 10;
  const ESM_METRIC_COLUMNS = new Set([
    "authn-attempts",
    "authn-successful",
    "authn-pending",
    "authn-failed",
    "clientless-tokens",
    "clientless-failures",
    "authz-attempts",
    "authz-successful",
    "authz-failed",
    "authz-rejected",
    "authz-latency",
    "media-tokens",
    "unique-accounts",
    "unique-sessions",
    "count",
    "decision-attempts",
    "decision-successful",
    "decision-failed",
    "decision-media-tokens",
  ]);
  const ESM_DATE_PARTS = ["year", "month", "day", "hour", "minute"];
  const ESM_DEPRECATED_COLUMN_KEYS = new Set(["clientless-failures", "clientless-tokens"]);
  const ESM_NODE_BASE_URL = "https://mgmt.auth.adobe.com/esm/v3/media-company/";
  const ESM_NODE_BASE_PATH = "esm/v3/media-company/";
  const WORKSPACE_EXPORT_FILE_SYSTEM_QUERY_KEYS = new Set(["format", "limit"]);
  const CLICK_ESM_ZOOM_OPTIONS = ["YR", "MO", "DAY", "HR", "MIN"];
  const CLICK_ESM_ZOOM_TOKEN_BY_KEY = {
    YR: "/year",
    MO: "/month",
    DAY: "/day",
    HR: "/hour",
    MIN: "/minute",
  };
  const CLICK_ESM_RESULT_LIMIT = 100;
  const CLICK_ESM_TOKEN_URL = "https://mgmt.auth.adobe.com/api/v1/tokens/usermanagement";

  const payloadNode = document.getElementById("clickesmws-payload");
  let payload = {};
  try {
    payload = JSON.parse(payloadNode?.textContent || "{}");
  } catch {
    payload = {};
  }

  const CLIENT_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || String(payload.clientTimeZone || "UTC");

  const state = {
    requestorIds: Array.isArray(payload.requestorIds) ? payload.requestorIds.map((value) => String(value || "").trim()).filter(Boolean) : [],
    mvpdIds: Array.isArray(payload.mvpdIds) ? payload.mvpdIds.map((value) => String(value || "").trim()).filter(Boolean) : [],
    cardsById: new Map(),
    endpointColumnsByUrl: new Map(),
    batchRunning: false,
    exporting: false,
  };

  const els = {
    cardsHost: document.getElementById("workspace-cards"),
    status: document.getElementById("workspace-status"),
    controllerState: document.getElementById("workspace-controller-state"),
    filterState: document.getElementById("workspace-filter-state"),
    exportMeta: document.getElementById("workspace-export-meta"),
    makeWorkspaceButton: document.getElementById("workspace-make-clickesmws"),
    rerunAllButton: document.getElementById("workspace-rerun-all"),
    clearButton: document.getElementById("workspace-clear-all"),
  };

  enforceExportToolbarConstraints();
  applyHeaderFromPayload();
  registerTopHandlers();
  hydrateCardsFromPayload();
  syncToolbarButtons();

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setStatus(message = "", type = "info") {
    if (!els.status) {
      return;
    }
    els.status.textContent = String(message || "").trim();
    els.status.classList.remove("error");
    if (type === "error") {
      els.status.classList.add("error");
    }
  }

  function enforceExportToolbarConstraints() {
    document.querySelectorAll(".workspace-title-spacer, .workspace-action-spacer").forEach((node) => node.remove());
    const referenceButton = document.getElementById("workspace-make-clickesm");
    if (referenceButton) {
      referenceButton.remove();
    }
    if (els.makeWorkspaceButton) {
      els.makeWorkspaceButton.remove();
      els.makeWorkspaceButton = null;
    }
    if (els.clearButton) {
      els.clearButton.remove();
      els.clearButton = null;
    }
    if (els.exportMeta) {
      els.exportMeta.remove();
      els.exportMeta = null;
    }
  }

  function applyHeaderFromPayload() {
    if (els.controllerState) {
      els.controllerState.textContent = String(payload.controllerStateText || "Selected Media Company");
    }
    if (els.filterState) {
      els.filterState.textContent = String(payload.filterStateText || "");
    }
    if (els.exportMeta) {
      els.exportMeta.textContent = String(payload.exportMetaText || "");
    }
  }

  function registerTopHandlers() {
    if (els.rerunAllButton) {
      els.rerunAllButton.addEventListener("click", () => {
        void rerunAllCards();
      });
    }
    if (els.clearButton) {
      els.clearButton.addEventListener("click", () => {
        clearWorkspaceCards();
      });
    }
    if (els.makeWorkspaceButton) {
      els.makeWorkspaceButton.addEventListener("click", () => {
        void exportWorkspaceTearsheet();
      });
    }
  }

  function syncToolbarButtons() {
    const hasCards = state.cardsById.size > 0;
    const isRunningCard = [...state.cardsById.values()].some((cardState) => cardState.running === true);
    const isBusy = Boolean(state.batchRunning || state.exporting || isRunningCard);

    if (els.makeWorkspaceButton) {
      els.makeWorkspaceButton.disabled = isBusy || !hasCards;
    }
    if (els.rerunAllButton) {
      els.rerunAllButton.disabled = isBusy || !hasCards;
    }
    if (els.clearButton) {
      els.clearButton.disabled = isBusy || !hasCards;
    }
  }

  function firstNonEmptyString(values) {
    for (const value of Array.isArray(values) ? values : []) {
      const normalized = String(value || "").trim();
      if (normalized) {
        return normalized;
      }
    }
    return "";
  }

  function sanitizeFileSegment(value, fallback = "download") {
    const normalized = String(value || "")
      .trim()
      .replace(/[^\w.-]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return normalized || fallback;
  }

  function truncateFileSegment(value, maxLength = 48) {
    const normalized = String(value || "").trim();
    if (!normalized) {
      return "";
    }
    if (!Number.isFinite(maxLength) || maxLength <= 0) {
      return normalized;
    }
    if (normalized.length <= maxLength) {
      return normalized;
    }
    return normalized.slice(0, maxLength);
  }

  function getWorkspaceExportQueryEntries(urlValue) {
    const raw = String(urlValue || "").trim();
    if (!raw) {
      return [];
    }
    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      return [];
    }
    const entries = [];
    parsed.searchParams.forEach((value, key) => {
      const normalizedKey = String(key || "").trim().toLowerCase();
      if (!normalizedKey || WORKSPACE_EXPORT_FILE_SYSTEM_QUERY_KEYS.has(normalizedKey)) {
        return;
      }
      const normalizedValue = String(value || "").trim();
      if (!normalizedValue) {
        return;
      }
      entries.push({ key: normalizedKey, value: normalizedValue });
    });
    return entries;
  }

  function areStringSetsEqual(leftSet, rightSet) {
    if (!(leftSet instanceof Set) || !(rightSet instanceof Set)) {
      return false;
    }
    if (leftSet.size !== rightSet.size) {
      return false;
    }
    for (const value of leftSet) {
      if (!rightSet.has(value)) {
        return false;
      }
    }
    return true;
  }

  function compactWorkspaceExportContextValue(value, maxLength = 16) {
    const raw = String(value || "").trim();
    if (!raw) {
      return "";
    }
    if (/^\d{4}-\d{2}(-\d{2})?(T\d{2}:\d{2}(:\d{2})?Z)?$/i.test(raw)) {
      const digits = raw.replace(/\D+/g, "");
      return truncateFileSegment(digits, Math.max(8, maxLength));
    }
    return truncateFileSegment(sanitizeFileSegment(raw, ""), maxLength);
  }

  function buildWorkspaceExportGlobalContext(snapshot = {}) {
    const cards = Array.isArray(snapshot?.cards) ? snapshot.cards : [];
    if (cards.length === 0) {
      return "ctx";
    }

    const cardMaps = cards.map((cardSnapshot) => {
      const map = new Map();
      const requestUrl = String(cardSnapshot?.requestUrl || cardSnapshot?.endpointUrl || "").trim();
      getWorkspaceExportQueryEntries(requestUrl).forEach(({ key, value }) => {
        if (!map.has(key)) {
          map.set(key, new Set());
        }
        map.get(key).add(value);
      });
      return map;
    });

    const firstMap = cardMaps[0] instanceof Map ? cardMaps[0] : new Map();
    const sharedEntries = [];
    firstMap.forEach((valueSet, key) => {
      const isShared = cardMaps.every((map) => map.has(key) && areStringSetsEqual(valueSet, map.get(key)));
      if (isShared) {
        sharedEntries.push([key, valueSet]);
      }
    });
    if (sharedEntries.length === 0) {
      return "ctx";
    }

    const aliasByKey = {
      "requestor-id": "rq",
      mvpd: "mv",
      start: "st",
      end: "en",
    };
    const visibleEntries = sharedEntries
      .sort((left, right) => left[0].localeCompare(right[0]))
      .slice(0, 3)
      .map(([key, valueSet]) => {
        const alias = aliasByKey[key] || truncateFileSegment(sanitizeFileSegment(String(key || ""), "q"), 4);
        const values = [...valueSet].sort();
        if (values.length === 0) {
          return alias;
        }
        if (values.length > 1) {
          return `${alias}${values.length}`;
        }
        const compactValue = compactWorkspaceExportContextValue(values[0], 14);
        return compactValue ? `${alias}-${compactValue}` : alias;
      });
    const remainder = sharedEntries.length - visibleEntries.length;
    if (remainder > 0) {
      visibleEntries.push(`k${remainder}`);
    }
    return truncateFileSegment(sanitizeFileSegment(visibleEntries.join("_"), "ctx"), 44);
  }

  function buildFileStamp() {
    return sanitizeFileSegment(new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"), "snapshot");
  }

  function getTokenStorageKey() {
    const cid = String(document.querySelector('input[name="cid"]')?.value || "").trim();
    if (!cid) {
      return "clickesm_access_token_default";
    }
    const safeCid = cid.replace(/[^a-zA-Z0-9._-]+/g, "_");
    return `clickesm_access_token_${safeCid}`;
  }

  function getToken() {
    const inputToken = String(document.querySelector('input[name="access_token"]')?.value || "").trim();
    if (inputToken) {
      return inputToken;
    }
    const storageKey = getTokenStorageKey();
    return String(localStorage.getItem(storageKey) || localStorage.getItem("access_token") || "").trim();
  }

  function setToken(token) {
    const normalized = String(token || "").trim();
    const input = document.querySelector('input[name="access_token"]');
    if (input) {
      input.value = normalized;
    }
    const storageKey = getTokenStorageKey();
    if (normalized) {
      localStorage.setItem(storageKey, normalized);
      localStorage.setItem("access_token", normalized);
    } else {
      localStorage.removeItem(storageKey);
      localStorage.removeItem("access_token");
    }
  }

  async function refreshToken() {
    const cid = String(document.querySelector('input[name="cid"]')?.value || "").trim();
    const csc = String(document.querySelector('input[name="csc"]')?.value || "").trim();
    if (!cid || !csc) {
      throw new Error("Missing clickESM credentials for token refresh.");
    }

    const response = await fetch(
      `${CLICK_ESM_TOKEN_URL}?grant_type=client_credentials&client_id=${encodeURIComponent(cid)}&client_secret=${encodeURIComponent(csc)}`,
      {
        method: "GET",
      }
    );
    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      throw new Error(`Unable to refresh ESM token (HTTP ${response.status}${bodyText ? ` ${bodyText.trim()}` : ""}).`);
    }
    const payload = await response.json().catch(() => null);
    const accessToken = String(payload?.access_token || "").trim();
    if (!accessToken) {
      throw new Error("Token refresh did not return an access token.");
    }
    setToken(accessToken);
    return accessToken;
  }

  async function fetchWithAuth(url) {
    const targetUrl = String(url || "").trim();
    if (!targetUrl) {
      throw new Error("ESM endpoint URL is required.");
    }

    let token = getToken();
    if (!token) {
      token = await refreshToken();
    }

    let response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401) {
      token = await refreshToken();
      response = await fetch(targetUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    }

    return response;
  }

  function clickEsmIso(date) {
    return new Date(date).toISOString().replace(/\.\d{3}Z$/, "Z");
  }

  function clickEsmShiftInstantToPstCalendar(date) {
    return new Date(date.getTime() + ESM_SOURCE_UTC_OFFSET_MINUTES * 60 * 1000);
  }

  function clickEsmComputeTimeWindow(zoomKey) {
    const now = new Date();
    const nowPst = clickEsmShiftInstantToPstCalendar(now);

    if (zoomKey === "YR") {
      return {
        start: String(nowPst.getUTCFullYear() - 1),
        end: clickEsmIso(now),
      };
    }

    if (zoomKey === "MO") {
      const previousMonth = new Date(Date.UTC(nowPst.getUTCFullYear(), nowPst.getUTCMonth() - 1, 1));
      return {
        start: `${previousMonth.getUTCFullYear()}-${String(previousMonth.getUTCMonth() + 1).padStart(2, "0")}`,
        end: clickEsmIso(now),
      };
    }

    if (zoomKey === "DAY") {
      const previousDay = new Date(Date.UTC(nowPst.getUTCFullYear(), nowPst.getUTCMonth(), nowPst.getUTCDate() - 1));
      return {
        start: `${previousDay.getUTCFullYear()}-${String(previousDay.getUTCMonth() + 1).padStart(2, "0")}-${String(
          previousDay.getUTCDate()
        ).padStart(2, "0")}`,
        end: clickEsmIso(now),
      };
    }

    if (zoomKey === "HR") {
      return {
        start: clickEsmIso(new Date(now.getTime() - 12 * 60 * 60 * 1000)),
        end: clickEsmIso(now),
      };
    }

    if (zoomKey === "MIN") {
      return {
        start: clickEsmIso(new Date(now.getTime() - 60 * 60 * 1000)),
        end: clickEsmIso(now),
      };
    }

    return {
      start: clickEsmIso(now),
      end: clickEsmIso(now),
    };
  }

  function detectZoomKey(cardState) {
    const explicit = String(cardState?.zoomKey || "").trim().toUpperCase();
    if (CLICK_ESM_ZOOM_OPTIONS.includes(explicit)) {
      return explicit;
    }

    const href = String(cardState?.endpointUrl || cardState?.requestUrl || "");
    let detected = "";
    let bestIndex = -1;
    Object.entries(CLICK_ESM_ZOOM_TOKEN_BY_KEY).forEach(([key, token]) => {
      const index = href.lastIndexOf(token);
      if (index > bestIndex) {
        detected = key;
        bestIndex = index;
      }
    });
    return detected || "";
  }

  function buildLiveRequestUrl(cardState, endpointOverride = "") {
    const baseUrl = firstNonEmptyString([endpointOverride, cardState?.endpointUrl, cardState?.requestUrl]);
    if (!baseUrl) {
      throw new Error("Endpoint URL is required.");
    }

    const zoomKey = detectZoomKey(cardState);
    const timeWindow = clickEsmComputeTimeWindow(zoomKey);
    const parsed = new URL(baseUrl);
    parsed.searchParams.set("start", timeWindow.start);
    parsed.searchParams.set("end", timeWindow.end);
    parsed.searchParams.set("format", "json");
    parsed.searchParams.set("limit", String(CLICK_ESM_RESULT_LIMIT));
    parsed.searchParams.delete("requestor-id");
    parsed.searchParams.delete("mvpd");

    state.requestorIds.forEach((requestorId) => {
      parsed.searchParams.append("requestor-id", requestorId);
    });
    state.mvpdIds.forEach((mvpdId) => {
      parsed.searchParams.append("mvpd", mvpdId);
    });

    return parsed.toString();
  }

  function safeDecodeUrlSegment(segment) {
    const raw = String(segment || "");
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }

  function stripEsmBaseFromPath(pathValue) {
    const normalized = String(pathValue || "").replace(/^\/+|\/+$/g, "");
    if (!normalized) {
      return "";
    }
    const lower = normalized.toLowerCase();
    const marker = ESM_NODE_BASE_PATH.toLowerCase();
    if (lower.startsWith(marker)) {
      return normalized.slice(marker.length).replace(/^\/+|\/+$/g, "");
    }
    return normalized;
  }

  function parseRawQueryPairs(urlValue) {
    const raw = String(urlValue || "").trim();
    if (!raw) {
      return [];
    }

    const queryIndex = raw.indexOf("?");
    if (queryIndex < 0) {
      return [];
    }

    const hashIndex = raw.indexOf("#", queryIndex + 1);
    const queryText = raw.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined).trim();
    if (!queryText) {
      return [];
    }

    return queryText
      .split("&")
      .map((entry) => String(entry || "").trim())
      .filter(Boolean)
      .map((entry) => {
        const equalsIndex = entry.indexOf("=");
        if (equalsIndex < 0) {
          return {
            key: safeDecodeUrlSegment(entry.replace(/\+/g, " ")),
            value: "",
            hasValue: false,
          };
        }
        return {
          key: safeDecodeUrlSegment(entry.slice(0, equalsIndex).replace(/\+/g, " ")),
          value: entry.slice(equalsIndex + 1),
          hasValue: true,
        };
      });
  }

  function parseEsmRequestContext(urlValue) {
    const raw = String(urlValue || "").trim();
    if (!raw) {
      return {
        fullUrl: "",
        displayPath: "",
        queryPairs: [],
      };
    }

    let displayPath = "";
    try {
      const parsed = new URL(raw);
      displayPath = stripEsmBaseFromPath(parsed.pathname);
    } catch {
      displayPath = "";
    }

    if (!displayPath) {
      const withoutQuery = raw.split(/[?#]/, 1)[0] || raw;
      const withoutBase = withoutQuery.startsWith(ESM_NODE_BASE_URL) ? withoutQuery.slice(ESM_NODE_BASE_URL.length) : withoutQuery;
      displayPath = stripEsmBaseFromPath(withoutBase);
    }

    return {
      fullUrl: raw,
      displayPath,
      queryPairs: parseRawQueryPairs(raw),
    };
  }

  function buildPathEndpointUrl(baseEndpointUrl, pathSegments, depth) {
    const normalizedDepth = Number(depth);
    if (!Number.isInteger(normalizedDepth) || normalizedDepth < 1) {
      return "";
    }

    const normalizedSegments = (Array.isArray(pathSegments) ? pathSegments : [])
      .map((segment) => String(segment || "").trim())
      .filter(Boolean)
      .slice(0, normalizedDepth);
    if (normalizedSegments.length === 0) {
      return "";
    }

    const targetPath = normalizedSegments.join("/");
    const fallback = `${ESM_NODE_BASE_URL}${targetPath}`;
    const rawBase = String(baseEndpointUrl || "").trim();
    if (!rawBase) {
      return fallback;
    }

    try {
      const parsed = new URL(rawBase);
      parsed.pathname = `/${ESM_NODE_BASE_PATH}${targetPath}`;
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return fallback;
    }
  }

  function getEsmNodeLabel(urlValue) {
    const context = parseEsmRequestContext(urlValue);
    if (!context.fullUrl) {
      return "node";
    }

    const segments = String(context.displayPath || "")
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);
    return segments.length > 0 ? safeDecodeUrlSegment(segments[segments.length - 1]) : "node";
  }

  function buildWorkspaceCardId(prefix = "workspace") {
    const normalizedPrefix = String(prefix || "workspace").replace(/[^a-z0-9_-]+/gi, "-");
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `${normalizedPrefix}-${crypto.randomUUID()}`;
    }
    const stamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 10);
    return `${normalizedPrefix}-${stamp}-${random}`;
  }

  function cloneRows(rows) {
    return (Array.isArray(rows) ? rows : []).map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        return {};
      }
      return { ...row };
    });
  }

  function normalizeEsmColumns(columns) {
    const output = [];
    const seen = new Set();
    (Array.isArray(columns) ? columns : []).forEach((value) => {
      const normalized = String(value || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!normalized) {
        return;
      }
      if (/^no\s+report\s+columns$/i.test(normalized)) {
        if (!seen.has("no report columns")) {
          output.push("No report columns");
          seen.add("no report columns");
        }
        return;
      }
      const lower = normalized.toLowerCase();
      if (ESM_DEPRECATED_COLUMN_KEYS.has(lower)) {
        return;
      }
      if (!seen.has(lower)) {
        output.push(normalized);
        seen.add(lower);
      }
    });
    return output;
  }

  function getEndpointColumnsCacheKey(urlValue) {
    const raw = String(urlValue || "").trim();
    if (!raw) {
      return "";
    }
    try {
      const parsed = new URL(raw);
      const normalizedPath = parsed.pathname.replace(/\/+$/, "");
      return `${parsed.origin}${normalizedPath}`;
    } catch {
      return raw.split(/[?#]/, 1)[0].replace(/\/+$/, "");
    }
  }

  function cacheEndpointColumns(urlValue, columns) {
    const key = getEndpointColumnsCacheKey(urlValue);
    if (!key) {
      return;
    }
    const normalizedColumns = normalizeEsmColumns(columns);
    if (normalizedColumns.length === 0) {
      return;
    }
    state.endpointColumnsByUrl.set(key, normalizedColumns.slice());
  }

  function resolveCachedEndpointColumns(urlValue) {
    const key = getEndpointColumnsCacheKey(urlValue);
    if (!key) {
      return [];
    }
    const cached = state.endpointColumnsByUrl.get(key);
    return Array.isArray(cached) ? cached.slice() : [];
  }

  function deriveColumnsFromRows(rows, fallbackColumns = []) {
    const firstRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (firstRow && typeof firstRow === "object" && !Array.isArray(firstRow)) {
      const rowColumns = normalizeEsmColumns(Object.keys(firstRow));
      if (rowColumns.length > 0) {
        return rowColumns;
      }
    }
    return normalizeEsmColumns(fallbackColumns);
  }

  function getDefaultSortStack() {
    return [{ col: "DATE", dir: "DESC" }];
  }

  function normalizeSortStack(rawSortStack) {
    const list = (Array.isArray(rawSortStack) ? rawSortStack : [])
      .map((entry) => ({
        col: String(entry?.col || "").trim(),
        dir: String(entry?.dir || "").trim().toUpperCase() === "ASC" ? "ASC" : "DESC",
      }))
      .filter((entry) => entry.col);
    return list.length > 0 ? list : getDefaultSortStack();
  }

  function buildCardHeaderContextMarkup(urlValue, endpointUrl = "") {
    const context = parseEsmRequestContext(urlValue);
    if (!context.fullUrl) {
      return '<span class="card-url-empty">No ESM URL</span>';
    }

    const pathSegments = String(context.displayPath || "")
      .split("/")
      .map((segment) => safeDecodeUrlSegment(segment.trim()))
      .filter(Boolean);

    const pathMarkup =
      pathSegments.length > 0
        ? pathSegments
            .map((segment, index) => {
              const segmentClass = `card-url-path-segment${index === pathSegments.length - 1 ? " card-url-path-segment-terminal" : ""}`;
              const segmentEndpointUrl = buildPathEndpointUrl(endpointUrl || context.fullUrl, pathSegments, index + 1);
              const segmentText = escapeHtml(segment);
              const segmentMarkup = segmentEndpointUrl
                ? `<a class="${segmentClass} card-url-path-link" href="${escapeHtml(segmentEndpointUrl)}" data-endpoint-url="${escapeHtml(
                    segmentEndpointUrl
                  )}" data-source-request-url="${escapeHtml(context.fullUrl)}">${segmentText}</a>`
                : `<span class="${segmentClass}">${segmentText}</span>`;
              return `${segmentMarkup}${index < pathSegments.length - 1 ? '<span class="card-url-path-divider">/</span>' : ""}`;
            })
            .join("")
        : '<span class="card-url-path-segment card-url-path-segment-empty">media-company</span>';

    const queryMarkup =
      context.queryPairs.length > 0
        ? context.queryPairs
            .map((pair) => {
              const keyHtml = `<span class="card-url-query-key">${escapeHtml(pair.key)}</span>`;
              if (!pair.hasValue) {
                return `<span class="card-url-query-chip">${keyHtml}</span>`;
              }
              return `<span class="card-url-query-chip">${keyHtml}<span class="card-url-query-eq">=</span><span class="card-url-query-value">${escapeHtml(
                pair.value
              )}</span></span>`;
            })
            .join("")
        : '<span class="card-url-query-empty">no-query</span>';

    return `
      <span class="card-url-context" aria-label="ESM request context">
        <span class="card-url-path" aria-label="ESM path">${pathMarkup}</span>
        <span class="card-url-query-cloud" aria-label="ESM query context">${queryMarkup}</span>
      </span>
    `;
  }

  function buildCardColumnsMarkup(cardState) {
    const columns = normalizeEsmColumns(cardState?.columns);
    const requestUrl = String(cardState?.requestUrl || cardState?.endpointUrl || "").trim();
    const nodeLabel = getEsmNodeLabel(requestUrl);
    const endpointMarkup = requestUrl
      ? `<a class="card-col-parent-url card-rerun-url" href="${escapeHtml(requestUrl)}" title="${escapeHtml(requestUrl)}">${escapeHtml(
          nodeLabel
        )}</a>`
      : `<span class="card-col-parent-url card-col-parent-url-empty">node</span>`;
    const columnsMarkup =
      columns.length > 0
        ? columns.map((column) => `<span class="card-col-chip">${escapeHtml(column)}</span>`).join("")
        : `<span class="card-col-empty">No columns</span>`;

    return `
      <div class="card-col-list">
        <div class="card-col-layout">
          <div class="card-col-node">${endpointMarkup}</div>
          <div class="card-col-columns" aria-label="ESM columns">${columnsMarkup}</div>
        </div>
      </div>
    `;
  }

  function updateCardHeader(cardState) {
    const requestUrl = String(cardState.requestUrl || cardState.endpointUrl || "").trim();
    cardState.titleElement.innerHTML = buildCardHeaderContextMarkup(requestUrl, String(cardState.endpointUrl || ""));
    cardState.titleElement.title = requestUrl || "No ESM URL";
    const zoom = cardState.zoomKey ? `Zoom: ${cardState.zoomKey}` : "Zoom: --";
    const rows = Array.isArray(cardState.rows) ? cardState.rows.length : 0;
    cardState.subtitleElement.textContent = `${zoom} | Rows: ${rows}`;
    wireCardHeaderPathLinks(cardState);
  }

  function createCardElements(cardState) {
    const article = document.createElement("article");
    article.className = "report-card";
    article.setAttribute("data-card-id", cardState.cardId);

    article.innerHTML = `
      <div class="card-head">
        <div class="card-title-wrap">
          <p class="card-title"></p>
          <p class="card-subtitle"></p>
        </div>
        <div class="card-actions">
          <button type="button" class="card-close" aria-label="Close report card" title="Close report card">
            <svg class="card-close-icon" viewBox="0 0 12 12" focusable="false" aria-hidden="true">
              <path d="M2 2 10 10" />
              <path d="M10 2 2 10" />
            </svg>
          </button>
        </div>
      </div>
      <div class="card-body"></div>
    `;

    cardState.element = article;
    cardState.titleElement = article.querySelector(".card-title");
    cardState.subtitleElement = article.querySelector(".card-subtitle");
    cardState.closeButton = article.querySelector(".card-close");
    cardState.bodyElement = article.querySelector(".card-body");
  }

  function ensureCard(cardMeta, options = {}) {
    const cardId = String(cardMeta?.cardId || "").trim();
    if (!cardId) {
      return null;
    }

    if (state.cardsById.has(cardId)) {
      const existing = state.cardsById.get(cardId);
      if (cardMeta?.endpointUrl) {
        existing.endpointUrl = String(cardMeta.endpointUrl);
      }
      if (cardMeta?.requestUrl) {
        existing.requestUrl = String(cardMeta.requestUrl);
      }
      if (cardMeta?.zoomKey) {
        existing.zoomKey = String(cardMeta.zoomKey || "").trim().toUpperCase();
      }
      if (Array.isArray(cardMeta?.columns)) {
        existing.columns = normalizeEsmColumns(cardMeta.columns);
      }
      if (Array.isArray(cardMeta?.rows)) {
        existing.rows = cloneRows(cardMeta.rows);
      }
      if (cardMeta?.lastModified != null) {
        existing.lastModified = String(cardMeta.lastModified || "");
      }
      if (Array.isArray(cardMeta?.sortStack)) {
        existing.sortStack = normalizeSortStack(cardMeta.sortStack);
      }
      cacheEndpointColumns(existing.endpointUrl || existing.requestUrl, existing.columns);
      updateCardHeader(existing);
      return existing;
    }

    const cardState = {
      cardId,
      endpointUrl: String(cardMeta?.endpointUrl || ""),
      requestUrl: String(cardMeta?.requestUrl || cardMeta?.endpointUrl || ""),
      zoomKey: String(cardMeta?.zoomKey || "").trim().toUpperCase(),
      columns: normalizeEsmColumns(cardMeta?.columns),
      rows: cloneRows(cardMeta?.rows),
      sortStack: normalizeSortStack(cardMeta?.sortStack),
      lastModified: String(cardMeta?.lastModified || ""),
      running: false,
      element: null,
      titleElement: null,
      subtitleElement: null,
      closeButton: null,
      bodyElement: null,
    };
    cacheEndpointColumns(cardState.endpointUrl || cardState.requestUrl, cardState.columns);

    createCardElements(cardState);
    updateCardHeader(cardState);
    renderCardMessage(cardState, "Waiting for data...");

    cardState.closeButton.addEventListener("click", () => {
      cardState.element.remove();
      state.cardsById.delete(cardState.cardId);
      syncToolbarButtons();
      const remaining = state.cardsById.size;
      setStatus(
        remaining > 0
          ? `clickESMWS_TEARSHEET open: ${remaining} report${remaining === 1 ? "" : "s"}.`
          : "All reports were closed in this tearsheet view."
      );
    });

    state.cardsById.set(cardId, cardState);
    if (els.cardsHost) {
      if (options.append === true) {
        els.cardsHost.append(cardState.element);
      } else {
        els.cardsHost.prepend(cardState.element);
      }
    }
    syncToolbarButtons();
    return cardState;
  }

  function getOrderedCardStates() {
    const ordered = [];
    if (els.cardsHost) {
      els.cardsHost.querySelectorAll(".report-card[data-card-id]").forEach((element) => {
        const cardId = String(element.getAttribute("data-card-id") || "").trim();
        if (!cardId || !state.cardsById.has(cardId)) {
          return;
        }
        ordered.push(state.cardsById.get(cardId));
      });
    }
    if (ordered.length > 0) {
      return ordered;
    }
    return [...state.cardsById.values()];
  }

  function clearWorkspaceCards(options = {}) {
    state.cardsById.forEach((cardState) => {
      cardState.element?.remove();
    });
    state.cardsById.clear();
    syncToolbarButtons();
    if (options.silent !== true) {
      setStatus("Workspace cleared.");
    }
  }

  async function runCardFromPathNode(cardState, endpointUrl) {
    const targetEndpointUrl = String(endpointUrl || "").trim();
    if (!targetEndpointUrl) {
      return;
    }
    const targetEndpointKey = getEndpointColumnsCacheKey(targetEndpointUrl);
    const currentEndpointKey = getEndpointColumnsCacheKey(String(cardState?.endpointUrl || cardState?.requestUrl || ""));
    if (targetEndpointKey && currentEndpointKey && targetEndpointKey === currentEndpointKey) {
      await rerunCard(cardState, {
        endpointUrl: targetEndpointUrl,
      });
      return;
    }

    const cachedColumns = resolveCachedEndpointColumns(targetEndpointUrl);
    const nextCard = ensureCard(
      {
        cardId: buildWorkspaceCardId("path"),
        endpointUrl: targetEndpointUrl,
        requestUrl: targetEndpointUrl,
        zoomKey: String(cardState?.zoomKey || ""),
        columns: cachedColumns.length > 0 ? cachedColumns : normalizeEsmColumns(cardState?.columns),
        rows: [],
        sortStack: getDefaultSortStack(),
        lastModified: "",
      },
      { append: false }
    );

    if (!nextCard) {
      return;
    }

    await rerunCard(nextCard, {
      endpointUrl: targetEndpointUrl,
    });
  }

  function wireCardHeaderPathLinks(cardState) {
    const titleElement = cardState?.titleElement;
    if (!titleElement) {
      return;
    }

    titleElement.querySelectorAll(".card-url-path-link[data-endpoint-url]").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void runCardFromPathNode(cardState, String(link.getAttribute("data-endpoint-url") || ""));
      });
    });
  }

  function renderCardMessage(cardState, message, options = {}) {
    const cssClass = options.error ? "card-message error" : "card-message";
    cardState.bodyElement.innerHTML = `<p class="${cssClass}">${escapeHtml(message || "")}</p>${buildCardColumnsMarkup(cardState)}`;
    wireCardRerunUrl(cardState);
  }

  function wireCardRerunUrl(cardState) {
    const rerunUrl = cardState?.bodyElement?.querySelector(".card-rerun-url");
    if (!rerunUrl) {
      return;
    }

    rerunUrl.addEventListener("click", (event) => {
      event.preventDefault();
      void rerunCard(cardState);
    });
  }

  function esmPartsToUtcMs(row) {
    const year = Number(row?.year ?? 1970);
    const month = Number(row?.month ?? 1);
    const day = Number(row?.day ?? 1);
    const hour = Number(row?.hour ?? 0);
    const minute = Number(row?.minute ?? 0);

    return (
      Date.UTC(
        Number.isFinite(year) ? year : 1970,
        Number.isFinite(month) ? month - 1 : 0,
        Number.isFinite(day) ? day : 1,
        Number.isFinite(hour) ? hour : 0,
        Number.isFinite(minute) ? minute : 0
      ) -
      ESM_SOURCE_UTC_OFFSET_MINUTES * 60 * 1000
    );
  }

  function buildEsmDateLabel(row) {
    const date = new Date(esmPartsToUtcMs(row));
    return date.toLocaleString("en-US", {
      timeZone: CLIENT_TIMEZONE,
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  }

  function getLastModifiedSourceTimezone(rawHttpDate) {
    if (rawHttpDate == null || typeof rawHttpDate !== "string") {
      return "";
    }
    const tail = rawHttpDate.trim().split(/\s+/).pop();
    if (!tail) {
      return "";
    }
    if (/^[A-Z]{2,4}$/i.test(tail)) {
      return tail.toUpperCase();
    }
    if (/^[+-]\d{4}$/.test(tail)) {
      return tail;
    }
    return "";
  }

  function formatLastModifiedForDisplay(rawHttpDate) {
    if (rawHttpDate == null || String(rawHttpDate).trim() === "") {
      return rawHttpDate;
    }
    const date = new Date(rawHttpDate);
    if (Number.isNaN(date.getTime())) {
      return rawHttpDate;
    }

    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: CLIENT_TIMEZONE,
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZoneName: "short",
    });
    const parts = formatter.formatToParts(date);
    const getPart = (type) => parts.find((part) => part.type === type)?.value ?? "";
    const tzName = getPart("timeZoneName");
    return `${getPart("month")}/${getPart("day")}/${getPart("year")} ${getPart("hour")}:${getPart("minute")}:${getPart("second")} ${tzName || CLIENT_TIMEZONE}`;
  }

  function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function safeRate(numerator, denominator) {
    const n = toNumber(numerator);
    const d = toNumber(denominator);
    if (n == null || d == null || d <= 0) {
      return null;
    }
    const rate = n / d;
    return Number.isFinite(rate) ? rate : null;
  }

  function formatPercent(rate) {
    if (rate == null) {
      return "—";
    }
    return `${(rate * 100).toFixed(2)}%`;
  }

  function createCell(value) {
    const cell = document.createElement("td");
    const text = value == null ? "" : String(value);
    cell.textContent = text;
    cell.title = text;
    return cell;
  }

  function getCellValue(row, columnKey, context) {
    if (columnKey === "DATE") {
      return esmPartsToUtcMs(row);
    }

    if (context.hasAuthN && columnKey === "AuthN Success") {
      const rate = safeRate(row["authn-successful"], row["authn-attempts"]);
      return rate == null ? -1 : rate;
    }

    if (context.hasAuthZ && columnKey === "AuthZ Success") {
      const rate = safeRate(row["authz-successful"], row["authz-attempts"]);
      return rate == null ? -1 : rate;
    }

    if (columnKey === "COUNT") {
      const value = toNumber(row.count);
      return value == null ? 0 : value;
    }

    const rawValue = row[columnKey];
    if (rawValue == null) {
      return "";
    }

    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      return rawValue;
    }

    const converted = toNumber(rawValue);
    if (converted != null) {
      return converted;
    }
    return String(rawValue).toLowerCase();
  }

  function sortRows(rows, sortStack, context) {
    const stack = Array.isArray(sortStack) && sortStack.length > 0 ? sortStack : getDefaultSortStack();
    return [...rows].sort((left, right) => {
      for (const sortRule of stack) {
        const factor = sortRule.dir === "ASC" ? 1 : -1;
        const leftValue = getCellValue(left, sortRule.col, context);
        const rightValue = getCellValue(right, sortRule.col, context);
        if (leftValue < rightValue) {
          return -1 * factor;
        }
        if (leftValue > rightValue) {
          return 1 * factor;
        }
      }
      return getCellValue(right, "DATE", context) - getCellValue(left, "DATE", context);
    });
  }

  function refreshHeaderStates(tableState) {
    if (!tableState?.thead) {
      return;
    }
    tableState.thead.querySelectorAll("th").forEach((headerCell) => {
      if (typeof headerCell._updateState === "function") {
        headerCell._updateState();
      }
    });
  }

  function renderTableBody(tableState) {
    tableState.tbody.innerHTML = "";
    tableState.data.forEach((row) => {
      const tr = document.createElement("tr");
      tr.appendChild(createCell(buildEsmDateLabel(row)));

      if (tableState.hasAuthN) {
        tr.appendChild(createCell(formatPercent(safeRate(row["authn-successful"], row["authn-attempts"]))));
      }
      if (tableState.hasAuthZ) {
        tr.appendChild(createCell(formatPercent(safeRate(row["authz-successful"], row["authz-attempts"]))));
      }
      if (!tableState.hasAuthN && !tableState.hasAuthZ && tableState.hasCount) {
        tr.appendChild(createCell(row.count));
      }

      tableState.displayColumns.forEach((column) => {
        tr.appendChild(createCell(row[column] ?? ""));
      });
      tableState.tbody.appendChild(tr);
    });
  }

  function updateTableWrapperViewport(tableState) {
    const wrapper = tableState?.wrapper;
    const table = tableState?.table;
    if (!wrapper || !table) {
      return;
    }

    const totalRows = Array.isArray(tableState.data) ? tableState.data.length : 0;
    const visibleRows = totalRows > 0 ? Math.min(WORKSPACE_TABLE_VISIBLE_ROW_CAP, totalRows) : 1;
    const sampleRow = table.querySelector("tbody tr");
    const headerRow = table.querySelector("thead tr");
    const footerRow = table.querySelector("tfoot tr");

    const rowHeight = sampleRow ? sampleRow.getBoundingClientRect().height : 36;
    const headerHeight = headerRow ? headerRow.getBoundingClientRect().height : 42;
    const footerHeight = footerRow ? footerRow.getBoundingClientRect().height : 40;
    const viewportHeight = Math.ceil(headerHeight + footerHeight + rowHeight * visibleRows + 2);

    wrapper.style.maxHeight = `${viewportHeight}px`;
  }

  function csvEscape(value) {
    const text = String(value == null ? "" : value);
    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function buildCsvRows(tableState) {
    const rows = [];
    rows.push(tableState.headers.slice());
    tableState.data.forEach((row) => {
      const line = [buildEsmDateLabel(row)];
      if (tableState.hasAuthN) {
        line.push(formatPercent(safeRate(row["authn-successful"], row["authn-attempts"])));
      }
      if (tableState.hasAuthZ) {
        line.push(formatPercent(safeRate(row["authz-successful"], row["authz-attempts"])));
      }
      if (!tableState.hasAuthN && !tableState.hasAuthZ && tableState.hasCount) {
        line.push(row.count);
      }
      tableState.displayColumns.forEach((column) => {
        line.push(row[column] ?? "");
      });
      rows.push(line);
    });
    return rows;
  }

  function downloadCsv(cardState, tableState) {
    const rows = buildCsvRows(tableState);
    const csvText = rows.map((line) => line.map(csvEscape).join(",")).join("\r\n");
    const nodeLabel = sanitizeFileSegment(getEsmNodeLabel(String(cardState?.requestUrl || cardState?.endpointUrl || "")), "workspace");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `${nodeLabel}_clickESMWS_${stamp}.csv`;

    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 1500);

    setStatus(`CSV download started: ${fileName}`);
  }

  function renderCardTable(cardState, rows, lastModified) {
    const firstRow = rows[0] || {};
    const hasAuthN = firstRow["authn-attempts"] != null && firstRow["authn-successful"] != null;
    const hasAuthZ = firstRow["authz-attempts"] != null && firstRow["authz-successful"] != null;
    const hasCount = firstRow.count != null;
    const displayColumns = Object.keys(firstRow).filter(
      (column) => !ESM_METRIC_COLUMNS.has(column) && !ESM_DATE_PARTS.includes(column) && column !== "media-company"
    );

    const headers = ["DATE"];
    if (hasAuthN) {
      headers.push("AuthN Success");
    }
    if (hasAuthZ) {
      headers.push("AuthZ Success");
    }
    if (!hasAuthN && !hasAuthZ && hasCount) {
      headers.push("COUNT");
    }
    headers.push(...displayColumns);

    cardState.bodyElement.innerHTML = `
      <div class="esm-table-wrapper">
        <table class="esm-table">
          <thead><tr></tr></thead>
          <tbody></tbody>
          <tfoot>
            <tr>
              <td class="esm-footer-cell">
                <div class="esm-footer">
                  <a href="#" class="esm-csv-link">CSV</a>
                  <span class="esm-last-modified"></span>
                  <span class="esm-close" title="Close table"> x </span>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      ${buildCardColumnsMarkup(cardState)}
    `;

    const table = cardState.bodyElement.querySelector(".esm-table");
    const tableWrapper = cardState.bodyElement.querySelector(".esm-table-wrapper");
    const thead = table.querySelector("thead");
    const tbody = table.querySelector("tbody");
    const footerCell = cardState.bodyElement.querySelector(".esm-footer-cell");
    const lastModifiedLabel = cardState.bodyElement.querySelector(".esm-last-modified");
    const csvLink = cardState.bodyElement.querySelector(".esm-csv-link");
    const closeButton = cardState.bodyElement.querySelector(".esm-close");

    const tableState = {
      wrapper: tableWrapper,
      table,
      thead,
      tbody,
      data: cloneRows(rows),
      sortStack: normalizeSortStack(cardState.sortStack),
      hasAuthN,
      hasAuthZ,
      hasCount,
      displayColumns,
      headers,
      context: {
        hasAuthN,
        hasAuthZ,
      },
    };

    const headerRow = thead.querySelector("tr");
    headers.forEach((header) => {
      const th = document.createElement("th");
      th.textContent = header;
      th.title = header === "DATE" ? `DATE (${CLIENT_TIMEZONE}, converted from PST)` : header;
      const icon = document.createElement("span");
      icon.className = "sort-icon";
      icon.style.marginLeft = "6px";
      th.appendChild(icon);

      th._updateState = () => {
        const isActive = tableState.sortStack[0]?.col === header;
        th.classList.toggle("active-sort", isActive);
        icon.textContent = isActive ? (tableState.sortStack[0].dir === "ASC" ? "▲" : "▼") : "";
      };

      th.addEventListener("click", (event) => {
        const existingRule = tableState.sortStack.find((rule) => rule.col === header);
        if (event.shiftKey && existingRule) {
          existingRule.dir = existingRule.dir === "DESC" ? "ASC" : "DESC";
        } else if (event.shiftKey) {
          tableState.sortStack.push({ col: header, dir: "DESC" });
        } else {
          tableState.sortStack = [
            {
              col: header,
              dir: existingRule ? (existingRule.dir === "DESC" ? "ASC" : "DESC") : "DESC",
            },
          ];
        }
        tableState.data = sortRows(tableState.data, tableState.sortStack, tableState.context);
        renderTableBody(tableState);
        updateTableWrapperViewport(tableState);
        refreshHeaderStates(tableState);
        cardState.sortStack = normalizeSortStack(tableState.sortStack);
      });
      headerRow.appendChild(th);
    });

    if (footerCell) {
      footerCell.colSpan = Math.max(1, headers.length);
    }

    if (lastModifiedLabel) {
      if (lastModified) {
        const sourceTz = getLastModifiedSourceTimezone(lastModified);
        lastModifiedLabel.textContent = `Last-Modified: ${formatLastModifiedForDisplay(lastModified)}`;
        lastModifiedLabel.title = sourceTz
          ? `Server time: ${sourceTz} (converted to your timezone)`
          : "Converted to your timezone";
      } else {
        lastModifiedLabel.textContent = "Last-Modified: (real-time)";
      }
    }

    if (csvLink) {
      csvLink.addEventListener("click", (event) => {
        event.preventDefault();
        downloadCsv(cardState, tableState);
      });
    }

    if (closeButton) {
      closeButton.addEventListener("click", (event) => {
        event.preventDefault();
        cardState.rows = [];
        cardState.lastModified = "";
        cardState.sortStack = getDefaultSortStack();
        updateCardHeader(cardState);
        renderCardMessage(cardState, "Table closed.");
      });
    }

    wireCardRerunUrl(cardState);
    tableState.data = sortRows(tableState.data, tableState.sortStack, tableState.context);
    renderTableBody(tableState);
    updateTableWrapperViewport(tableState);
    refreshHeaderStates(tableState);
    cardState.sortStack = normalizeSortStack(tableState.sortStack);
  }

  async function rerunCard(cardState, options = {}) {
    if (!cardState) {
      return;
    }

    const endpointOverride = String(options.endpointUrl || "").trim();
    if (endpointOverride) {
      cardState.endpointUrl = endpointOverride;
    }

    const suppressStatus = options.suppressStatus === true;
    cardState.running = true;
    syncToolbarButtons();

    if (!suppressStatus) {
      const nodeLabel = getEsmNodeLabel(String(cardState.endpointUrl || cardState.requestUrl || ""));
      setStatus(`Running ${nodeLabel}...`);
    }

    updateCardHeader(cardState);
    renderCardMessage(cardState, "Loading report...");

    try {
      const requestUrl = buildLiveRequestUrl(cardState, endpointOverride);
      cardState.requestUrl = requestUrl;
      updateCardHeader(cardState);

      const response = await fetchWithAuth(requestUrl);
      if (!response.ok) {
        const bodyText = await response.text().catch(() => "");
        const compact = String(bodyText || "").trim();
        throw new Error(`HTTP ${response.status}${compact ? ` ${compact}` : ""}`);
      }

      const bodyText = await response.text().catch(() => "");
      let parsed = null;
      if (bodyText) {
        try {
          parsed = JSON.parse(bodyText);
        } catch {
          parsed = null;
        }
      }

      if (!parsed && bodyText.trim()) {
        throw new Error(bodyText.trim());
      }

      const rows = Array.isArray(parsed?.report) ? parsed.report : [];
      cardState.rows = cloneRows(rows);
      cardState.lastModified = String(response.headers.get("Last-Modified") || response.headers.get("Date") || "");
      cardState.sortStack = getDefaultSortStack();

      if (rows.length > 0) {
        cardState.columns = deriveColumnsFromRows(rows, cardState.columns);
        cacheEndpointColumns(cardState.endpointUrl || cardState.requestUrl, cardState.columns);
        updateCardHeader(cardState);
        renderCardTable(cardState, cardState.rows, cardState.lastModified);
      } else {
        updateCardHeader(cardState);
        renderCardMessage(cardState, "No data");
      }

      if (!suppressStatus) {
        setStatus(rows.length > 0 ? `Loaded ${rows.length} row(s).` : "No data.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateCardHeader(cardState);
      renderCardMessage(cardState, message || "Request failed.", { error: true });
      if (!suppressStatus) {
        setStatus(message || "Request failed.", "error");
      }
    } finally {
      cardState.running = false;
      syncToolbarButtons();
    }
  }

  async function rerunAllCards() {
    const cards = getOrderedCardStates();
    if (cards.length === 0) {
      setStatus("No reports are open.");
      return;
    }

    state.batchRunning = true;
    syncToolbarButtons();
    setStatus(`Re-running ${cards.length} report(s)...`);

    for (const cardState of cards) {
      await rerunCard(cardState, { suppressStatus: true });
    }

    state.batchRunning = false;
    syncToolbarButtons();
    setStatus(`Re-run completed for ${cards.length} report(s).`);
  }

  function hydrateCardsFromPayload() {
    if (!els.cardsHost) {
      return;
    }

    const cards = Array.isArray(payload.cards) ? payload.cards : [];
    if (cards.length === 0) {
      setStatus("No workspace reports were captured for this tearsheet.");
      return;
    }

    cards.forEach((cardMeta) => {
      const cardState = ensureCard(
        {
          cardId: String(cardMeta?.cardId || buildWorkspaceCardId("import")),
          endpointUrl: String(cardMeta?.endpointUrl || ""),
          requestUrl: String(cardMeta?.requestUrl || cardMeta?.endpointUrl || ""),
          zoomKey: String(cardMeta?.zoomKey || "").trim().toUpperCase(),
          columns: normalizeEsmColumns(cardMeta?.columns),
          rows: cloneRows(cardMeta?.rows),
          sortStack: normalizeSortStack(cardMeta?.sortStack),
          lastModified: String(cardMeta?.lastModified || ""),
        },
        { append: true }
      );

      if (!cardState) {
        return;
      }
      cacheEndpointColumns(cardState.endpointUrl || cardState.requestUrl, cardState.columns);

      if (cardState.rows.length > 0) {
        renderCardTable(cardState, cardState.rows, cardState.lastModified);
      } else {
        renderCardMessage(cardState, "No data");
      }
    });

    setStatus(`clickESMWS_TEARSHEET ready: ${cards.length} report${cards.length === 1 ? "" : "s"}.`);
  }

  function buildWorkspaceExportSnapshot() {
    const cards = getOrderedCardStates().map((cardState) => ({
      cardId: String(cardState.cardId || ""),
      endpointUrl: String(cardState.endpointUrl || ""),
      requestUrl: String(cardState.requestUrl || cardState.endpointUrl || ""),
      zoomKey: String(cardState.zoomKey || ""),
      columns: normalizeEsmColumns(cardState.columns),
      rows: cloneRows(cardState.rows),
      sortStack: normalizeSortStack(cardState.sortStack),
      lastModified: String(cardState.lastModified || ""),
    }));

    const generatedAt = new Date();
    return {
      title: String(payload?.title || "clickESM Workspace"),
      controllerStateText: String(els.controllerState?.textContent || payload?.controllerStateText || "Selected Media Company"),
      filterStateText: String(els.filterState?.textContent || payload?.filterStateText || ""),
      exportMetaText: "",
      programmerId: String(payload?.programmerId || ""),
      programmerName: String(payload?.programmerName || ""),
      requestorIds: state.requestorIds.slice(0, 24),
      mvpdIds: state.mvpdIds.slice(0, 24),
      generatedAt: generatedAt.toISOString(),
      clientTimeZone: CLIENT_TIMEZONE,
      cards,
    };
  }

  function buildWorkspaceExportFileName(snapshot) {
    const mediaCompany = truncateFileSegment(
      sanitizeFileSegment(firstNonEmptyString([snapshot?.programmerName, snapshot?.programmerId, "MediaCompany"]), "MediaCompany"),
      48
    );
    const tableCount = Math.max(0, Number(Array.isArray(snapshot?.cards) ? snapshot.cards.length : 0));
    const tableCountHint = `t${tableCount}`;
    const globalContextHint = buildWorkspaceExportGlobalContext(snapshot);
    const stamp = buildFileStamp();
    return `${mediaCompany}_clickESMWS_${tableCountHint}_${globalContextHint}_${stamp}.html`;
  }

  function downloadHtmlFile(htmlText, fileName) {
    const blob = new Blob([String(htmlText || "")], { type: "text/html;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = String(fileName || "clickESMWS.html");
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 1500);
  }

  async function exportWorkspaceTearsheet() {
    if (state.exporting) {
      return;
    }

    if (state.cardsById.size === 0) {
      setStatus("Open at least one report before exporting clickESMWS_TEARSHEET.", "error");
      return;
    }

    state.exporting = true;
    syncToolbarButtons();

    try {
      const snapshot = buildWorkspaceExportSnapshot();
      const clone = document.documentElement.cloneNode(true);
      const clonePayloadNode = clone.querySelector("#clickesmws-payload");
      if (clonePayloadNode) {
        clonePayloadNode.textContent = JSON.stringify(snapshot).replace(/</g, "\\u003c");
      }
      const cloneCardsHost = clone.querySelector("#workspace-cards");
      if (cloneCardsHost) {
        cloneCardsHost.innerHTML = "";
      }
      clone.querySelectorAll(".workspace-title-spacer, .workspace-action-spacer").forEach((node) => node.remove());
      const cloneReferenceButton = clone.querySelector("#workspace-make-clickesm");
      if (cloneReferenceButton) {
        cloneReferenceButton.remove();
      }
      const cloneMakeWorkspaceButton = clone.querySelector("#workspace-make-clickesmws");
      if (cloneMakeWorkspaceButton) {
        cloneMakeWorkspaceButton.remove();
      }
      const cloneClearButton = clone.querySelector("#workspace-clear-all");
      if (cloneClearButton) {
        cloneClearButton.remove();
      }

      const htmlText = `<!doctype html>\n${clone.outerHTML}`;
      const fileName = buildWorkspaceExportFileName(snapshot);
      downloadHtmlFile(htmlText, fileName);
      setStatus(`Downloaded ${fileName}.`);
    } catch (error) {
      setStatus(
        `Unable to export clickESMWS_TEARSHEET: ${error instanceof Error ? error.message : String(error)}`,
        "error"
      );
    } finally {
      state.exporting = false;
      syncToolbarButtons();
    }
  }
})();
