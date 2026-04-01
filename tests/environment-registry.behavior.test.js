const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

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

function loadPopupFunctions(functionNames, globals = {}) {
  const source = read("popup.js");
  const script = [
    ...functionNames.map((name) => extractFunctionSource(source, name)),
    `module.exports = { ${functionNames.join(", ")} };`,
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    ...globals,
  };
  vm.runInNewContext(script, context, { filename: path.join(ROOT, "popup.js") });
  return context.module.exports;
}

function loadEnvironmentRegistry() {
  const source = read("underpar-environment.js");
  const context = {
    chrome: {
      storage: {
        local: {
          get: async () => ({}),
          set: async () => {},
        },
      },
    },
    URL,
    globalThis: null,
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: path.join(ROOT, "underpar-environment.js") });
  return context.UnderParEnvironment;
}

function normalizeRealmValue(value) {
  return JSON.parse(JSON.stringify(value));
}

test("environment registry exposes the four console environments in console order", () => {
  const registry = loadEnvironmentRegistry();
  const environments = normalizeRealmValue(registry.listEnvironments());

  assert.deepEqual(
    environments.map((environment) => environment.key),
    ["prequal-staging", "prequal-production", "release-staging", "release-production"]
  );
  assert.equal(environments[0].label, "Prequal Staging");
  assert.equal(environments[1].consoleBase, "https://console-prequal.auth.adobe.com");
  assert.equal(environments[2].mgmtBase, "https://mgmt.auth-staging.adobe.com");
  assert.equal(environments[3].spBase, "https://sp.auth.adobe.com");
});

test("environment registry infers prequal staging from service bases and disables ESM there", () => {
  const registry = loadEnvironmentRegistry();
  const inferred = normalizeRealmValue(
    registry.getEnvironment({
      mgmtBase: "https://mgmt-prequal.auth-staging.adobe.com",
      spBase: "https://sp-prequal.auth-staging.adobe.com",
    })
  );

  assert.equal(inferred.key, "prequal-staging");
  assert.equal(inferred.label, "Prequal Staging");
  assert.equal(registry.buildEnvironmentBadgeLabel(inferred), "Prequal Staging");
  assert.equal(registry.buildEnvironmentFileTag(inferred), "PQ_STAGE");
  assert.equal(registry.isPremiumServiceSupported("esmWorkspace", inferred), false);
  assert.equal(registry.isPremiumServiceSupported("restV2", inferred), true);
  assert.match(registry.getPremiumServiceSupportNote("esmWorkspace", inferred), /not provisioned in Prequal Staging/i);
});

test("popup premium service rendering keeps unsupported detected services visible but disabled", () => {
  const {
    shouldShowCmService,
    getRawDetectedPremiumServiceKeys,
    getDetectedPremiumServiceKeys,
    getDisabledDetectedPremiumServiceEntries,
    getRenderablePremiumServiceEntries,
  } = loadPopupFunctions(
    [
      "shouldShowCmService",
      "getRawDetectedPremiumServiceKeys",
      "getDetectedPremiumServiceKeys",
      "getDisabledDetectedPremiumServiceEntries",
      "getRenderablePremiumServiceEntries",
    ],
    {
      PREMIUM_SERVICE_DISPLAY_ORDER: ["restV2", "esmWorkspace", "degradation", "resetTempPass", "cm", "cmMvpd"],
      PREMIUM_SERVICE_TITLE_BY_KEY: {
        restV2: "REST V2",
        esmWorkspace: "ESM",
        degradation: "DEGRADATION",
        resetTempPass: "TempPASS",
        cm: "Concurrency Monitoring",
        cmMvpd: "Concurrency Monitoring (MVPD)",
      },
      PREMIUM_SERVICE_DOCUMENTATION_URL_BY_KEY: {
        restV2: "https://developer.adobe.com/adobe-pass/api/rest_api_v2/interactive/",
        esmWorkspace: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/features-premium/esm/entitlement-service-monitoring-api",
      },
      getActiveAdobePassEnvironment: () => ({ key: "prequal-staging", label: "Prequal Staging" }),
      isPremiumServiceSupportedInEnvironment: (serviceKey, environment) =>
        !(String(serviceKey || "").trim() === "esmWorkspace" && environment?.key === "prequal-staging"),
      getPremiumServiceUnsupportedReason: (serviceKey, environment) =>
        String(serviceKey || "").trim() === "esmWorkspace" && environment?.key === "prequal-staging"
          ? "ESM is not provisioned in Prequal Staging."
          : "",
    }
  );

  assert.equal(shouldShowCmService({ matchedTenants: [{ id: "tenant-1" }] }), true);
  assert.equal(shouldShowCmService({ matchedTenants: [] }), false);

  const services = {
    restV2: { guid: "rest-app" },
    esm: { guid: "esm-app" },
  };

  assert.deepEqual(normalizeRealmValue(getRawDetectedPremiumServiceKeys(services)), ["restV2", "esmWorkspace"]);
  assert.deepEqual(normalizeRealmValue(getDetectedPremiumServiceKeys(services)), ["restV2"]);
  assert.deepEqual(normalizeRealmValue(getDisabledDetectedPremiumServiceEntries(services)), [
    {
      serviceKey: "esmWorkspace",
      label: "ESM",
      documentationUrl:
        "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/features-premium/esm/entitlement-service-monitoring-api",
      disabled: true,
      reason: "ESM is not provisioned in Prequal Staging.",
    },
  ]);
  assert.deepEqual(normalizeRealmValue(getRenderablePremiumServiceEntries(services)), [
    {
      serviceKey: "restV2",
      label: "REST V2",
      documentationUrl: "https://developer.adobe.com/adobe-pass/api/rest_api_v2/interactive/",
      disabled: false,
      reason: "",
    },
    {
      serviceKey: "esmWorkspace",
      label: "ESM",
      documentationUrl:
        "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/features-premium/esm/entitlement-service-monitoring-api",
      disabled: true,
      reason: "ESM is not provisioned in Prequal Staging.",
    },
  ]);
});
