const environmentSelect = document.getElementById("environment-select");
const switchButton = document.getElementById("switch-btn");
const shellUrlEl = document.getElementById("shell-url");
const consoleBaseEl = document.getElementById("console-base");
const cmConsoleUrlEl = document.getElementById("cm-console-url");
const mgmtBaseEl = document.getElementById("mgmt-base");
const spBaseEl = document.getElementById("sp-base");
const dcrRegisterUrlEl = document.getElementById("dcr-register-url");
const dcrTokenUrlEl = document.getElementById("dcr-token-url");
const restV2BaseEl = document.getElementById("rest-v2-base");
const esmBaseEl = document.getElementById("esm-base");
const degradationBaseEl = document.getElementById("degradation-base");
const FALLBACK_STORAGE_KEY = "underpar_adobepass_environment_v1";
const FALLBACK_DEFAULT_KEY = "release-production";
const FALLBACK_ENVIRONMENTS = Object.freeze([
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

function normalizeEnvironmentKey(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveEnvironmentRecord(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return (
      FALLBACK_ENVIRONMENTS.find((entry) => normalizeEnvironmentKey(entry.key) === normalizeEnvironmentKey(value.key)) ||
      FALLBACK_ENVIRONMENTS[0]
    );
  }
  return FALLBACK_ENVIRONMENTS.find((entry) => normalizeEnvironmentKey(entry.key) === normalizeEnvironmentKey(value)) || FALLBACK_ENVIRONMENTS[0];
}

function cloneEnvironment(environment) {
  const source = resolveEnvironmentRecord(environment);
  const consoleShellUrl = `https://experience.adobe.com/#/@adobepass/pass/authentication/${source.route}`;
  const cmConsoleShellUrl = `${String(source.cmConsoleOrigin || "https://experience.adobe.com").replace(/\/+$/, "")}/#/@adobepass/cm-console`;
  const dcrRegisterUrl = `${source.spBase}/o/client/register`;
  const dcrTokenUrl = `${source.spBase}/o/client/token`;
  const restV2Base = `${source.spBase}/api/v2`;
  const esmBase = `${source.mgmtBase}/esm/v3/media-company/`;
  const degradationBase = `${source.mgmtBase}/control/v3/degradation`;
  const cmReportsBase = String(source.cmReportsBase || "https://cm-reports.adobeprimetime.com").trim();
  return {
    ...source,
    consoleShellUrl,
    cmConsoleShellUrl,
    consoleProgrammersUrl: `${consoleShellUrl}/programmers`,
    consoleCallbackPrefix: `${source.consoleBase}/oauth2/callback`,
    cmReportsBase,
    degradationBase,
    dcrRegisterUrl,
    dcrTokenUrl,
    clickEsmTokenUrl: dcrTokenUrl,
    restV2Base,
    esmBase,
    envBadgeTitle: buildEnvironmentTooltip(source),
  };
}

function buildEnvironmentTooltip(environment) {
  const env = resolveEnvironmentRecord(environment);
  const consoleShellUrl = `https://experience.adobe.com/#/@adobepass/pass/authentication/${env.route}`;
  const cmConsoleShellUrl = `${String(env.cmConsoleOrigin || "https://experience.adobe.com").replace(/\/+$/, "")}/#/@adobepass/cm-console`;
  const dcrRegisterUrl = `${env.spBase}/o/client/register`;
  const dcrTokenUrl = `${env.spBase}/o/client/token`;
  const restV2Base = `${env.spBase}/api/v2`;
  const esmBase = `${env.mgmtBase}/esm/v3/media-company/`;
  const degradationBase = `${env.mgmtBase}/control/v3/degradation`;
  const cmReportsBase = String(env.cmReportsBase || "https://cm-reports.adobeprimetime.com").trim();
  return [
    `Environment : ${env.label}`,
    `AdobePASS Console : ${consoleShellUrl}`,
    `AdobePASS Console Base : ${env.consoleBase}`,
    `CM Console : ${cmConsoleShellUrl}`,
    `Management : ${env.mgmtBase}`,
    `Service Provider : ${env.spBase}`,
    `DCR Register : ${dcrRegisterUrl}`,
    `DCR Token : ${dcrTokenUrl}`,
    `REST V2 : ${restV2Base}`,
    `ESM : ${esmBase}`,
    `DEGRADATION : ${degradationBase}`,
    `Concurrency Monitoring : ${cmReportsBase}`,
  ].join("\n");
}

async function getFallbackStoredEnvironment() {
  try {
    if (chrome?.storage?.local?.get) {
      const payload = await chrome.storage.local.get(FALLBACK_STORAGE_KEY);
      const storedKey = normalizeEnvironmentKey(payload?.[FALLBACK_STORAGE_KEY] || FALLBACK_DEFAULT_KEY);
      return cloneEnvironment(storedKey);
    }
  } catch {
    // Ignore and fall back to default.
  }
  return cloneEnvironment(FALLBACK_DEFAULT_KEY);
}

async function setFallbackStoredEnvironment(value) {
  const environment = cloneEnvironment(value);
  if (!chrome?.storage?.local?.set) {
    throw new Error("Chrome local storage is unavailable in the UP settings panel.");
  }
  await chrome.storage.local.set({
    [FALLBACK_STORAGE_KEY]: environment.key,
  });
  return environment;
}

const fallbackRegistry = Object.freeze({
  listEnvironments() {
    return FALLBACK_ENVIRONMENTS.map((environment) => cloneEnvironment(environment));
  },
  getEnvironment(value) {
    return cloneEnvironment(value);
  },
  getDefaultEnvironment() {
    return cloneEnvironment(FALLBACK_DEFAULT_KEY);
  },
  async getStoredEnvironment() {
    return getFallbackStoredEnvironment();
  },
  async setStoredEnvironment(value) {
    return setFallbackStoredEnvironment(value);
  },
});

function getEnvironmentRegistry() {
  return globalThis.UnderParEnvironment || fallbackRegistry;
}

function renderEnvironmentDetails(environment) {
  const env = environment && typeof environment === "object"
    ? environment
    : getEnvironmentRegistry()?.getDefaultEnvironment?.();
  if (!env) {
    return;
  }

  if (shellUrlEl) {
    shellUrlEl.textContent = env.consoleShellUrl || "";
  }
  if (consoleBaseEl) {
    consoleBaseEl.textContent = env.consoleBase || "";
  }
  if (cmConsoleUrlEl) {
    cmConsoleUrlEl.textContent = env.cmConsoleShellUrl || "";
  }
  if (mgmtBaseEl) {
    mgmtBaseEl.textContent = env.mgmtBase || "";
  }
  if (spBaseEl) {
    spBaseEl.textContent = env.spBase || "";
  }
  if (dcrRegisterUrlEl) {
    dcrRegisterUrlEl.textContent = env.dcrRegisterUrl || "";
  }
  if (dcrTokenUrlEl) {
    dcrTokenUrlEl.textContent = env.dcrTokenUrl || "";
  }
  if (restV2BaseEl) {
    restV2BaseEl.textContent = env.restV2Base || "";
  }
  if (esmBaseEl) {
    esmBaseEl.textContent = env.esmBase || "";
  }
  if (degradationBaseEl) {
    degradationBaseEl.textContent = env.degradationBase || "";
  }
}

async function loadSelectedEnvironment() {
  const registry = getEnvironmentRegistry();
  const environments = Array.isArray(registry?.listEnvironments?.()) ? registry.listEnvironments() : fallbackRegistry.listEnvironments();
  const currentEnvironment = registry?.getStoredEnvironment
    ? await registry.getStoredEnvironment()
    : await fallbackRegistry.getStoredEnvironment();
  environmentSelect.innerHTML = environments
    .map((environment) => {
      const selected = environment.key === currentEnvironment.key ? ' selected' : "";
      return `<option value="${environment.key}"${selected}>${environment.label}</option>`;
    })
    .join("");
  renderEnvironmentDetails(currentEnvironment);
  environmentSelect.disabled = false;
  switchButton.disabled = false;
}

async function handleEnvironmentSelectionChange() {
  const registry = getEnvironmentRegistry();
  if (!registry) {
    return;
  }
  const selectedEnvironment = registry.getEnvironment(environmentSelect.value);
  renderEnvironmentDetails(selectedEnvironment);
}

async function handleSwitch() {
  const registry = getEnvironmentRegistry();
  if (!registry) {
    return;
  }

  switchButton.disabled = true;
  environmentSelect.disabled = true;
  try {
    const currentEnvironment = registry?.getStoredEnvironment
      ? await registry.getStoredEnvironment()
      : await fallbackRegistry.getStoredEnvironment();
    if (normalizeEnvironmentKey(currentEnvironment?.key) === normalizeEnvironmentKey(environmentSelect.value)) {
      renderEnvironmentDetails(currentEnvironment);
      return;
    }
    await registry.setStoredEnvironment(environmentSelect.value);
    await loadSelectedEnvironment();
  } catch (_error) {
  } finally {
    switchButton.disabled = false;
    environmentSelect.disabled = false;
  }
}

function init() {
  switchButton.disabled = true;
  environmentSelect.disabled = true;
  environmentSelect.addEventListener("change", () => {
    void handleEnvironmentSelectionChange();
  });
  switchButton.addEventListener("click", () => {
    void handleSwitch();
  });
  void loadSelectedEnvironment().catch(() => {
    environmentSelect.disabled = false;
    switchButton.disabled = false;
  });
}

init();
