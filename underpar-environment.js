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

  function cloneEnvironment(environment) {
    const resolved = resolveEnvironmentRecord(environment);
    const consoleShellUrl = `${EXPERIENCE_ORIGIN}/#/@adobepass/pass/authentication/${resolved.route}`;
    const cmConsoleShellUrl = `${String(resolved.cmConsoleOrigin || EXPERIENCE_ORIGIN).replace(/\/+$/, "")}/#/@adobepass/cm-console`;
    const dcrRegisterUrl = `${resolved.spBase}/o/client/register`;
    const dcrTokenUrl = `${resolved.spBase}/o/client/token`;
    const restV2Base = `${resolved.spBase}/api/v2`;
    const esmBase = `${resolved.mgmtBase}/esm/v3/media-company/`;
    const degradationBase = `${resolved.mgmtBase}/control/v3/degradation`;
    return {
      ...resolved,
      consoleShellUrl,
      cmConsoleShellUrl,
      consoleProgrammersUrl: `${consoleShellUrl}/programmers`,
      consoleCallbackPrefix: `${resolved.consoleBase}/oauth2/callback`,
      degradationBase,
      dcrRegisterUrl,
      dcrTokenUrl,
      clickEsmTokenUrl: dcrTokenUrl,
      restV2Base,
      esmBase,
      envBadgeTitle: buildEnvironmentTooltip(resolved),
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
    const resolved = resolveEnvironmentRecord(environment);
    const consoleShellUrl = `${EXPERIENCE_ORIGIN}/#/@adobepass/pass/authentication/${resolved.route}`;
    const cmConsoleShellUrl = `${String(resolved.cmConsoleOrigin || EXPERIENCE_ORIGIN).replace(/\/+$/, "")}/#/@adobepass/cm-console`;
    const dcrRegisterUrl = `${resolved.spBase}/o/client/register`;
    const dcrTokenUrl = `${resolved.spBase}/o/client/token`;
    const restV2Base = `${resolved.spBase}/api/v2`;
    const esmBase = `${resolved.mgmtBase}/esm/v3/media-company/`;
    const degradationBase = `${resolved.mgmtBase}/control/v3/degradation`;
    const lines = [`Environment : ${resolved.label}`];
    if (options.includeShell !== false) {
      lines.push(`AdobePASS Console : ${consoleShellUrl}`);
    }
    if (options.includeConsole !== false) {
      lines.push(`AdobePASS Console Base : ${resolved.consoleBase}`);
    }
    if (options.includeCmConsole !== false) {
      lines.push(`CM Console : ${cmConsoleShellUrl}`);
    }
    if (options.includeManagement !== false) {
      lines.push(`Management : ${resolved.mgmtBase}`);
    }
    if (options.includeServiceProvider !== false) {
      lines.push(`Service Provider : ${resolved.spBase}`);
    }
    if (options.includeDcrRegister !== false) {
      lines.push(`DCR Register : ${dcrRegisterUrl}`);
    }
    if (options.includeDcrToken !== false) {
      lines.push(`DCR Token : ${dcrTokenUrl}`);
    }
    if (options.includeRestV2 !== false) {
      lines.push(`REST V2 : ${restV2Base}`);
    }
    if (options.includeEsm !== false) {
      lines.push(`ESM : ${esmBase}`);
    }
    if (options.includeDegradation !== false) {
      lines.push(`DEGRADATION : ${degradationBase}`);
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
    rewriteServiceUrl,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
