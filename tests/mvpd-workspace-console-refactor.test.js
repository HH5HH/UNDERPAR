const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

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

function loadMvpdWorkspaceConsoleHelpers() {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : []) { const text = String(value || '').trim(); if (text) { return text; } } return ''; }",
    "function redactSensitiveTokenValues(value) { return String(value || ''); }",
    extractFunctionSource(source, "toEntryValueString"),
    extractFunctionSource(source, "flattenPrimitiveFields"),
    extractFunctionSource(source, "mvpdWorkspaceNormalizeFlatValue"),
    extractFunctionSource(source, "mvpdWorkspaceCollectFlatEntries"),
    extractFunctionSource(source, "mvpdWorkspaceNormalizeEntityRef"),
    extractFunctionSource(source, "mvpdWorkspaceCollectReferenceValues"),
    extractFunctionSource(source, "mvpdWorkspaceCollectConsolePrimaryEntityRefs"),
    extractFunctionSource(source, "mvpdWorkspaceBuildAdditionalEntries"),
    extractFunctionSource(source, "mvpdWorkspaceCollectChipValues"),
    extractFunctionSource(source, "mvpdWorkspaceFilterChipValues"),
    extractFunctionSource(source, "mvpdWorkspaceBuildMappedChipValues"),
    extractFunctionSource(source, "mvpdWorkspaceIsLikelyResourceId"),
    extractFunctionSource(source, "mvpdWorkspaceResolveResourceChipState"),
    "module.exports = { mvpdWorkspaceCollectConsolePrimaryEntityRefs, mvpdWorkspaceBuildAdditionalEntries, mvpdWorkspaceResolveResourceChipState };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    decodeURIComponent,
    Set,
    Map,
    WeakSet,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadMvpdWorkspaceLogoHelpers(fetchImpl = async () => "") {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    'const MVPD_LOGO_FAILURE_COOLDOWN_MS = 5 * 60 * 1000;',
    "const state = { mvpdLogoCacheByUrl: new Map(), mvpdLogoResolvePromiseByUrl: new Map() };",
    "async function fetchImageDataUrlViaBackground(url) { return globalThis.__fetchImageDataUrlViaBackground(url); }",
    extractFunctionSource(source, "normalizeRestV2MvpdLogoUrl"),
    extractFunctionSource(source, "getMvpdWorkspaceLogoCacheEntry"),
    extractFunctionSource(source, "setMvpdWorkspaceLogoCacheEntry"),
    extractFunctionSource(source, "ensureMvpdWorkspaceLogoResolved"),
    "module.exports = { state, getMvpdWorkspaceLogoCacheEntry, setMvpdWorkspaceLogoCacheEntry, ensureMvpdWorkspaceLogoResolved, normalizeRestV2MvpdLogoUrl };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    Map,
    Date,
    URL,
    __fetchImageDataUrlViaBackground: fetchImpl,
  };
  context.globalThis = context;
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function normalizeVmValue(value) {
  return JSON.parse(JSON.stringify(value));
}

test("mvpd workspace primary ref collection includes proxied MVPD and integration platform references", () => {
  const { mvpdWorkspaceCollectConsolePrimaryEntityRefs } = loadMvpdWorkspaceConsoleHelpers();
  const refs = mvpdWorkspaceCollectConsolePrimaryEntityRefs(
    {
      authenticationProviderConfigs: ["AuthenticationProviderConfiguration:auth-main"],
      authorizationProviderConfigs: ["AuthorizationProviderConfiguration:authz-main"],
      logoutProviderConfigs: ["LogoutProviderConfiguration:logout-main"],
      platformSettings: {
        web: "PlatformConfiguration:web-main",
      },
      proxiedMvpds: {
        east: "MvpdProxy:mvpd-east",
      },
    },
    {
      platformConfigurations: {
        roku: "PlatformConfiguration:roku-main",
      },
      platformTraitConfigurations: {
        hdr: ["PlatformTraitConfiguration:hdr-main", "PlatformTraitConfiguration:dolby-main"],
      },
    }
  );

  assert.deepEqual(
    new Set(refs),
    new Set([
      "AuthenticationProviderConfiguration:auth-main",
      "AuthorizationProviderConfiguration:authz-main",
      "LogoutProviderConfiguration:logout-main",
      "PlatformConfiguration:web-main",
      "MvpdProxy:mvpd-east",
      "PlatformConfiguration:roku-main",
      "PlatformTraitConfiguration:hdr-main",
      "PlatformTraitConfiguration:dolby-main",
    ])
  );
});

test("mvpd workspace additional entries skip covered top-level keys even for array paths", () => {
  const { mvpdWorkspaceBuildAdditionalEntries } = loadMvpdWorkspaceConsoleHelpers();
  const entries = mvpdWorkspaceBuildAdditionalEntries(
    "Selected MVPD",
    {
      clientData: {
        mode: "proxy",
      },
      configuration: [
        {
          strategy: "primary",
        },
      ],
      extraInfo: {
        enabled: true,
      },
    },
    new Set(["clientData", "configuration"]),
    {
      maxEntries: 40,
      maxDepth: 5,
    }
  );

  assert(entries.some((entry) => entry.path === "extraInfo.enabled" && entry.value === "true"));
  assert(entries.every((entry) => !entry.path.startsWith("clientData")));
  assert(entries.every((entry) => !entry.path.startsWith("configuration[")));
});

test("mvpd workspace resource chips prefer the selected MVPD TMS map over default", () => {
  const { mvpdWorkspaceResolveResourceChipState } = loadMvpdWorkspaceConsoleHelpers();
  const result = mvpdWorkspaceResolveResourceChipState(
    [
      {
        source: "Selected MVPD",
        path: "resourceIds",
        value: "resource.alpha",
      },
      {
        source: "tmsIdMap_espn",
        path: "mapping.ESPNEast",
        value: "resource.alpha",
      },
      {
        source: "tmsIdMap_default",
        path: "mapping.DefaultEast",
        value: "resource.alpha",
      },
    ],
    [
      {
        ok: true,
        key: "tmsIdMap_espn",
        label: "TMSID Map (espn)",
        url: "https://console.example/rest/api/entity/TMSIdMap/espn",
      },
      {
        ok: true,
        key: "tmsIdMap_default",
        label: "TMSID Map (default)",
        url: "https://console.example/rest/api/entity/TMSIdMap/default",
      },
    ],
    {
      mvpdId: "espn",
    }
  );

  assert.deepEqual(normalizeVmValue(result.loadedTmsMapIds), ["espn", "default"]);
  assert.equal(result.activeTmsMapKey, "espn");
  assert.deepEqual(normalizeVmValue(result.finalResourceIdChips), [
    {
      label: "ESPNEast",
      rawValue: "resource.alpha",
    },
  ]);
  assert.deepEqual(normalizeVmValue(result.finalResourceIds), ["ESPNEast"]);
  assert.deepEqual(normalizeVmValue(result.finalResourceIdsRaw), ["resource.alpha"]);
});

test("mvpd workspace resource chips fall back to discovered resource IDs when no TMS map is available", () => {
  const { mvpdWorkspaceResolveResourceChipState } = loadMvpdWorkspaceConsoleHelpers();
  const result = mvpdWorkspaceResolveResourceChipState(
    [
      {
        source: "Selected MVPD",
        path: "authorization.resourceIds",
        value: "resource.beta, resource.gamma",
      },
    ],
    [],
    {
      mvpdId: "unknown-mvpd",
    }
  );

  assert.equal(result.activeTmsMapKey, "");
  assert.deepEqual(normalizeVmValue(result.finalResourceIdChips), [
    {
      label: "resource.beta",
      rawValue: "resource.beta",
    },
    {
      label: "resource.gamma",
      rawValue: "resource.gamma",
    },
  ]);
  assert.deepEqual(normalizeVmValue(result.finalResourceIdsRaw), ["resource.beta", "resource.gamma"]);
});

test("mvpd workspace logo resolver caches a successful background image resolution", async () => {
  let fetchCount = 0;
  const helpers = loadMvpdWorkspaceLogoHelpers(async () => {
    fetchCount += 1;
    return "data:image/png;base64,ZmFrZS1sb2dv";
  });
  const logoUrl = "https://logos.example.test/comcast.png";

  const first = await helpers.ensureMvpdWorkspaceLogoResolved(logoUrl);
  const second = await helpers.ensureMvpdWorkspaceLogoResolved(logoUrl);
  const cachedEntry = helpers.getMvpdWorkspaceLogoCacheEntry(logoUrl);

  assert.equal(first, "data:image/png;base64,ZmFrZS1sb2dv");
  assert.equal(second, "data:image/png;base64,ZmFrZS1sb2dv");
  assert.equal(fetchCount, 1);
  assert.equal(cachedEntry?.status, "loaded");
  assert.equal(cachedEntry?.resolvedUrl, "data:image/png;base64,ZmFrZS1sb2dv");
});

test("mvpd workspace logo resolver cools down failed image fetches instead of retrying every redraw", async () => {
  let fetchCount = 0;
  const helpers = loadMvpdWorkspaceLogoHelpers(async () => {
    fetchCount += 1;
    return "";
  });
  const logoUrl = "https://logos.example.test/fails.png";

  const first = await helpers.ensureMvpdWorkspaceLogoResolved(logoUrl);
  const second = await helpers.ensureMvpdWorkspaceLogoResolved(logoUrl);
  const cachedEntry = helpers.getMvpdWorkspaceLogoCacheEntry(logoUrl);

  assert.equal(first, "");
  assert.equal(second, "");
  assert.equal(fetchCount, 1);
  assert.equal(cachedEntry?.status, "failed");
});
