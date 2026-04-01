(function initUnderParEnvironment(globalScope) {
  const STORAGE_KEY = "underpar_adobepass_environment_v1";
  const DEFAULT_KEY = "release-production";
  const EXPERIENCE_ORIGIN = "https://experience.adobe.com";
  const EXPERIENCE_STAGE_ORIGIN = "https://experience-stage.adobe.com";
  const PREMIUM_SERVICE_KEY_ALIASES = Object.freeze({
    cm: "cm",
    cmmvpd: "cmMvpd",
    degradation: "degradation",
    esm: "esmWorkspace",
    esmworkspace: "esmWorkspace",
    resettemppass: "resetTempPass",
    restv2: "restV2",
  });
  const ENVIRONMENTS = Object.freeze([
    {
      key: "prequal-staging",
      label: "Prequal Staging",
      shortCode: "PQ_STAGE",
      route: "prequal-staging",
      consoleBase: "https://console-prequal.auth-staging.adobe.com",
      consoleShellOrigin: EXPERIENCE_STAGE_ORIGIN,
      cmConsoleOrigin: EXPERIENCE_STAGE_ORIGIN,
      mgmtBase: "https://mgmt-prequal.auth-staging.adobe.com",
      spBase: "https://sp-prequal.auth-staging.adobe.com",
      supportedPremiumServices: Object.freeze({
        restV2: true,
        esmWorkspace: false,
        degradation: true,
        resetTempPass: true,
        cm: true,
        cmMvpd: true,
      }),
      premiumServiceNotes: Object.freeze({
        esmWorkspace:
          "ESM is not provisioned in Prequal Staging. Adobe Pass Console maps ESM only for Release Production, Release Staging, and Prequal Production.",
      }),
    },
    {
      key: "prequal-production",
      label: "Prequal Production",
      shortCode: "PQ_PROD",
      route: "prequal-production",
      consoleBase: "https://console-prequal.auth.adobe.com",
      consoleShellOrigin: EXPERIENCE_ORIGIN,
      cmConsoleOrigin: EXPERIENCE_ORIGIN,
      mgmtBase: "https://mgmt-prequal.auth.adobe.com",
      spBase: "https://sp-prequal.auth.adobe.com",
      supportedPremiumServices: Object.freeze({
        restV2: true,
        esmWorkspace: true,
        degradation: true,
        resetTempPass: true,
        cm: true,
        cmMvpd: true,
      }),
    },
    {
      key: "release-staging",
      label: "Release Staging",
      shortCode: "REL_STAGE",
      route: "release-staging",
      consoleBase: "https://console.auth-staging.adobe.com",
      consoleShellOrigin: EXPERIENCE_STAGE_ORIGIN,
      cmConsoleOrigin: EXPERIENCE_STAGE_ORIGIN,
      mgmtBase: "https://mgmt.auth-staging.adobe.com",
      spBase: "https://sp.auth-staging.adobe.com",
      supportedPremiumServices: Object.freeze({
        restV2: true,
        esmWorkspace: true,
        degradation: true,
        resetTempPass: true,
        cm: true,
        cmMvpd: true,
      }),
    },
    {
      key: "release-production",
      label: "Release Production",
      shortCode: "REL_PROD",
      route: "release-production",
      consoleBase: "https://console.auth.adobe.com",
      consoleShellOrigin: EXPERIENCE_ORIGIN,
      cmConsoleOrigin: EXPERIENCE_ORIGIN,
      mgmtBase: "https://mgmt.auth.adobe.com",
      spBase: "https://sp.auth.adobe.com",
      supportedPremiumServices: Object.freeze({
        restV2: true,
        esmWorkspace: true,
        degradation: true,
        resetTempPass: true,
        cm: true,
        cmMvpd: true,
      }),
    },
  ]);
  const ENVIRONMENT_BY_KEY = new Map(
    ENVIRONMENTS.map((environment) => [String(environment.key || "").trim().toLowerCase(), environment])
  );
  const ENVIRONMENT_KEY_BY_HOST = new Map(
    ENVIRONMENTS.flatMap((environment) => {
      const hosts = [environment.consoleBase, environment.mgmtBase, environment.spBase]
        .map((value) => {
          try {
            return new URL(String(value || "").trim()).host.toLowerCase();
          } catch {
            return "";
          }
        })
        .filter(Boolean);
      return hosts.map((host) => [host, String(environment.key || "").trim().toLowerCase()]);
    })
  );
  const HOST_MATCHERS = Object.freeze({
    console: /^console(?:-prequal)?\.auth(?:-staging)?\.adobe\.com$/i,
    mgmt: /^mgmt(?:-prequal)?\.auth(?:-staging)?\.adobe\.com$/i,
    sp: /^(?:sp|api)(?:-prequal)?\.auth(?:-staging)?\.adobe\.com$/i,
  });

  function normalizeEnvironmentKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizePremiumServiceKey(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return PREMIUM_SERVICE_KEY_ALIASES[normalized] || normalized;
  }

  function tryResolveEnvironmentFromUrlValue(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return null;
    }
    try {
      const parsed = new URL(raw);
      const mappedKey = ENVIRONMENT_KEY_BY_HOST.get(String(parsed.host || "").trim().toLowerCase());
      return mappedKey ? ENVIRONMENT_BY_KEY.get(mappedKey) || null : null;
    } catch {
      return null;
    }
  }

  function resolveEnvironmentFromHints(values = []) {
    const hints = Array.isArray(values) ? values : [values];
    for (const value of hints) {
      const keyed = ENVIRONMENT_BY_KEY.get(normalizeEnvironmentKey(value));
      if (keyed) {
        return keyed;
      }
      const urlMatched = tryResolveEnvironmentFromUrlValue(value);
      if (urlMatched) {
        return urlMatched;
      }
    }
    return null;
  }

  function resolveEnvironmentRecord(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const keyed = ENVIRONMENT_BY_KEY.get(normalizeEnvironmentKey(value.key));
      if (keyed) {
        return keyed;
      }
      return (
        resolveEnvironmentFromHints([
          value.route,
          value.consoleBase,
          value.mgmtBase,
          value.spBase,
          value.consoleShellUrl,
          value.cmConsoleOrigin,
          value.cmConsoleShellUrl,
          value.dcrRegisterUrl,
          value.dcrTokenUrl,
          value.clickEsmTokenUrl,
          value.restV2Base,
          value.esmBase,
          value.degradationBase,
        ]) || ENVIRONMENT_BY_KEY.get(DEFAULT_KEY)
      );
    }
    return resolveEnvironmentFromHints(value) || ENVIRONMENT_BY_KEY.get(DEFAULT_KEY);
  }

  function buildEnvironmentDetails(environment) {
    const resolved = resolveEnvironmentRecord(environment);
    const consoleShellOrigin = String(resolved.consoleShellOrigin || EXPERIENCE_ORIGIN).replace(/\/+$/, "");
    const consoleShellUrl = `${consoleShellOrigin}/#/@adobepass/pass/authentication/${resolved.route}`;
    const cmConsoleShellUrl = `${String(resolved.cmConsoleOrigin || EXPERIENCE_ORIGIN).replace(/\/+$/, "")}/#/@adobepass/cm-console/cmu/year`;
    const dcrRegisterUrl = `${resolved.spBase}/o/client/register`;
    const dcrTokenUrl = `${resolved.spBase}/o/client/token`;
    const restV2Base = `${resolved.spBase}/api/v2`;
    const esmBase = `${resolved.mgmtBase}/esm/v3/media-company/`;
    const degradationBase = `${resolved.mgmtBase}/control/v3/degradation`;
    const cmReportsBase = String(resolved.cmReportsBase || "https://cm-reports.adobeprimetime.com").trim();
    return {
      ...resolved,
      consoleShellOrigin,
      consoleShellUrl,
      cmConsoleShellUrl,
      cmReportsBase,
      degradationBase,
      dcrRegisterUrl,
      dcrTokenUrl,
      clickEsmTokenUrl: dcrTokenUrl,
      restV2Base,
      esmBase,
      supportedPremiumServices:
        resolved.supportedPremiumServices && typeof resolved.supportedPremiumServices === "object"
          ? { ...resolved.supportedPremiumServices }
          : {},
      premiumServiceNotes:
        resolved.premiumServiceNotes && typeof resolved.premiumServiceNotes === "object"
          ? { ...resolved.premiumServiceNotes }
          : {},
      fileTag: String(resolved.fileTag || resolved.shortCode || resolved.key || "").trim(),
    };
  }

  function resolveEnvironmentBadgeContext(environment, context = "console") {
    const resolved = buildEnvironmentDetails(environment);
    const normalizedContext = String(context || "console").trim().toLowerCase();
    if (
      normalizedContext === "esm" ||
      normalizedContext === "clickesm" ||
      normalizedContext === "esm-workspace" ||
      normalizedContext === "esmws"
    ) {
      return { label: "ESM", url: resolved.esmBase };
    }
    if (
      normalizedContext === "degradation" ||
      normalizedContext === "dgr" ||
      normalizedContext === "clickdgr"
    ) {
      return { label: "DEGRADATION", url: resolved.degradationBase };
    }
    if (
      normalizedContext === "rest" ||
      normalizedContext === "restv2" ||
      normalizedContext === "rest-v2"
    ) {
      return { label: "REST V2", url: resolved.restV2Base };
    }
    if (
      normalizedContext === "cm" ||
      normalizedContext === "cmu" ||
      normalizedContext === "clickcmu" ||
      normalizedContext === "cm-workspace" ||
      normalizedContext === "cm-console"
    ) {
      return { label: "Concurrency Monitoring", url: resolved.cmReportsBase };
    }
    return { label: "AdobePASS Console", url: resolved.consoleShellUrl };
  }

  function buildEnvironmentBadgeTooltip(environment, context = "console") {
    const resolved = buildEnvironmentDetails(environment);
    const normalizedContext = String(context || "console").trim().toLowerCase();
    if (normalizedContext === "underpar" || normalizedContext === "popup" || normalizedContext === "sidepanel") {
      return `Environment : ${buildEnvironmentBadgeLabel(resolved)}`;
    }
    const badgeContext = resolveEnvironmentBadgeContext(resolved, context);
    const lines = [`Environment : ${resolved.label}`];
    if (String(badgeContext?.label || "").trim() && String(badgeContext?.url || "").trim()) {
      lines.push(`${badgeContext.label} : ${badgeContext.url}`);
    }
    return lines.join("\n");
  }

  function buildEnvironmentBadgeLabel(environment) {
    const resolved = buildEnvironmentDetails(environment);
    return String(resolved?.label || "Release Production").trim() || "Release Production";
  }

  function buildEnvironmentFileTag(environment) {
    const resolved = buildEnvironmentDetails(environment);
    return String(resolved?.fileTag || resolved?.shortCode || resolved?.key || "REL_PROD").trim() || "REL_PROD";
  }

  function cloneEnvironment(environment) {
    const resolved = buildEnvironmentDetails(environment);
    return {
      ...resolved,
      consoleProgrammersUrl: `${resolved.consoleShellUrl}/programmers`,
      consoleCallbackPrefix: `${resolved.consoleBase}/oauth2/callback`,
      envBadgeTitle: buildEnvironmentBadgeTooltip(resolved, "console"),
    };
  }

  function getEnvironment(value) {
    return cloneEnvironment(resolveEnvironmentRecord(value));
  }

  function getDefaultEnvironment() {
    return getEnvironment(DEFAULT_KEY);
  }

  function listEnvironments() {
    return ENVIRONMENTS.map((environment) => cloneEnvironment(environment));
  }

  function buildEnvironmentTooltip(environment, options = {}) {
    const resolved = buildEnvironmentDetails(environment);
    const lines = [`Environment : ${resolved.label}`];
    if (options.includeShell !== false) {
      lines.push(`AdobePASS Console : ${resolved.consoleShellUrl}`);
    }
    if (options.includeConsole !== false) {
      lines.push(`AdobePASS Console Base : ${resolved.consoleBase}`);
    }
    if (options.includeCmConsole !== false) {
      lines.push(`CM Console : ${resolved.cmConsoleShellUrl}`);
    }
    if (options.includeManagement !== false) {
      lines.push(`Management : ${resolved.mgmtBase}`);
    }
    if (options.includeServiceProvider !== false) {
      lines.push(`Service Provider : ${resolved.spBase}`);
    }
    if (options.includeDcrRegister !== false) {
      lines.push(`DCR Register : ${resolved.dcrRegisterUrl}`);
    }
    if (options.includeDcrToken !== false) {
      lines.push(`DCR Token : ${resolved.dcrTokenUrl}`);
    }
    if (options.includeRestV2 !== false) {
      lines.push(`REST V2 : ${resolved.restV2Base}`);
    }
    if (options.includeEsm !== false) {
      lines.push(`ESM : ${resolved.esmBase}`);
    }
    if (options.includeDegradation !== false) {
      lines.push(`DEGRADATION : ${resolved.degradationBase}`);
    }
    if (options.includeCmReports !== false) {
      lines.push(`Concurrency Monitoring : ${resolved.cmReportsBase}`);
    }
    return lines.join("\n");
  }

  function getServiceOrigin(environment, serviceKey = "console") {
    const resolved = getEnvironment(environment);
    if (serviceKey === "mgmt") {
      return resolved.mgmtBase;
    }
    if (serviceKey === "sp") {
      return resolved.spBase;
    }
    return resolved.consoleBase;
  }

  function isPremiumServiceSupported(serviceKey = "", environment = null) {
    const normalizedServiceKey = normalizePremiumServiceKey(serviceKey);
    if (!normalizedServiceKey) {
      return true;
    }
    const resolved = buildEnvironmentDetails(environment);
    const supportedPremiumServices =
      resolved?.supportedPremiumServices && typeof resolved.supportedPremiumServices === "object"
        ? resolved.supportedPremiumServices
        : {};
    if (Object.prototype.hasOwnProperty.call(supportedPremiumServices, normalizedServiceKey)) {
      return supportedPremiumServices[normalizedServiceKey] !== false;
    }
    return true;
  }

  function getPremiumServiceSupportNote(serviceKey = "", environment = null) {
    const normalizedServiceKey = normalizePremiumServiceKey(serviceKey);
    if (!normalizedServiceKey) {
      return "";
    }
    const resolved = buildEnvironmentDetails(environment);
    const premiumServiceNotes =
      resolved?.premiumServiceNotes && typeof resolved.premiumServiceNotes === "object"
        ? resolved.premiumServiceNotes
        : {};
    const explicit = String(premiumServiceNotes[normalizedServiceKey] || "").trim();
    if (explicit) {
      return explicit;
    }
    if (isPremiumServiceSupported(normalizedServiceKey, resolved)) {
      return "";
    }
    const label = buildEnvironmentBadgeLabel(resolved);
    return `${normalizedServiceKey} is not provisioned in ${label}.`;
  }

  function rewriteServiceUrl(urlValue, serviceKey = "console", environment = null) {
    const raw = String(urlValue || "").trim();
    if (!raw) {
      return "";
    }
    const targetOrigin = getServiceOrigin(environment, serviceKey);
    const target = new URL(targetOrigin);
    const matcher = HOST_MATCHERS[serviceKey] || null;
    try {
      const parsed = new URL(raw, targetOrigin);
      if (!matcher || matcher.test(parsed.hostname)) {
        parsed.protocol = target.protocol;
        parsed.host = target.host;
      }
      return parsed.toString();
    } catch {
      return raw;
    }
  }

  async function getStoredEnvironment() {
    try {
      const payload = await chrome.storage.local.get(STORAGE_KEY);
      return getEnvironment(payload?.[STORAGE_KEY]);
    } catch {
      return getDefaultEnvironment();
    }
  }

  async function setStoredEnvironment(value) {
    const environment = getEnvironment(value);
    await chrome.storage.local.set({
      [STORAGE_KEY]: environment.key,
    });
    return environment;
  }

  globalScope.UnderParEnvironment = Object.freeze({
    STORAGE_KEY,
    DEFAULT_KEY,
    EXPERIENCE_ORIGIN,
    listEnvironments,
    getEnvironment,
    getDefaultEnvironment,
    getStoredEnvironment,
    setStoredEnvironment,
    buildEnvironmentTooltip,
    buildEnvironmentBadgeTooltip,
    buildEnvironmentBadgeLabel,
    buildEnvironmentFileTag,
    isPremiumServiceSupported,
    getPremiumServiceSupportNote,
    rewriteServiceUrl,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
