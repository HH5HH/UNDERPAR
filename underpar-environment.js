(function initUnderParEnvironment(globalScope) {
  const STORAGE_KEY = "underpar_adobepass_environment_v1";
  const DEFAULT_KEY = "release-production";
  const EXPERIENCE_ORIGIN = "https://experience.adobe.com";
  const ENVIRONMENTS = Object.freeze([
    {
      key: "release-production",
      label: "Production",
      route: "release-production",
      consoleBase: "https://console.auth.adobe.com",
      cmConsoleOrigin: "https://experience.adobe.com",
      mgmtBase: "https://mgmt.auth.adobe.com",
      spBase: "https://sp.auth.adobe.com",
    },
    {
      key: "release-staging",
      label: "Staging",
      route: "release-staging",
      consoleBase: "https://console.auth-staging.adobe.com",
      cmConsoleOrigin: "https://experience-stage.adobe.com",
      mgmtBase: "https://mgmt.auth-staging.adobe.com",
      spBase: "https://sp.auth-staging.adobe.com",
    },
  ]);
  const ENVIRONMENT_BY_KEY = new Map(
    ENVIRONMENTS.map((environment) => [String(environment.key || "").trim().toLowerCase(), environment])
  );
  const HOST_MATCHERS = Object.freeze({
    console: /^console\.auth(?:-staging)?\.adobe\.com$/i,
    mgmt: /^mgmt\.auth(?:-staging)?\.adobe\.com$/i,
    sp: /^(?:sp|api)\.auth(?:-staging)?\.adobe\.com$/i,
  });

  function normalizeEnvironmentKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function resolveEnvironmentRecord(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const keyed = ENVIRONMENT_BY_KEY.get(normalizeEnvironmentKey(value.key));
      return keyed || ENVIRONMENT_BY_KEY.get(DEFAULT_KEY);
    }
    return ENVIRONMENT_BY_KEY.get(normalizeEnvironmentKey(value)) || ENVIRONMENT_BY_KEY.get(DEFAULT_KEY);
  }

  function buildEnvironmentDetails(environment) {
    const resolved = resolveEnvironmentRecord(environment);
    const consoleShellUrl = `${EXPERIENCE_ORIGIN}/#/@adobepass/pass/authentication/${resolved.route}`;
    const cmConsoleShellUrl = `${String(resolved.cmConsoleOrigin || EXPERIENCE_ORIGIN).replace(/\/+$/, "")}/#/@adobepass/cm-console/cmu/year`;
    const dcrRegisterUrl = `${resolved.spBase}/o/client/register`;
    const dcrTokenUrl = `${resolved.spBase}/o/client/token`;
    const restV2Base = `${resolved.spBase}/api/v2`;
    const esmBase = `${resolved.mgmtBase}/esm/v3/media-company/`;
    const degradationBase = `${resolved.mgmtBase}/control/v3/degradation`;
    const cmReportsBase = String(resolved.cmReportsBase || "https://cm-reports.adobeprimetime.com").trim();
    return {
      ...resolved,
      consoleShellUrl,
      cmConsoleShellUrl,
      cmReportsBase,
      degradationBase,
      dcrRegisterUrl,
      dcrTokenUrl,
      clickEsmTokenUrl: dcrTokenUrl,
      restV2Base,
      esmBase,
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
    const label = String(resolved?.label || "Production").trim() || "Production";
    return `Release ${label}`;
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
    rewriteServiceUrl,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
