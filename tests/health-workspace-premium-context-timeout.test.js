const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const FILE_PATH = path.join(ROOT, "popup.js");

function extractFunctionSource(source, functionName) {
  const markers = [`async function ${functionName}(`, `function ${functionName}(`];
  let start = -1;
  for (const marker of markers) {
    start = source.indexOf(marker);
    if (start !== -1) {
      break;
    }
  }
  assert.notEqual(start, -1, `Unable to locate ${functionName}`);
  const paramsStart = source.indexOf("(", start);
  assert.notEqual(paramsStart, -1, `Unable to locate params for ${functionName}`);
  let paramsDepth = 0;
  let bodyStart = -1;
  for (let index = paramsStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") paramsDepth += 1;
    if (char === ")") {
      paramsDepth -= 1;
      if (paramsDepth === 0) {
        bodyStart = source.indexOf("{", index);
        break;
      }
    }
  }
  assert.notEqual(bodyStart, -1, `Unable to locate body for ${functionName}`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`Unterminated function: ${functionName}`);
}

function loadHarness(options = {}) {
  const source = fs.readFileSync(FILE_PATH, "utf8");
  const script = [
    extractFunctionSource(source, "getHealthWorkspacePremiumContextSnapshot"),
    extractFunctionSource(source, "ensureHealthWorkspacePremiumContext"),
    "module.exports = { ensureHealthWorkspacePremiumContext };",
  ].join("\n\n");

  let activeHydrationPromise = options.activeHydrationPromise || new Promise(() => {});
  const premiumAppsByProgrammerId = new Map();
  if (options.currentServices) {
    premiumAppsByProgrammerId.set("NBA", options.currentServices);
  }

  const calls = {
    timeouts: [],
    logs: [],
    clears: 0,
    primes: 0,
  };
  const state = {
    sessionReady: true,
    loginData: { orgId: "adobepass" },
    premiumPanelRequestToken: 12,
    cmServiceByProgrammerId: new Map(),
    cmTenantsCatalog: null,
  };

  const context = {
    module: { exports: {} },
    exports: {},
    state,
    HEALTH_WORKSPACE_PREMIUM_HYDRATION_WAIT_TIMEOUT_MS: 750,
    shouldHydrateAdobePassWorkflowForSession() {
      return true;
    },
    findProgrammerByProgrammerId(programmerId) {
      return programmerId ? { programmerId, programmerName: programmerId } : null;
    },
    resolveSelectedProgrammer() {
      return null;
    },
    getCurrentPremiumAppsSnapshot(programmerId) {
      return premiumAppsByProgrammerId.get(programmerId) || null;
    },
    getRuntimePremiumServicesSeed() {
      return null;
    },
    isProgrammerWorkspaceHydrationReady() {
      return false;
    },
    isProgrammerHrContextHydrationReady(programmerId, services) {
      void programmerId;
      return Boolean(services?.__ready === true);
    },
    hasEsmScopedApp(services) {
      return Boolean(services?.esm);
    },
    getProgrammerServiceHydrationPromise() {
      return activeHydrationPromise;
    },
    setProgrammerServiceHydrationPromise(programmerId, promise) {
      void programmerId;
      activeHydrationPromise = promise;
      if (!promise) {
        calls.clears += 1;
      }
      return promise;
    },
    async withPromiseTimeout(promise, timeoutMs, message) {
      calls.timeouts.push({ timeoutMs, message });
      if (typeof options.withPromiseTimeoutImpl === "function") {
        return options.withPromiseTimeoutImpl(promise, timeoutMs, message);
      }
      throw new Error(String(message || "timeout"));
    },
    async primeProgrammerServiceHydration(programmerIdOrProgrammer) {
      void programmerIdOrProgrammer;
      calls.primes += 1;
      const hydrated = { esm: { guid: "fresh-esm" }, __ready: true };
      premiumAppsByProgrammerId.set("NBA", hydrated);
      return hydrated;
    },
    async ensureCmServiceForProgrammer() {
      return null;
    },
    applyPremiumServiceRuntimeSummary(programmer, services) {
      void programmer;
      return services;
    },
    setCurrentPremiumAppsSnapshot(programmerId, services) {
      premiumAppsByProgrammerId.set(programmerId, services);
    },
    selectPreferredCmRuntimeService(existingService, resolvedService) {
      return resolvedService || existingService || null;
    },
    log(message, details) {
      calls.logs.push({ message, details });
    },
    Math,
    Number,
    String,
    Boolean,
  };

  vm.runInNewContext(script, context, { filename: FILE_PATH });
  return {
    ensureHealthWorkspacePremiumContext: context.module.exports.ensureHealthWorkspacePremiumContext,
    calls,
    getActiveHydrationPromise() {
      return activeHydrationPromise;
    },
  };
}

test("health workspace premium context bypasses stale hydration promises and re-primes services", async () => {
  const harness = loadHarness({
    currentServices: { esm: { guid: "seed-esm" }, __ready: false },
    withPromiseTimeoutImpl: async (_promise, _timeoutMs, message) => {
      throw new Error(String(message || "timeout"));
    },
  });

  const result = await harness.ensureHealthWorkspacePremiumContext("NBA", {
    controllerReason: "hr-health-esm",
    requestToken: 77,
  });

  assert.equal(harness.calls.timeouts.length, 1);
  assert.equal(harness.calls.timeouts[0].timeoutMs, 750);
  assert.equal(harness.calls.clears, 1);
  assert.equal(harness.calls.primes, 1);
  assert.equal(result.hydrationReady, true);
  assert.equal(result.esmAvailable, true);
  assert.match(harness.calls.logs[0]?.message || "", /HEALTH workspace bypassed stale hydration promise/);
});

test("health workspace premium context reuses fresh hydration promises without clearing them", async () => {
  const harness = loadHarness({
    currentServices: { esm: { guid: "seed-esm" }, __ready: false },
    activeHydrationPromise: Promise.resolve({ esm: { guid: "fresh-esm" }, __ready: true }),
    withPromiseTimeoutImpl: async (promise) => promise,
  });

  const result = await harness.ensureHealthWorkspacePremiumContext("NBA", {
    controllerReason: "hr-health-splunk",
    requestToken: 88,
  });

  assert.equal(harness.calls.timeouts.length, 1);
  assert.equal(harness.calls.clears, 0);
  assert.equal(harness.calls.primes, 0);
  assert.equal(result.hydrationReady, true);
  assert.equal(result.esmAvailable, true);
  assert.equal(harness.calls.logs.length, 0);
});