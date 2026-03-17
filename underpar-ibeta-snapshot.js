(function attachUnderParIBetaSnapshot(globalScope) {
  const ESM_SOURCE_UTC_OFFSET_MINUTES = -8 * 60;
  const CLIENT_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
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
  const ESM_SUPPRESSED_COLUMNS = new Set(["media-company"]);
  const ESM_NODE_BASE_PATH = "esm/v3/media-company/";

  function normalizeDimensionName(columnName = "") {
    return String(columnName || "").trim().toLowerCase();
  }

  function normalizeText(value = "") {
    return String(value == null ? "" : value).trim();
  }

  function safeDecodeUrlSegment(segment = "") {
    const raw = String(segment || "");
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }

  function stripEsmBaseFromPath(pathValue = "") {
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

  function parseRawQueryPairs(urlValue = "") {
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
            hasAssignment: false,
          };
        }
        const key = safeDecodeUrlSegment(entry.slice(0, equalsIndex).replace(/\+/g, " "));
        const value = entry.slice(equalsIndex + 1);
        return {
          key,
          value,
          hasValue: String(value || "").trim().length > 0,
          hasAssignment: true,
        };
      });
  }

  function decodeQueryPairValue(value = "") {
    return safeDecodeUrlSegment(String(value || "").replace(/\+/g, " ")).trim();
  }

  function normalizeDisplayDimensionFromQueryKey(columnName = "") {
    const normalized = normalizeDimensionName(columnName);
    return normalized.endsWith("!") ? normalized.slice(0, -1) : normalized;
  }

  function isSuppressedEsmColumn(columnName = "") {
    const normalized = normalizeDimensionName(columnName);
    return Boolean(normalized) && ESM_SUPPRESSED_COLUMNS.has(normalized);
  }

  function isDateTimeDimension(columnName = "") {
    const normalized = normalizeDimensionName(columnName);
    return Boolean(normalized) && ESM_DATE_PARTS.includes(normalized);
  }

  function isRenderableDimension(columnName = "") {
    const normalized = normalizeDimensionName(columnName);
    return (
      Boolean(normalized) &&
      !isSuppressedEsmColumn(normalized) &&
      !isDateTimeDimension(normalized) &&
      !ESM_DEPRECATED_COLUMN_KEYS.has(normalized)
    );
  }

  function normalizeEsmColumns(columns = []) {
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
      const lower = normalized.toLowerCase();
      if (ESM_DEPRECATED_COLUMN_KEYS.has(lower) || lower === "media-company" || seen.has(lower)) {
        return;
      }
      seen.add(lower);
      output.push(normalized);
    });
    return output;
  }

  function collectEsmRowColumns(rows = [], options = {}) {
    const includeMetrics = options?.includeMetrics === true;
    const output = [];
    const seen = new Set();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        return;
      }
      Object.keys(row).forEach((columnName) => {
        const normalized = normalizeDimensionName(columnName);
        if (!normalized || seen.has(normalized) || !isRenderableDimension(normalized)) {
          return;
        }
        if (!includeMetrics && ESM_METRIC_COLUMNS.has(normalized)) {
          return;
        }
        seen.add(normalized);
        output.push(normalized);
      });
    });
    return output;
  }

  function getSupportedDimensionsFromHref(hrefValue = "") {
    const rawHref = String(hrefValue || "").trim();
    if (!rawHref) {
      return [];
    }
    let path = "";
    try {
      const parsed = new URL(rawHref, "https://mgmt.auth.adobe.com/");
      path = String(parsed.pathname || "");
    } catch {
      path = rawHref.split("?", 1)[0] || "";
    }
    const segments = path
      .split("/")
      .map((segment) => decodeURIComponent(String(segment || "").trim().toLowerCase()))
      .filter(Boolean);
    if (segments.length === 0) {
      return [];
    }
    const v3Index = segments.findIndex((segment, index) => segment === "v3" && segments[index - 1] === "esm");
    const startIndex = v3Index >= 0 ? v3Index + 1 : 0;
    let dimensionSegments = segments.slice(startIndex);
    if (dimensionSegments[0] === "media-company" || dimensionSegments[0] === "mvpd") {
      dimensionSegments = dimensionSegments.slice(1);
    }
    const output = [];
    const seen = new Set();
    dimensionSegments.forEach((segment) => {
      const normalized = normalizeDimensionName(segment);
      if (!normalized || !isRenderableDimension(normalized) || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      output.push(normalized);
    });
    parseRawQueryPairs(rawHref).forEach((pair) => {
      const normalized = normalizeDisplayDimensionFromQueryKey(pair?.key);
      if (
        !normalized ||
        normalized === "metrics" ||
        normalized === "start" ||
        normalized === "end" ||
        !isRenderableDimension(normalized) ||
        seen.has(normalized)
      ) {
        return;
      }
      seen.add(normalized);
      output.push(normalized);
    });
    return output;
  }

  function getRequestedMetricColumnsFromHref(hrefValue = "") {
    const rawHref = String(hrefValue || "").trim();
    if (!rawHref) {
      return [];
    }
    const output = [];
    const seen = new Set();
    parseRawQueryPairs(rawHref).forEach((pair) => {
      const normalizedKey = normalizeDisplayDimensionFromQueryKey(pair?.key);
      if (normalizedKey !== "metrics" || pair?.hasValue !== true) {
        return;
      }
      decodeQueryPairValue(pair?.value)
        .split(",")
        .map((value) => normalizeDimensionName(value))
        .filter(Boolean)
        .forEach((metricName) => {
          if (metricName === "metrics" || seen.has(metricName)) {
            return;
          }
          seen.add(metricName);
          output.push(metricName);
        });
    });
    return output;
  }

  function buildDisplayDimensions(columns = [], hrefValue = "") {
    const output = [];
    const seen = new Set();
    const appendColumn = (columnName) => {
      const normalized = normalizeDimensionName(columnName);
      if (!normalized || !isRenderableDimension(normalized) || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      output.push(normalized);
    };
    getSupportedDimensionsFromHref(hrefValue).forEach(appendColumn);
    normalizeEsmColumns(columns).forEach(appendColumn);
    return output;
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

  function esmPartsToUtcMs(row = {}) {
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

  function buildEsmDateLabel(row = {}) {
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

  function getCellValue(row = {}, columnKey = "", context = {}) {
    if (columnKey === "DATE") {
      return esmPartsToUtcMs(row);
    }
    if (context.hasAuthN && columnKey === "AuthN Success") {
      const rate = safeRate(row["authn-successful"], row["authn-attempts"]);
      return rate == null ? -1 : rate;
    }
    if (context.hasAuthNFail && columnKey === "AuthN Fail") {
      const rate = safeRate(row["authn-failed"], row["authn-attempts"]);
      return rate == null ? -1 : rate;
    }
    if (context.hasAuthZ && columnKey === "AuthZ Success") {
      const rate = safeRate(row["authz-successful"], row["authz-attempts"]);
      return rate == null ? -1 : rate;
    }
    if (context.hasAuthZFail && columnKey === "AuthZ Fail") {
      const rate = safeRate(row["authz-failed"], row["authz-attempts"]);
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

  function sortRows(rows = [], sortStack = [], context = {}) {
    const activeRule = Array.isArray(sortStack) && sortStack.length > 0 ? sortStack[0] : { col: "DATE", dir: "DESC" };
    return [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
      const factor = activeRule.dir === "ASC" ? 1 : -1;
      const leftValue = getCellValue(left, activeRule.col, context);
      const rightValue = getCellValue(right, activeRule.col, context);
      if (leftValue < rightValue) {
        return -1 * factor;
      }
      if (leftValue > rightValue) {
        return 1 * factor;
      }
      return getCellValue(right, "DATE", context) - getCellValue(left, "DATE", context);
    });
  }

  function normalizeRows(rows = []) {
    return (Array.isArray(rows) ? rows : []).map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        return {};
      }
      return { ...row };
    });
  }

  function buildHeaderContext(requestUrl = "") {
    const context = {
      pathSegments: [],
      queryPairs: [],
    };
    const rawUrl = String(requestUrl || "").trim();
    if (!rawUrl) {
      return context;
    }
    let displayPath = "";
    try {
      const parsed = new URL(rawUrl);
      displayPath = stripEsmBaseFromPath(parsed.pathname);
    } catch {
      const withoutQuery = rawUrl.split(/[?#]/, 1)[0] || rawUrl;
      displayPath = stripEsmBaseFromPath(withoutQuery);
    }
    context.pathSegments = displayPath
      .split("/")
      .map((segment) => safeDecodeUrlSegment(segment.trim()))
      .filter(Boolean);
    context.queryPairs = parseRawQueryPairs(rawUrl)
      .map((pair) => {
        const normalizedKey = normalizeDisplayDimensionFromQueryKey(pair?.key);
        if (!normalizedKey || normalizedKey === "metrics") {
          return null;
        }
        return {
          key: normalizedKey,
          operator: normalizeDimensionName(pair?.key).endsWith("!") ? "!=" : pair?.hasAssignment === true ? "=" : "",
          value: pair?.hasAssignment === true ? decodeQueryPairValue(pair?.value) : "",
        };
      })
      .filter(Boolean);
    return context;
  }

  function buildEsmTableSnapshot(rawRows = [], rawColumns = [], requestUrl = "") {
    const rows = normalizeRows(rawRows);
    const firstRow = rows[0] || {};
    const hasAuthN = firstRow["authn-attempts"] != null && firstRow["authn-successful"] != null;
    const hasAuthNFail = firstRow["authn-attempts"] != null && firstRow["authn-failed"] != null;
    const hasAuthZ = firstRow["authz-attempts"] != null && firstRow["authz-successful"] != null;
    const hasAuthZFail = firstRow["authz-attempts"] != null && firstRow["authz-failed"] != null;
    const hasCount = firstRow.count != null;
    const requestedMetricColumns = getRequestedMetricColumnsFromHref(requestUrl);
    const requestedMetricSet = new Set(requestedMetricColumns);
    const displayColumns = buildDisplayDimensions(
      [...normalizeEsmColumns(rawColumns), ...collectEsmRowColumns(rows)],
      requestUrl
    ).filter((column) => !ESM_METRIC_COLUMNS.has(column) && !requestedMetricSet.has(column));
    const metricColumns =
      requestedMetricColumns.length > 0
        ? [
            ...new Set([
              ...requestedMetricColumns,
              ...collectEsmRowColumns(rows, { includeMetrics: true }).filter((columnName) => requestedMetricSet.has(columnName)),
            ]),
          ]
        : [];
    const showLegacyMetricColumns = metricColumns.length === 0;
    const headers = ["DATE"];
    if (showLegacyMetricColumns && hasAuthN) {
      headers.push("AuthN Success");
    }
    if (showLegacyMetricColumns && hasAuthNFail) {
      headers.push("AuthN Fail");
    }
    if (showLegacyMetricColumns && hasAuthZ) {
      headers.push("AuthZ Success");
    }
    if (showLegacyMetricColumns && hasAuthZFail) {
      headers.push("AuthZ Fail");
    }
    if (showLegacyMetricColumns && !hasAuthN && !hasAuthNFail && !hasAuthZ && !hasAuthZFail && hasCount) {
      headers.push("COUNT");
    }
    headers.push(...displayColumns, ...metricColumns);

    const context = {
      hasAuthN,
      hasAuthNFail,
      hasAuthZ,
      hasAuthZFail,
    };
    const sortedRows = sortRows(rows, [{ col: "DATE", dir: "DESC" }], context);
    const normalizedRows = sortedRows.map((row) => {
      const values = [buildEsmDateLabel(row)];
      if (showLegacyMetricColumns && hasAuthN) {
        values.push(formatPercent(safeRate(row["authn-successful"], row["authn-attempts"])));
      }
      if (showLegacyMetricColumns && hasAuthNFail) {
        values.push(formatPercent(safeRate(row["authn-failed"], row["authn-attempts"])));
      }
      if (showLegacyMetricColumns && hasAuthZ) {
        values.push(formatPercent(safeRate(row["authz-successful"], row["authz-attempts"])));
      }
      if (showLegacyMetricColumns && hasAuthZFail) {
        values.push(formatPercent(safeRate(row["authz-failed"], row["authz-attempts"])));
      }
      if (showLegacyMetricColumns && !hasAuthN && !hasAuthNFail && !hasAuthZ && !hasAuthZFail && hasCount) {
        values.push(row.count == null ? "" : String(row.count));
      }
      displayColumns.forEach((column) => {
        values.push(row[column] == null ? "" : String(row[column]));
      });
      metricColumns.forEach((column) => {
        values.push(row[column] == null ? "" : String(row[column]));
      });
      return values;
    });
    return {
      headers,
      rows: normalizedRows,
      rowCount: normalizedRows.length,
    };
  }

  function buildEsmSnapshot(input = null) {
    const source = input && typeof input === "object" ? input : null;
    if (!source) {
      return null;
    }
    const requestUrl = normalizeText(source.requestUrl || source.endpointUrl);
    const rawRows = normalizeRows(source.rawRows || source.rows);
    const rawColumns = normalizeEsmColumns(source.rawColumns || source.columns);
    if (!requestUrl || rawRows.length === 0) {
      return null;
    }
    const table = buildEsmTableSnapshot(rawRows, rawColumns, requestUrl);
    return {
      renderer: "underpar-esm-teaser-v1",
      workspaceKey: "esm",
      workspaceLabel: normalizeText(source.workspaceLabel || "ESM") || "ESM",
      datasetLabel: normalizeText(source.datasetLabel || source.displayNodeLabel || "ESM Report Card") || "ESM Report Card",
      displayNodeLabel: normalizeText(source.displayNodeLabel || source.datasetLabel),
      requestUrl,
      requestPath: normalizeText(source.requestPath || requestUrl),
      programmerId: normalizeText(source.programmerId),
      programmerName: normalizeText(source.programmerName),
      adobePassEnvironmentKey: normalizeText(source.adobePassEnvironmentKey),
      adobePassEnvironmentLabel: normalizeText(source.adobePassEnvironmentLabel),
      lastModified: normalizeText(source.lastModified),
      createdAt: Math.max(0, Number(source.createdAt || Date.now() || 0)) || Date.now(),
      headerContext: buildHeaderContext(requestUrl),
      table,
    };
  }

  globalScope.UnderParIBetaSnapshot = {
    buildEsmSnapshot,
  };
})(globalThis);
