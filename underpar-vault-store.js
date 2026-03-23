(function initUnderparVaultStore(globalScope) {
  const UNDERPAR_VAULT_DB_NAME = "underpar-vault";
  const UNDERPAR_VAULT_DB_VERSION = 1;
  const PROGRAMMER_STORE = "programmerRecords";
  const ENVIRONMENT_STORE = "environmentGlobals";
  const META_STORE = "meta";
  const META_KEY_VAULT = "vaultMeta";
  const META_KEY_SAVED_QUERIES = "savedQueries";
  const META_KEY_CM_IMS = "cmImsByEnvironment";
  const META_KEY_ADOBE_IMS = "adobeIms";
  const META_KEY_SLACK = "slack";
  const CHANGE_CHANNEL_NAME = "underpar-vault-sync-v1";

  let databasePromise = null;

  function isSupported() {
    return typeof globalScope?.indexedDB !== "undefined";
  }

  function cloneJsonLikeValue(value, fallback = null) {
    if (value === undefined) {
      return fallback;
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return fallback;
    }
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

  function normalizeKey(value = "") {
    return String(value ?? "").trim();
  }

  function buildProgrammerRecordKey({ environmentKey = "", programmerId = "" } = {}) {
    const normalizedEnvironmentKey = normalizeKey(environmentKey);
    const normalizedProgrammerId = normalizeKey(programmerId);
    if (!normalizedEnvironmentKey || !normalizedProgrammerId) {
      return "";
    }
    return `${normalizedEnvironmentKey}::${normalizedProgrammerId}`;
  }

  function buildEmptyAggregatePayload() {
    return {
      schemaVersion: 1,
      updatedAt: Date.now(),
      underpar: {
        globals: {
          savedQueries: {},
          cmImsByEnvironment: {},
          adobeIms: null,
          slack: null,
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
  }

  function sanitizeMatchedTenants(value = []) {
    return (Array.isArray(value) ? value : [])
      .map((entry) => {
        const consoleId = firstNonEmptyString([entry?.consoleId, entry?.id, entry?.tenantId, entry?.orgId]);
        const tenantId = firstNonEmptyString([entry?.tenantId, entry?.orgId, entry?.id, entry?.consoleId]);
        const tenantName = firstNonEmptyString([entry?.tenantName, entry?.displayName, entry?.name, entry?.label]);
        const sourceUrl = firstNonEmptyString([entry?.sourceUrl]);
        if (!consoleId && !tenantId && !tenantName) {
          return null;
        }
        return {
          ...(consoleId ? { consoleId } : {}),
          ...(tenantId ? { tenantId } : {}),
          ...(tenantName ? { tenantName } : {}),
          ...(tenantName ? { displayName: tenantName } : {}),
          ...(sourceUrl ? { sourceUrl } : {}),
        };
      })
      .filter(Boolean);
  }

  function sanitizeCmTenantsCatalog(catalog = null) {
    if (!catalog || typeof catalog !== "object") {
      return null;
    }
    const tenants = (Array.isArray(catalog?.tenants) ? catalog.tenants : [])
      .map((tenant) => {
        const tenantId = normalizeKey(firstNonEmptyString([tenant?.tenantId, tenant?.consoleId, tenant?.tenantName]));
        const tenantName = normalizeKey(firstNonEmptyString([tenant?.tenantName, tenant?.displayName, tenantId]));
        const aliases = (Array.isArray(tenant?.aliases) ? tenant.aliases : [])
          .map((value) => normalizeKey(value))
          .filter(Boolean)
          .slice(0, 32);
        const links = (Array.isArray(tenant?.links) ? tenant.links : [])
          .map((value) => normalizeKey(value))
          .filter(Boolean)
          .slice(0, 12);
        const sourceUrl = normalizeKey(tenant?.sourceUrl);
        if (!tenantId && !tenantName) {
          return null;
        }
        return {
          ...(tenantId ? { tenantId } : {}),
          ...(tenantName ? { tenantName } : {}),
          ...(aliases.length > 0 ? { aliases } : {}),
          ...(links.length > 0 ? { links } : {}),
          ...(sourceUrl ? { sourceUrl } : {}),
        };
      })
      .filter(Boolean);

    if (tenants.length === 0) {
      return null;
    }

    return {
      tenants,
      sourceUrl: normalizeKey(catalog?.sourceUrl),
      tenantCount: Math.max(tenants.length, Number(catalog?.tenantCount || 0)),
      applicationCount: Math.max(0, Number(catalog?.applicationCount || 0)),
      policyCount: Math.max(0, Number(catalog?.policyCount || 0)),
      summaryReady: catalog?.summaryReady === true,
      fetchedAt: Number(catalog?.fetchedAt || 0) || Date.now(),
      persistedAt: Date.now(),
    };
  }

  function sanitizeCmGlobalRecord(record = null) {
    if (!record || typeof record !== "object") {
      return null;
    }
    const clientId = normalizeKey(firstNonEmptyString([record?.clientId]));
    const tokenClientId = normalizeKey(firstNonEmptyString([record?.tokenClientId, clientId]));
    const userId = normalizeKey(firstNonEmptyString([record?.userId, record?.imsUserId]));
    const scope = normalizeKey(firstNonEmptyString([record?.scope]));
    const expiresAt = Math.max(0, Number(record?.expiresAt || 0));
    const updatedAt = Math.max(0, Number(record?.updatedAt || record?.refreshedAt || 0));
    if (!clientId && !tokenClientId && !userId && !scope && !expiresAt && !updatedAt) {
      return null;
    }
    return {
      ...(clientId ? { clientId } : {}),
      ...(tokenClientId ? { tokenClientId } : {}),
      ...(userId ? { userId } : {}),
      ...(scope ? { scope } : {}),
      ...(expiresAt > 0 ? { expiresAt } : {}),
      updatedAt: updatedAt || Date.now(),
    };
  }

  function sanitizeProgrammerCmServiceSummary(summary = null) {
    if (!summary || typeof summary !== "object") {
      return null;
    }
    const matchedTenants = sanitizeMatchedTenants(summary?.matchedTenants || []);
    const available = summary?.available === true || matchedTenants.length > 0;
    const checked = summary?.checked === true || matchedTenants.length > 0;
    if (!available && !checked && matchedTenants.length === 0) {
      return null;
    }
    return {
      available,
      checked,
      matchedTenantCount: Math.max(matchedTenants.length, Number(summary?.matchedTenantCount || 0)),
      matchedTenants,
    };
  }

  function sanitizeEnvironmentRecord(record = null, environmentKey = "") {
    const normalizedEnvironmentKey = normalizeKey(environmentKey || record?.environmentKey || record?.key);
    if (!normalizedEnvironmentKey) {
      return null;
    }
    const cmTenants = sanitizeCmTenantsCatalog(record?.cmTenants || record?.cmTenantsCatalog || null);
    return {
      environmentKey: normalizedEnvironmentKey,
      key: normalizedEnvironmentKey,
      label: firstNonEmptyString([record?.label, record?.environmentLabel, normalizedEnvironmentKey]),
      updatedAt: Number(record?.updatedAt || 0) || Date.now(),
      cmTenants,
    };
  }

  function sanitizeProgrammerRecord(record = null) {
    if (!record || typeof record !== "object") {
      return null;
    }
    const programmerId = normalizeKey(record?.programmerId);
    const environmentKey = normalizeKey(record?.environmentKey);
    if (!programmerId || !environmentKey) {
      return null;
    }
    const normalizedRecord = cloneJsonLikeValue(record, {});
    delete normalizedRecord.cmTenantBundlesByTenantKey;
    delete normalizedRecord.cmGlobal;
    if (normalizedRecord.services && typeof normalizedRecord.services === "object" && !Array.isArray(normalizedRecord.services)) {
      normalizedRecord.services = cloneJsonLikeValue(normalizedRecord.services, {});
      const sanitizedCmService = sanitizeProgrammerCmServiceSummary(normalizedRecord.services?.cm || null);
      if (sanitizedCmService) {
        normalizedRecord.services.cm = sanitizedCmService;
      } else {
        delete normalizedRecord.services.cm;
      }
    }
    normalizedRecord.programmerId = programmerId;
    normalizedRecord.environmentKey = environmentKey;
    normalizedRecord.key = buildProgrammerRecordKey({ environmentKey, programmerId });
    return normalizedRecord;
  }

  function buildSnapshotFromAggregatePayload(payload = null) {
    const aggregate = payload && typeof payload === "object" ? payload : {};
    const environmentsInput =
      aggregate?.pass?.environments && typeof aggregate.pass.environments === "object" && !Array.isArray(aggregate.pass.environments)
        ? aggregate.pass.environments
        : {};
    const environmentRecords = [];
    const programmerRecords = [];

    Object.entries(environmentsInput).forEach(([environmentKey, environmentRecord]) => {
      const normalizedEnvironmentRecord = sanitizeEnvironmentRecord(environmentRecord, environmentKey);
      if (!normalizedEnvironmentRecord) {
        return;
      }
      environmentRecords.push(normalizedEnvironmentRecord);
      const mediaCompanies =
        environmentRecord?.mediaCompanies &&
        typeof environmentRecord.mediaCompanies === "object" &&
        !Array.isArray(environmentRecord.mediaCompanies)
          ? environmentRecord.mediaCompanies
          : {};
      Object.entries(mediaCompanies).forEach(([programmerId, programmerRecord]) => {
        const normalizedProgrammerRecord = sanitizeProgrammerRecord({
          ...programmerRecord,
          programmerId: firstNonEmptyString([programmerRecord?.programmerId, programmerId]),
          environmentKey: normalizedEnvironmentRecord.environmentKey,
          environmentLabel: firstNonEmptyString([
            programmerRecord?.environmentLabel,
            normalizedEnvironmentRecord.label,
            normalizedEnvironmentRecord.environmentKey,
          ]),
        });
        if (normalizedProgrammerRecord) {
          programmerRecords.push(normalizedProgrammerRecord);
        }
      });
    });

    return {
      vaultMeta: {
        schemaVersion: Number(aggregate?.schemaVersion || 1) || 1,
        passSchemaVersion: Number(aggregate?.pass?.schemaVersion || aggregate?.schemaVersion || 1) || 1,
        updatedAt: Number(aggregate?.updatedAt || 0) || Date.now(),
      },
      globals: {
        savedQueries: cloneJsonLikeValue(aggregate?.underpar?.globals?.savedQueries || {}, {}),
        cmImsByEnvironment: Object.fromEntries(
          Object.entries(
            aggregate?.underpar?.globals?.cmImsByEnvironment &&
              typeof aggregate.underpar.globals.cmImsByEnvironment === "object" &&
              !Array.isArray(aggregate.underpar.globals.cmImsByEnvironment)
              ? aggregate.underpar.globals.cmImsByEnvironment
              : {}
          )
            .map(([environmentKey, record]) => [normalizeKey(environmentKey), sanitizeCmGlobalRecord(record)])
            .filter(([environmentKey, record]) => environmentKey && record)
        ),
        adobeIms: cloneJsonLikeValue(aggregate?.underpar?.globals?.adobeIms || null, null),
        slack: cloneJsonLikeValue(aggregate?.underpar?.globals?.slack || null, null),
      },
      environmentRecords,
      programmerRecords,
    };
  }

  function buildAggregatePayloadFromSnapshot(snapshot = null) {
    const aggregate = buildEmptyAggregatePayload();
    const normalizedSnapshot = snapshot && typeof snapshot === "object" ? snapshot : {};
    const vaultMeta = normalizedSnapshot?.vaultMeta && typeof normalizedSnapshot.vaultMeta === "object" ? normalizedSnapshot.vaultMeta : {};
    aggregate.schemaVersion = Number(vaultMeta?.schemaVersion || 1) || 1;
    aggregate.updatedAt = Number(vaultMeta?.updatedAt || 0) || Date.now();
    aggregate.pass.schemaVersion = Number(vaultMeta?.passSchemaVersion || aggregate.schemaVersion || 1) || 1;
    aggregate.underpar.globals.savedQueries = cloneJsonLikeValue(normalizedSnapshot?.globals?.savedQueries || {}, {});
    aggregate.underpar.globals.cmImsByEnvironment = Object.fromEntries(
      Object.entries(
        normalizedSnapshot?.globals?.cmImsByEnvironment &&
          typeof normalizedSnapshot.globals.cmImsByEnvironment === "object" &&
          !Array.isArray(normalizedSnapshot.globals.cmImsByEnvironment)
          ? normalizedSnapshot.globals.cmImsByEnvironment
          : {}
      )
        .map(([environmentKey, record]) => [normalizeKey(environmentKey), sanitizeCmGlobalRecord(record)])
        .filter(([environmentKey, record]) => environmentKey && record)
    );
    aggregate.underpar.globals.adobeIms = cloneJsonLikeValue(normalizedSnapshot?.globals?.adobeIms || null, null);
    aggregate.underpar.globals.slack = cloneJsonLikeValue(normalizedSnapshot?.globals?.slack || null, null);

    (Array.isArray(normalizedSnapshot?.environmentRecords) ? normalizedSnapshot.environmentRecords : []).forEach((record) => {
      const normalizedEnvironmentRecord = sanitizeEnvironmentRecord(record);
      if (!normalizedEnvironmentRecord) {
        return;
      }
      aggregate.pass.environments[normalizedEnvironmentRecord.environmentKey] = {
        key: normalizedEnvironmentRecord.environmentKey,
        label: normalizedEnvironmentRecord.label,
        updatedAt: Number(normalizedEnvironmentRecord.updatedAt || 0) || aggregate.updatedAt,
        cmGlobal: sanitizeCmGlobalRecord(
          aggregate.underpar.globals.cmImsByEnvironment?.[normalizedEnvironmentRecord.environmentKey] || null
        ),
        cmTenants: cloneJsonLikeValue(normalizedEnvironmentRecord.cmTenants || null, null),
        mediaCompanies: {},
      };
    });

    (Array.isArray(normalizedSnapshot?.programmerRecords) ? normalizedSnapshot.programmerRecords : []).forEach((record) => {
      const normalizedProgrammerRecord = sanitizeProgrammerRecord(record);
      if (!normalizedProgrammerRecord) {
        return;
      }
      if (!aggregate.pass.environments[normalizedProgrammerRecord.environmentKey]) {
        aggregate.pass.environments[normalizedProgrammerRecord.environmentKey] = {
          key: normalizedProgrammerRecord.environmentKey,
          label: normalizedProgrammerRecord.environmentLabel || normalizedProgrammerRecord.environmentKey,
          updatedAt: Number(normalizedProgrammerRecord.updatedAt || 0) || aggregate.updatedAt,
          cmGlobal: null,
          cmTenants: null,
          mediaCompanies: {},
        };
      }
      const environmentRecord = aggregate.pass.environments[normalizedProgrammerRecord.environmentKey];
      environmentRecord.mediaCompanies[normalizedProgrammerRecord.programmerId] = cloneJsonLikeValue(
        normalizedProgrammerRecord,
        {}
      );
      environmentRecord.updatedAt = Math.max(
        Number(environmentRecord.updatedAt || 0),
        Number(normalizedProgrammerRecord.updatedAt || 0)
      );
    });

    return aggregate;
  }

  function hasSnapshotData(snapshot = null) {
    if (!snapshot || typeof snapshot !== "object") {
      return false;
    }
    return (
      (Array.isArray(snapshot?.environmentRecords) && snapshot.environmentRecords.length > 0) ||
      (Array.isArray(snapshot?.programmerRecords) && snapshot.programmerRecords.length > 0) ||
      Object.keys(snapshot?.globals?.savedQueries || {}).length > 0 ||
      Object.keys(snapshot?.globals?.cmImsByEnvironment || {}).length > 0 ||
      Boolean(snapshot?.globals?.adobeIms) ||
      Boolean(snapshot?.globals?.slack)
    );
  }

  function openDatabase() {
    if (databasePromise) {
      return databasePromise;
    }
    if (!isSupported()) {
      return Promise.reject(new Error("UnderPAR VAULT IndexedDB is unavailable."));
    }
    databasePromise = new Promise((resolve, reject) => {
      const request = globalScope.indexedDB.open(UNDERPAR_VAULT_DB_NAME, UNDERPAR_VAULT_DB_VERSION);
      request.onerror = () => {
        reject(request.error || new Error("Unable to open UnderPAR VAULT database."));
      };
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(PROGRAMMER_STORE)) {
          const store = database.createObjectStore(PROGRAMMER_STORE, { keyPath: "key" });
          store.createIndex("byEnvironmentKey", "environmentKey", { unique: false });
          store.createIndex("byUpdatedAt", "updatedAt", { unique: false });
        }
        if (!database.objectStoreNames.contains(ENVIRONMENT_STORE)) {
          database.createObjectStore(ENVIRONMENT_STORE, { keyPath: "environmentKey" });
        }
        if (!database.objectStoreNames.contains(META_STORE)) {
          database.createObjectStore(META_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          databasePromise = null;
        };
        resolve(database);
      };
    });
    return databasePromise;
  }

  function getAllValues(database, storeName) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, "readonly");
      const request = transaction.objectStore(storeName).getAll();
      request.onerror = () => {
        reject(request.error || new Error(`Unable to read ${storeName}.`));
      };
      request.onsuccess = () => {
        resolve(Array.isArray(request.result) ? request.result : []);
      };
    });
  }

  function getValue(database, storeName, key) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, "readonly");
      const request = transaction.objectStore(storeName).get(key);
      request.onerror = () => {
        reject(request.error || new Error(`Unable to read ${storeName}.`));
      };
      request.onsuccess = () => {
        resolve(request.result || null);
      };
    });
  }

  function runTransaction(database, storeNames, mode, work) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeNames, mode);
      try {
        work(transaction);
      } catch (error) {
        transaction.abort();
        reject(error);
        return;
      }
      transaction.oncomplete = () => {
        resolve(true);
      };
      transaction.onerror = () => {
        reject(transaction.error || new Error("UnderPAR VAULT transaction failed."));
      };
      transaction.onabort = () => {
        reject(transaction.error || new Error("UnderPAR VAULT transaction aborted."));
      };
    });
  }

  function publishChange(payload = null) {
    if (typeof globalScope?.BroadcastChannel === "undefined") {
      return;
    }
    try {
      const channel = new globalScope.BroadcastChannel(CHANGE_CHANNEL_NAME);
      channel.postMessage(payload && typeof payload === "object" ? payload : { type: "underpar-vault:write", at: Date.now() });
      channel.close();
    } catch {
      // Ignore notification failures; readers can still refresh on demand.
    }
  }

  async function readAggregatePayload() {
    if (!isSupported()) {
      return null;
    }
    const database = await openDatabase();
    const [environmentRecords, programmerRecords, vaultMetaRecord, savedQueriesRecord, cmImsRecord, adobeImsRecord, slackRecord] =
      await Promise.all([
        getAllValues(database, ENVIRONMENT_STORE),
        getAllValues(database, PROGRAMMER_STORE),
        getValue(database, META_STORE, META_KEY_VAULT),
        getValue(database, META_STORE, META_KEY_SAVED_QUERIES),
        getValue(database, META_STORE, META_KEY_CM_IMS),
        getValue(database, META_STORE, META_KEY_ADOBE_IMS),
        getValue(database, META_STORE, META_KEY_SLACK),
      ]);
    const snapshot = {
      vaultMeta: vaultMetaRecord?.value && typeof vaultMetaRecord.value === "object" ? vaultMetaRecord.value : {},
      globals: {
        savedQueries: cloneJsonLikeValue(savedQueriesRecord?.value || {}, {}),
        cmImsByEnvironment: cloneJsonLikeValue(cmImsRecord?.value || {}, {}),
        adobeIms: cloneJsonLikeValue(adobeImsRecord?.value || null, null),
        slack: cloneJsonLikeValue(slackRecord?.value || null, null),
      },
      environmentRecords: Array.isArray(environmentRecords) ? environmentRecords : [],
      programmerRecords: Array.isArray(programmerRecords) ? programmerRecords : [],
    };
    if (!hasSnapshotData(snapshot)) {
      return buildEmptyAggregatePayload();
    }
    return buildAggregatePayloadFromSnapshot(snapshot);
  }

  async function writeAggregatePayload(payload = null) {
    if (!isSupported()) {
      throw new Error("UnderPAR VAULT IndexedDB is unavailable.");
    }
    const snapshot = buildSnapshotFromAggregatePayload(payload);
    const database = await openDatabase();
    await runTransaction(database, [PROGRAMMER_STORE, ENVIRONMENT_STORE, META_STORE], "readwrite", (transaction) => {
      const programmerStore = transaction.objectStore(PROGRAMMER_STORE);
      const environmentStore = transaction.objectStore(ENVIRONMENT_STORE);
      const metaStore = transaction.objectStore(META_STORE);
      programmerStore.clear();
      environmentStore.clear();
      metaStore.clear();

      snapshot.environmentRecords.forEach((record) => {
        environmentStore.put(record);
      });
      snapshot.programmerRecords.forEach((record) => {
        programmerStore.put(record);
      });
      metaStore.put({ key: META_KEY_VAULT, value: snapshot.vaultMeta });
      metaStore.put({ key: META_KEY_SAVED_QUERIES, value: snapshot.globals.savedQueries });
      metaStore.put({ key: META_KEY_CM_IMS, value: snapshot.globals.cmImsByEnvironment });
      metaStore.put({ key: META_KEY_ADOBE_IMS, value: snapshot.globals.adobeIms });
      metaStore.put({ key: META_KEY_SLACK, value: snapshot.globals.slack });
    });
    publishChange({
      type: "underpar-vault:write",
      at: Date.now(),
      environmentCount: snapshot.environmentRecords.length,
      programmerCount: snapshot.programmerRecords.length,
      updatedAt: Number(snapshot?.vaultMeta?.updatedAt || 0) || Date.now(),
    });
    return buildAggregatePayloadFromSnapshot(snapshot);
  }

  async function clear() {
    if (!isSupported()) {
      return false;
    }
    const database = await openDatabase();
    await runTransaction(database, [PROGRAMMER_STORE, ENVIRONMENT_STORE, META_STORE], "readwrite", (transaction) => {
      transaction.objectStore(PROGRAMMER_STORE).clear();
      transaction.objectStore(ENVIRONMENT_STORE).clear();
      transaction.objectStore(META_STORE).clear();
    });
    publishChange({
      type: "underpar-vault:clear",
      at: Date.now(),
    });
    return true;
  }

  function subscribe(listener) {
    if (typeof listener !== "function" || typeof globalScope?.BroadcastChannel === "undefined") {
      return () => {};
    }
    const channel = new globalScope.BroadcastChannel(CHANGE_CHANNEL_NAME);
    const handler = (event) => {
      try {
        listener(event?.data || null);
      } catch {
        // Ignore consumer failures.
      }
    };
    if (typeof channel.addEventListener === "function") {
      channel.addEventListener("message", handler);
    } else {
      channel.onmessage = handler;
    }
    return () => {
      try {
        if (typeof channel.removeEventListener === "function") {
          channel.removeEventListener("message", handler);
        } else if (channel.onmessage === handler) {
          channel.onmessage = null;
        }
        channel.close();
      } catch {
        // Ignore cleanup failures.
      }
    };
  }

  globalScope.UnderparVaultStore = {
    dbName: UNDERPAR_VAULT_DB_NAME,
    dbVersion: UNDERPAR_VAULT_DB_VERSION,
    programmerStore: PROGRAMMER_STORE,
    environmentStore: ENVIRONMENT_STORE,
    metaStore: META_STORE,
    changeChannelName: CHANGE_CHANNEL_NAME,
    isSupported,
    buildProgrammerRecordKey,
    buildEmptyAggregatePayload,
    buildSnapshotFromAggregatePayload,
    buildAggregatePayloadFromSnapshot,
    readAggregatePayload,
    writeAggregatePayload,
    clear,
    subscribe,
  };
})(globalThis);
