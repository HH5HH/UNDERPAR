const SAVED_QUERY_STORAGE_PREFIX = "underpar:saved-esm-query:";
const SAVED_QUERY_BRIDGE_MESSAGE_TYPE = "underpar:meg-saved-query-bridge";
const SAVED_QUERY_BRIDGE_RESPONSE_TYPE = `${SAVED_QUERY_BRIDGE_MESSAGE_TYPE}:response`;
const UNDERPAR_VAULT_STORAGE_KEY = "underpar_vault_v1";

function normalizeSavedQueryName(value = "") {
  return String(value || "").replace(/\|+/g, " ").replace(/\s+/g, " ").trim();
}

function buildSavedQueryStorageKey(name = "") {
  return `${SAVED_QUERY_STORAGE_PREFIX}${encodeURIComponent(String(name || "").trim())}`;
}

function stripSavedQueryScopedQueryParams(rawUrl = "") {
  const normalized = String(rawUrl || "").trim();
  if (!normalized) {
    return "";
  }
  const withoutHash = normalized.split("#")[0] || "";
  const queryIndex = withoutHash.indexOf("?");
  if (queryIndex < 0) {
    return withoutHash;
  }
  const path = withoutHash.slice(0, queryIndex);
  const query = withoutHash.slice(queryIndex + 1);
  const nextQuery = query
    .split("&")
    .filter((segment) => {
      if (!segment) {
        return false;
      }
      const keySegment = segment.includes("=") ? segment.slice(0, segment.indexOf("=")) : segment;
      try {
        return decodeURIComponent(keySegment.replace(/\+/g, "%20")).trim().toLowerCase() !== "media-company";
      } catch (_error) {
        return keySegment.trim().toLowerCase() !== "media-company";
      }
    })
    .join("&");
  return nextQuery ? `${path}?${nextQuery}` : path;
}

function buildSavedQueryRecord(name = "", rawUrl = "") {
  const normalizedName = normalizeSavedQueryName(name);
  const normalizedUrl = stripSavedQueryScopedQueryParams(String(rawUrl || "").trim());
  if (!normalizedName || !normalizedUrl) {
    return null;
  }
  return {
    name: normalizedName,
    url: normalizedUrl,
  };
}

function buildSavedQueryPayload(name = "", esmUrl = "") {
  const record = buildSavedQueryRecord(name, esmUrl);
  if (!record) {
    return "";
  }
  return record.url;
}

function parseSavedQueryRecord(storageKey = "", payload = "") {
  const normalizedStorageKey = String(storageKey || "").trim();
  if (!normalizedStorageKey.startsWith(SAVED_QUERY_STORAGE_PREFIX)) {
    return null;
  }
  const storedName = decodeURIComponent(normalizedStorageKey.slice(SAVED_QUERY_STORAGE_PREFIX.length) || "");
  const normalizedPayload = String(payload || "").trim();
  try {
    const parsed = JSON.parse(normalizedPayload);
    if (parsed && typeof parsed === "object") {
      const record = buildSavedQueryRecord(parsed.name || storedName, parsed.url || parsed.esmUrl || "");
      if (record) {
        return {
          storageKey: normalizedStorageKey,
          ...record,
        };
      }
    }
  } catch (_error) {
    // Fall through to legacy string parsing.
  }
  const separatorIndex = normalizedPayload.indexOf("|");
  if (separatorIndex <= 0) {
    const record = buildSavedQueryRecord(storedName, normalizedPayload);
    if (record) {
      return {
        storageKey: normalizedStorageKey,
        ...record,
      };
    }
    return null;
  }
  const record = buildSavedQueryRecord(
    normalizedPayload.slice(0, separatorIndex),
    String(normalizedPayload.slice(separatorIndex + 1) || "").trim()
  );
  if (!record) {
    return null;
  }
  return {
    storageKey: normalizedStorageKey,
    ...record,
  };
}

function readLegacyLocalSavedQueries() {
  const records = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const storageKey = String(localStorage.key(index) || "").trim();
      if (!storageKey.startsWith(SAVED_QUERY_STORAGE_PREFIX)) {
        continue;
      }
      const payload = localStorage.getItem(storageKey);
      const record = parseSavedQueryRecord(storageKey, payload);
      if (!record) {
        continue;
      }
      const normalizedPayload = buildSavedQueryPayload(record.name, record.url);
      if (payload !== normalizedPayload) {
        localStorage.setItem(storageKey, normalizedPayload);
      }
      records.push(record);
    }
  } catch (_error) {
    return [];
  }
  return records.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}

function normalizeVaultSavedQueries(input = null) {
  const normalizedEntries = {};
  const appendEntry = (name = "", rawUrl = "") => {
    const record = buildSavedQueryRecord(name, rawUrl);
    if (record) {
      normalizedEntries[record.name] = record.url;
    }
  };

  if (Array.isArray(input)) {
    input.forEach((entry) => {
      if (!entry || typeof entry !== "object") {
        return;
      }
      appendEntry(entry?.name || "", entry?.url || entry?.esmUrl || "");
    });
    return normalizedEntries;
  }

  if (!input || typeof input !== "object") {
    return normalizedEntries;
  }

  Object.entries(input).forEach(([name, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      appendEntry(value?.name || name, value?.url || value?.esmUrl || value?.value || "");
      return;
    }
    appendEntry(name, value);
  });
  return normalizedEntries;
}

function ensureVaultGlobalContainers(vaultPayload = null) {
  const target = vaultPayload && typeof vaultPayload === "object" ? vaultPayload : {};
  if (!target.underpar || typeof target.underpar !== "object" || Array.isArray(target.underpar)) {
    target.underpar = {};
  }
  if (!target.underpar.globals || typeof target.underpar.globals !== "object" || Array.isArray(target.underpar.globals)) {
    target.underpar.globals = {};
  }
  if (!target.underpar.app || typeof target.underpar.app !== "object" || Array.isArray(target.underpar.app)) {
    target.underpar.app = {};
  }
  if (
    !target.underpar.globals.savedQueries ||
    typeof target.underpar.globals.savedQueries !== "object" ||
    Array.isArray(target.underpar.globals.savedQueries)
  ) {
    target.underpar.globals.savedQueries = {};
  }
  if (
    !target.underpar.app.savedQueries ||
    typeof target.underpar.app.savedQueries !== "object" ||
    Array.isArray(target.underpar.app.savedQueries)
  ) {
    target.underpar.app.savedQueries = {};
  }
  return target;
}

function getVaultSavedQueriesInput(vaultPayload = null) {
  if (!vaultPayload || typeof vaultPayload !== "object") {
    return null;
  }
  if (
    vaultPayload?.underpar?.globals?.savedQueries &&
    typeof vaultPayload.underpar.globals.savedQueries === "object" &&
    !Array.isArray(vaultPayload.underpar.globals.savedQueries)
  ) {
    return vaultPayload.underpar.globals.savedQueries;
  }
  if (
    vaultPayload?.underpar?.app?.savedQueries &&
    typeof vaultPayload.underpar.app.savedQueries === "object" &&
    !Array.isArray(vaultPayload.underpar.app.savedQueries)
  ) {
    return vaultPayload.underpar.app.savedQueries;
  }
  if (
    vaultPayload?.underpar?.savedQueries &&
    typeof vaultPayload.underpar.savedQueries === "object" &&
    !Array.isArray(vaultPayload.underpar.savedQueries)
  ) {
    return vaultPayload.underpar.savedQueries;
  }
  return null;
}

function setVaultSavedQueries(vaultPayload = null, savedQueries = null) {
  const target = ensureVaultGlobalContainers(vaultPayload);
  const normalizedSavedQueries = normalizeVaultSavedQueries(savedQueries);
  target.underpar.globals.savedQueries = JSON.parse(JSON.stringify(normalizedSavedQueries));
  target.underpar.app.savedQueries = JSON.parse(JSON.stringify(normalizedSavedQueries));
  return normalizedSavedQueries;
}

function normalizeVaultPayload(payload = null) {
  const normalized = {
    schemaVersion: 1,
    updatedAt: Date.now(),
    underpar: {
      globals: {
        savedQueries: {},
      },
      app: {
        savedQueries: {},
      },
    },
    pass: {
      schemaVersion: 1,
      environments: {},
    },
  };

  if (!payload || typeof payload !== "object") {
    return normalized;
  }

  normalized.schemaVersion = Number(payload?.schemaVersion || 1) || 1;
  normalized.updatedAt = Number(payload?.updatedAt || Date.now()) || Date.now();
  setVaultSavedQueries(normalized, getVaultSavedQueriesInput(payload));
  normalized.pass =
    payload?.pass && typeof payload.pass === "object" && !Array.isArray(payload.pass)
      ? payload.pass
      : normalized.pass;
  return normalized;
}

async function readVaultPayload() {
  if (!chrome?.storage?.local?.get) {
    return normalizeVaultPayload(null);
  }
  const payload = await chrome.storage.local.get(UNDERPAR_VAULT_STORAGE_KEY).catch(() => ({}));
  return normalizeVaultPayload(payload?.[UNDERPAR_VAULT_STORAGE_KEY] || null);
}

async function writeVaultPayload(vaultPayload = null) {
  if (!chrome?.storage?.local?.set) {
    throw new Error("Chrome local storage is unavailable.");
  }
  const normalizedVault = normalizeVaultPayload(vaultPayload);
  normalizedVault.updatedAt = Date.now();
  await chrome.storage.local.set({
    [UNDERPAR_VAULT_STORAGE_KEY]: normalizedVault,
  });
  return normalizedVault;
}

async function getSavedQueryRecords() {
  const vault = await readVaultPayload();
  const mergedEntries = {
    ...Object.fromEntries(readLegacyLocalSavedQueries().map((record) => [record.name, record.url])),
    ...normalizeVaultSavedQueries(getVaultSavedQueriesInput(vault)),
  };

  return Object.entries(mergedEntries)
    .map(([name, rawUrl]) => {
      const record = buildSavedQueryRecord(name, rawUrl);
      if (!record) {
        return null;
      }
      return {
        storageKey: buildSavedQueryStorageKey(record.name),
        ...record,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}

async function persistSavedQueryRecord(name = "", rawUrl = "") {
  const record = buildSavedQueryRecord(name, rawUrl);
  if (!record) {
    throw new Error("Saved Query name and URL are required.");
  }
  const storageKey = buildSavedQueryStorageKey(record.name);
  const vault = await readVaultPayload();
  const nextSavedQueries = {
    ...Object.fromEntries(readLegacyLocalSavedQueries().map((entry) => [entry.name, entry.url])),
    ...normalizeVaultSavedQueries(getVaultSavedQueriesInput(vault)),
  };
  const existed = Object.prototype.hasOwnProperty.call(nextSavedQueries, record.name);
  nextSavedQueries[record.name] = record.url;
  setVaultSavedQueries(vault, nextSavedQueries);
  await writeVaultPayload(vault);
  return {
    storageKey,
    existed,
  };
}

async function deleteSavedQueryRecord(storageKey = "") {
  const normalizedStorageKey = String(storageKey || "").trim();
  if (!normalizedStorageKey.startsWith(SAVED_QUERY_STORAGE_PREFIX)) {
    throw new Error("Saved Query storage key is required.");
  }
  const name = decodeURIComponent(normalizedStorageKey.slice(SAVED_QUERY_STORAGE_PREFIX.length) || "");
  const normalizedName = normalizeSavedQueryName(name);
  if (!normalizedName) {
    throw new Error("Saved Query storage key is required.");
  }
  const vault = await readVaultPayload();
  const nextSavedQueries = {
    ...Object.fromEntries(readLegacyLocalSavedQueries().map((entry) => [entry.name, entry.url])),
    ...normalizeVaultSavedQueries(getVaultSavedQueriesInput(vault)),
  };
  delete nextSavedQueries[normalizedName];
  setVaultSavedQueries(vault, nextSavedQueries);
  await writeVaultPayload(vault);
  return {
    storageKey: normalizedStorageKey,
  };
}

window.addEventListener("message", (event) => {
  const payload = event?.data;
  if (!payload || payload.type !== SAVED_QUERY_BRIDGE_MESSAGE_TYPE) {
    return;
  }
  const requestId = String(payload.requestId || "").trim();
  const action = String(payload.action || "").trim().toLowerCase();
  const respond = (ok, result = null, error = "") => {
    event.source?.postMessage(
      {
        type: SAVED_QUERY_BRIDGE_RESPONSE_TYPE,
        requestId,
        ok,
        result,
        error: String(error || ""),
      },
      "*"
    );
  };

  void (async () => {
    try {
      if (action === "get-records") {
        respond(true, { records: await getSavedQueryRecords() });
        return;
      }

      if (action === "put-record") {
        const result = await persistSavedQueryRecord(payload?.payload?.name || "", payload?.payload?.url || "");
        respond(true, result);
        return;
      }

      if (action === "delete-record") {
        const result = await deleteSavedQueryRecord(payload?.payload?.storageKey || "");
        respond(true, result);
        return;
      }

      respond(false, null, `Unsupported bridge action: ${action || "unknown"}`);
    } catch (error) {
      respond(false, null, error instanceof Error ? error.message : String(error));
    }
  })();
});
