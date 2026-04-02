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

function loadMvpdSearchHelpers() {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : []) { const text = String(value ?? '').trim(); if (text) { return text; } } return ''; }",
    extractFunctionSource(source, "mvpdWorkspaceNormalizeEntityRef"),
    extractFunctionSource(source, "mvpdWorkspaceSplitEntityRef"),
    extractFunctionSource(source, "mvpdWorkspaceGetEntityData"),
    extractFunctionSource(source, "extractEntityIdFromToken"),
    extractFunctionSource(source, "normalizeApplicationsResponse"),
    extractFunctionSource(source, "normalizeUpDevtoolsMvpdSearchCatalogKey"),
    extractFunctionSource(source, "buildUpDevtoolsMvpdSearchResultKey"),
    extractFunctionSource(source, "buildUpDevtoolsMvpdSearchRows"),
    extractFunctionSource(source, "filterUpDevtoolsMvpdSearchRows"),
    "module.exports = { buildUpDevtoolsMvpdSearchRows, filterUpDevtoolsMvpdSearchRows };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    Map,
    Set,
    Object,
    Array,
    String,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadMvpdSearchCatalogBuilder(fetchStub) {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : []) { const text = String(value ?? '').trim(); if (text) { return text; } } return ''; }",
    "function getActiveAdobePassEnvironmentKey() { return 'release-production'; }",
    "function resolveAdobePassEnvironment(environmentKey = '') { return { key: String(environmentKey || '').trim(), label: 'Release Production', consoleBase: 'https://console.example.test' }; }",
    "function buildAdobeConsoleRestApiUrl(path = '', base = '') { return `${String(base || '').replace(/\\/$/, '')}/${String(path || '').replace(/^\\//, '')}`; }",
    "function appendAdobeConsoleConfigurationVersion(url = '', configurationVersion = 0) { return configurationVersion > 0 ? `${url}${url.includes('?') ? '&' : '?'}configurationVersion=${configurationVersion}` : url; }",
    "function mvpdWorkspaceExtractConfigurationVersion(parsed = null, fallback = 0) { return Number(parsed?.configurationVersion || fallback || 0); }",
    "async function mvpdWorkspaceFetchCall(action, label, urls, options, debugContext) { return globalThis.__fetchStub(action, label, urls, options, debugContext); }",
    extractFunctionSource(source, "mvpdWorkspaceNormalizeEntityRef"),
    extractFunctionSource(source, "mvpdWorkspaceSplitEntityRef"),
    extractFunctionSource(source, "mvpdWorkspaceGetEntityData"),
    extractFunctionSource(source, "extractEntityIdFromToken"),
    extractFunctionSource(source, "normalizeApplicationsResponse"),
    extractFunctionSource(source, "normalizeUpDevtoolsMvpdSearchCatalogKey"),
    extractFunctionSource(source, "buildUpDevtoolsMvpdSearchResultKey"),
    extractFunctionSource(source, "buildUpDevtoolsMvpdSearchRows"),
    extractFunctionSource(source, "buildUpDevtoolsMvpdSearchCatalog"),
    "module.exports = { buildUpDevtoolsMvpdSearchCatalog };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    Map,
    Set,
    Object,
    Array,
    String,
    JSON,
    Date,
    globalThis: {
      __fetchStub: fetchStub,
    },
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadMvpdSearchSubmitHarness(options = {}) {
  const filePath = path.join(ROOT, "up-devtools-panel.js");
  const source = fs.readFileSync(filePath, "utf8");
  const panelState = {
    mvpdSearchBusy: false,
    mvpdSearchViewBusyKey: "",
    mvpdSearchQuery: "",
    mvpdSearchResultRows: [],
    mvpdSearchLastEnvironmentKey: "",
    environmentsLoaded: true,
    ...(options.panelState && typeof options.panelState === "object" ? options.panelState : {}),
  };
  const renderCalls = [];
  const syncCalls = [];
  const badgeCalls = [];
  const statusCalls = [];
  const rebuildCalls = [];
  const script = [
    extractFunctionSource(source, "handleMvpdSearchSubmit"),
    "module.exports = { handleMvpdSearchSubmit };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    panelState,
    mvpdSearchInput: {
      value: String(options.query || ""),
    },
    getActivePanelEnvironment:
      typeof options.getActivePanelEnvironment === "function"
        ? options.getActivePanelEnvironment
        : () => ({ key: "release-production", label: "Release Production" }),
    syncInteractiveControlState: () => {
      syncCalls.push({ busy: panelState.mvpdSearchBusy, viewBusyKey: panelState.mvpdSearchViewBusyKey });
    },
    setMvpdSearchBadgeState: (...args) => {
      badgeCalls.push(args);
    },
    renderMvpdSearchResults: (rows, renderOptions) => {
      renderCalls.push({
        busy: panelState.mvpdSearchBusy,
        rows: normalizeVmValue(rows),
        options: normalizeVmValue(renderOptions || {}),
      });
    },
    sendVaultActionRequest:
      typeof options.sendVaultActionRequest === "function"
        ? options.sendVaultActionRequest
        : async () => ({
            results: [],
            environmentKey: "release-production",
          }),
    rebuildMvpdSearchResultIndex: (rows) => {
      rebuildCalls.push(normalizeVmValue(rows));
    },
    setMvpdSearchStatusMessage: (...args) => {
      statusCalls.push(args);
    },
    String,
    Array,
    Object,
    Number,
    Math,
    JSON,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return {
    panelState,
    renderCalls,
    syncCalls,
    badgeCalls,
    statusCalls,
    rebuildCalls,
    handleMvpdSearchSubmit: context.module.exports.handleMvpdSearchSubmit,
  };
}

function normalizeVmValue(value) {
  return JSON.parse(JSON.stringify(value));
}

test("UP DevTools exposes an ENV-scoped MVPD search card and requestorless workspace handoff", () => {
  const devtoolsHtml = read("up-devtools-panel.html");
  const devtoolsCss = read("up-devtools-panel.css");
  const devtoolsJs = read("up-devtools-panel.js");
  const popupSource = read("popup.js");
  const workspaceSource = read("mvpd-workspace.js");
  const catalogSource = extractFunctionSource(popupSource, "buildUpDevtoolsMvpdSearchCatalog");

  assert.match(devtoolsHtml, /<p class="field-label mvpd-search-label">MVPDs<\/p>/);
  assert.match(devtoolsHtml, /id="mvpd-search-input"/);
  assert.match(devtoolsHtml, /id="mvpd-search-results"/);
  assert.match(devtoolsHtml, /class="mvpd-search-field-shell"/);
  assert.match(devtoolsHtml, /class="mvpd-search-field-icon"/);
  assert.match(devtoolsHtml, /placeholder="Search"/);
  assert.doesNotMatch(devtoolsHtml, /Google-style admin MVPD search scoped only to the active UnderPAR ENV/);
  assert.doesNotMatch(devtoolsHtml, /id="mvpd-search-btn"/);
  assert.doesNotMatch(devtoolsHtml, /id="mvpd-search-status"/);
  assert.doesNotMatch(devtoolsHtml, /id="mvpd-search-badge"/);

  assert.match(devtoolsCss, /\.mvpd-search-card/);
  assert.match(devtoolsCss, /\.mvpd-search-field-shell/);
  assert.match(devtoolsCss, /\.mvpd-search-field-icon/);
  assert.match(devtoolsCss, /\.mvpd-search-results-scroll/);
  assert.match(devtoolsCss, /\.mvpd-search-table/);
  assert.match(devtoolsCss, /\.mvpd-search-name-btn/);
  assert.match(devtoolsCss, /\.mvpd-search-name-action/);
  assert.match(devtoolsCss, /\.mvpd-search-owner-btn/);
  assert.match(devtoolsCss, /\.mvpd-search-owner-action/);
  assert.match(devtoolsCss, /\.mvpd-search-associated/);
  assert.match(devtoolsCss, /\.mvpd-search-owner-meta/);
  assert.match(devtoolsCss, /\.mvpd-search-table-empty-row td/);
  assert.doesNotMatch(devtoolsCss, /\.mvpd-search-view-btn/);

  assert.match(devtoolsJs, /const canSearch = panelState\.environmentsLoaded && !panelState\.switchBusy;/);
  assert.match(devtoolsJs, /sendVaultActionRequest\("search-env-mvpds"/);
  assert.match(devtoolsJs, /sendVaultActionRequest\("open-mvpd-search-result"/);
  assert.match(devtoolsJs, /No MVPDs found\./);
  assert.match(devtoolsJs, /class="mvpd-search-name-btn"/);
  assert.match(devtoolsJs, /class="mvpd-search-owner-btn"/);
  assert.match(devtoolsJs, /class="mvpd-search-name-action"/);
  assert.match(devtoolsJs, /class="mvpd-search-owner-action"/);
  assert.match(devtoolsJs, /class="mvpd-search-owner-btn"/);
  assert.match(devtoolsJs, /Channels \/ Requestors \(\$\{associatedServiceProviderCount\}\):/);
  assert.match(devtoolsJs, /Load the active UnderPAR environment before searching MVPDs\./);
  assert.doesNotMatch(devtoolsJs, /<th>View<\/th>/);
  assert.doesNotMatch(devtoolsJs, /mvpd-search-results-summary/);

  assert.match(popupSource, /function buildUpDevtoolsMvpdSearchCatalog\(/);
  assert.match(catalogSource, /buildEntityUrl\("entity\/Mvpd"\)/);
  assert.match(catalogSource, /buildEntityUrl\("entity\/MvpdProxy"\)/);
  assert.match(catalogSource, /buildEntityUrl\("entity\/IntegrationConfiguration"\)/);
  assert.match(popupSource, /Object\.values\(record\.data\.proxiedMvpds\)/);
  assert.match(catalogSource, /upDevtoolsProxiedMvpdCatalog/);
  assert.match(catalogSource, /buildAdobeConsoleRestApiUrl\("entity\/bulkRetrieve"/);
  assert.match(popupSource, /workspaceKey:\s*"up-devtools-mvpd-search"/);
  assert.match(popupSource, /if \(action === "search-env-mvpds"\)/);
  assert.match(popupSource, /if \(action === "open-mvpd-search-result"\)/);
  assert.match(popupSource, /upDevtoolsPendingMvpdWorkspaceOpenByWindowId: new Map\(\)/);
  assert.match(popupSource, /consumePendingUpDevtoolsMvpdWorkspaceOpen\(senderWindowId\)/);
  assert.match(popupSource, /launchUpDevtoolsMvpdSearchResultInWorkspace\(/);
  assert.match(popupSource, /requestorId:\s*""/);
  assert.match(popupSource, /programmerId:\s*""/);

  assert.match(workspaceSource, /workspace-filter-pill-value">ENV Search<\/span>/);
  assert.match(workspaceSource, /const requestorId = String\(payload\?\.requestorId \|\| getSelectedRequestorId\(\) \|\| ""\)\.trim\(\);/);
  assert.match(workspaceSource, /const label = requestorId && mvpdDisplayLabel \? `\$\{requestorId\} x \$\{mvpdDisplayLabel\}` : mvpdDisplayLabel \|\| "selected MVPD";/);
});

test("UP DevTools MVPD search builds direct and proxied rows from MVPD, proxied MVPD, proxy, and integration catalogs", () => {
  const { buildUpDevtoolsMvpdSearchRows } = loadMvpdSearchHelpers();
  const built = buildUpDevtoolsMvpdSearchRows(
    {
      entities: [
        {
          key: "Mvpd:turner",
          entityData: {
            id: "Turner",
            displayName: "Turner Direct",
            proxiedMvpds: {
              adultSwim: "MvpdProxy:AdultSwim",
              claroPuertoRico: "MvpdProxy:nrtccpr010",
            },
          },
        },
        {
          key: "Mvpd:directonly",
          entityData: {
            id: "DirectOnly",
            displayName: "Direct Only",
          },
        },
      ],
    },
    {
      entities: [
        {
          key: "MvpdProxy:adultswim",
          entityData: {
            id: "AdultSwim",
            displayName: "Adult Swim Proxy",
            owner: "Mvpd:Turner",
            serviceProviderIds: ["adultswim", "cartoonnetwork"],
          },
        },
        {
          key: "MvpdProxy:nrtccpr010",
          entityData: {
            id: "nrtccpr010",
            displayName: "Claro Puerto Rico",
            owner: "Mvpd:Turner",
            serviceProviderIds: ["adultswim", "cartoonnetwork"],
          },
        },
      ],
    },
    {
      entities: [
        {
          key: "MvpdProxy:adultswim",
          entityData: {
            id: "AdultSwim",
            owner: "Mvpd:Turner",
          },
        },
        {
          key: "MvpdProxy:nrtccpr010",
          entityData: {
            id: "nrtccpr010",
            owner: "Mvpd:Turner",
          },
        },
      ],
    },
    {
      entities: [
        {
          key: "IntegrationConfiguration:turner_adultswim",
          entityData: {
            id: "turner_adultswim",
            owner: "Mvpd:Turner",
            serviceProvider: "ServiceProvider:adultswim",
            enabled: true,
          },
        },
        {
          key: "IntegrationConfiguration:turner_cartoonnetwork",
          entityData: {
            id: "turner_cartoonnetwork",
            owner: "Mvpd:Turner",
            serviceProvider: "ServiceProvider:cartoonnetwork",
            enabled: false,
          },
        },
        {
          key: "IntegrationConfiguration:directonly_directonly",
          entityData: {
            id: "directonly_directonly",
            owner: "Mvpd:DirectOnly",
            serviceProvider: "ServiceProvider:directonly",
            enabled: true,
          },
        },
      ],
    }
  );

  const rows = normalizeVmValue(built.rows);
  const rowByKey = Object.fromEntries(rows.map((row) => [row.resultKey, row]));

  assert.equal(rowByKey["mvpdproxy:adultswim"].displayName, "Adult Swim Proxy");
  assert.equal(rowByKey["mvpdproxy:adultswim"].proxyOwnerLabel, "Turner Direct (Turner)");
  assert.deepEqual(rowByKey["mvpdproxy:adultswim"].associatedServiceProviderIds, ["adultswim", "cartoonnetwork"]);
  assert.equal(rowByKey["mvpdproxy:adultswim"].integrationCount, 2);
  assert.equal(rowByKey["mvpdproxy:adultswim"].enabledIntegrationCount, 1);
  assert.match(rowByKey["mvpdproxy:adultswim"].searchText, /adult swim proxy/);

  assert.equal(rowByKey["mvpdproxy:nrtccpr010"].displayName, "Claro Puerto Rico");
  assert.equal(rowByKey["mvpdproxy:nrtccpr010"].proxyOwnerLabel, "Turner Direct (Turner)");
  assert.deepEqual(rowByKey["mvpdproxy:nrtccpr010"].associatedServiceProviderIds, ["adultswim", "cartoonnetwork"]);
  assert.equal(rowByKey["mvpdproxy:nrtccpr010"].integrationCount, 2);
  assert.equal(rowByKey["mvpdproxy:nrtccpr010"].enabledIntegrationCount, 1);
  assert.match(rowByKey["mvpdproxy:nrtccpr010"].searchText, /claro puerto rico/);
  assert.match(rowByKey["mvpdproxy:nrtccpr010"].searchText, /nrtccpr010/);

  assert.deepEqual(rowByKey["mvpd:directonly"].associatedServiceProviderIds, ["directonly"]);
  assert.equal(rowByKey["mvpd:directonly"].integrationCount, 1);
  assert.equal(rowByKey["mvpd:directonly"].enabledIntegrationCount, 1);

  assert.deepEqual(rowByKey["mvpd:turner"].associatedServiceProviderIds, ["adultswim", "cartoonnetwork"]);
  assert.equal(rowByKey["mvpd:turner"].integrationCount, 2);
  assert.equal(rowByKey["mvpd:turner"].enabledIntegrationCount, 1);
});

test("UP DevTools MVPD search filter matches normalized MVPD names, ids, owners, and requestor tokens", () => {
  const { filterUpDevtoolsMvpdSearchRows } = loadMvpdSearchHelpers();
  const rows = [
    {
      id: "AdultSwim",
      entityType: "mvpdproxy",
      searchText: "adult swim proxy adultswim turner direct turner cartoonnetwork proxy mvpd",
    },
    {
      id: "CartoonNetwork",
      entityType: "mvpdproxy",
      searchText: "cartoon network proxied cartoonnetwork turner direct turner proxy mvpd",
    },
    {
      id: "Turner",
      entityType: "mvpd",
      searchText: "turner direct turner direct mvpd",
    },
    {
      id: "DirectOnly",
      entityType: "mvpd",
      searchText: "direct only directonly direct mvpd",
    },
    {
      id: "nrtccpr010",
      entityType: "mvpdproxy",
      searchText: "claro puerto rico nrtccpr010 turner direct turner adultswim cartoonnetwork proxied mvpd proxy mvpd",
    },
  ];

  const turnerCartoonMatches = normalizeVmValue(filterUpDevtoolsMvpdSearchRows(rows, "turner cartoon"));
  assert(turnerCartoonMatches.some((row) => row.id === "CartoonNetwork"));
  assert.deepEqual(
    normalizeVmValue(filterUpDevtoolsMvpdSearchRows(rows, "directonly")),
    [rows[3]]
  );
  assert.deepEqual(
    normalizeVmValue(filterUpDevtoolsMvpdSearchRows(rows, "claro pr")),
    [rows[4]]
  );
  assert.deepEqual(
    normalizeVmValue(filterUpDevtoolsMvpdSearchRows(rows, "claro nrtccpr010")),
    [rows[4]]
  );
  assert.deepEqual(
    normalizeVmValue(filterUpDevtoolsMvpdSearchRows(rows, "turner adultswim cartoonnetwork")),
    [rows[0], rows[4]]
  );
});

test("UP DevTools MVPD search resolves proxy-parent owners and exposes an owner workspace target", () => {
  const { buildUpDevtoolsMvpdSearchRows } = loadMvpdSearchHelpers();
  const built = buildUpDevtoolsMvpdSearchRows(
    {
      entities: [
        {
          key: "Mvpd:turner",
          entityData: {
            id: "Turner",
            displayName: "Turner Direct",
          },
        },
      ],
    },
    {
      entities: [
        {
          key: "MvpdProxy:nrtccpr010",
          entityData: {
            id: "nrtccpr010",
            displayName: "Claro Puerto Rico",
            owner: "MvpdProxy:claroParent",
            serviceProviderIds: ["nbade"],
          },
        },
      ],
    },
    {
      entities: [
        {
          key: "MvpdProxy:claroParent",
          entityData: {
            id: "claroParent",
            displayName: "Claro Parent Proxy",
            owner: "Mvpd:Turner",
            proxiedMvpds: {
              claroPuertoRico: "MvpdProxy:nrtccpr010",
            },
          },
        },
        {
          key: "MvpdProxy:nrtccpr010",
          entityData: {
            id: "nrtccpr010",
            owner: "MvpdProxy:claroParent",
          },
        },
      ],
    },
    {
      entities: [
        {
          key: "IntegrationConfiguration:turner_nbade",
          entityData: {
            id: "turner_nbade",
            owner: "Mvpd:Turner",
            serviceProvider: "ServiceProvider:NBADE",
            enabled: true,
          },
        },
      ],
    }
  );

  const rows = normalizeVmValue(built.rows);
  const rowByKey = Object.fromEntries(rows.map((row) => [row.resultKey, row]));

  assert.equal(rowByKey["mvpdproxy:nrtccpr010"].proxyOwnerLabel, "Claro Parent Proxy (claroParent)");
  assert.equal(rowByKey["mvpdproxy:nrtccpr010"].proxyOwnerEntityType, "mvpdproxy");
  assert.equal(rowByKey["mvpdproxy:nrtccpr010"].proxyOwnerResultKey, "mvpdproxy:claroparent");
});

test("UP DevTools MVPD search catalog bulk-loads proxied MVPD refs declared by proxy parents", async () => {
  const fetchCalls = [];
  const { buildUpDevtoolsMvpdSearchCatalog } = loadMvpdSearchCatalogBuilder(async (action, label, urls, options) => {
    fetchCalls.push({
      action,
      label,
      urls: normalizeVmValue(urls),
      body: options?.body ? JSON.parse(options.body) : null,
    });
    if (action === "upDevtoolsMvpdSearchConfigurationVersion") {
      return { ok: true, parsed: { configurationVersion: 3709 } };
    }
    if (action === "upDevtoolsMvpdCatalog") {
      return {
        ok: true,
        parsed: {
          entities: [],
        },
      };
    }
    if (action === "upDevtoolsMvpdProxyCatalog") {
      return {
        ok: true,
        parsed: {
          entities: [
            {
              key: "MvpdProxy:claroprparent",
              entityData: {
                id: "claroprparent",
                displayName: "Claro Parent Proxy",
                proxiedMvpds: {
                  claroPuertoRico: "MvpdProxy:nrtccpr010",
                },
              },
            },
          ],
        },
      };
    }
    if (action === "upDevtoolsIntegrationConfigurationCatalog") {
      return {
        ok: true,
        parsed: {
          entities: [],
        },
      };
    }
    if (action === "upDevtoolsProxiedMvpdCatalog") {
      return {
        ok: true,
        parsed: {
          entities: [
            {
              key: "MvpdProxy:nrtccpr010",
              entityData: {
                id: "nrtccpr010",
                displayName: "Claro Puerto Rico",
                owner: "MvpdProxy:claroprparent",
                serviceProviderIds: ["nbade"],
              },
            },
          ],
        },
      };
    }
    throw new Error(`Unexpected action: ${action}`);
  });

  const catalog = await buildUpDevtoolsMvpdSearchCatalog("release-production");
  const proxiedCall = fetchCalls.find((call) => call.action === "upDevtoolsProxiedMvpdCatalog");

  assert(proxiedCall, "Expected proxied MVPD bulk retrieve call.");
  assert.deepEqual(normalizeVmValue(proxiedCall.body?.entities), ["MvpdProxy:nrtccpr010"]);

  const rows = normalizeVmValue(catalog.rows);
  const claroRow = rows.find((row) => row.id === "nrtccpr010");
  assert(claroRow, "Expected Claro Puerto Rico to be indexed in MVPD search results.");
  assert.equal(claroRow.displayName, "Claro Puerto Rico");
  assert.match(claroRow.searchText, /claro puerto rico/);
  assert.match(claroRow.searchText, /nrtccpr010/);
});

test("UP DevTools MVPD search re-renders results after busy clears so MVPD workspace links remain clickable", async () => {
  const harness = loadMvpdSearchSubmitHarness({
    query: "blue",
    sendVaultActionRequest: async () => ({
      results: [
        {
          entityType: "mvpdproxy",
          id: "blue001",
          displayName: "Blue Proxy",
        },
      ],
      environmentKey: "release-production",
    }),
  });

  await harness.handleMvpdSearchSubmit();

  assert.equal(harness.renderCalls.length >= 3, true);
  assert.equal(harness.renderCalls[0].busy, true);
  assert.equal(harness.renderCalls.at(-1).busy, false);
  assert.deepEqual(harness.renderCalls.at(-1).rows, [
    {
      entityType: "mvpdproxy",
      id: "blue001",
      displayName: "Blue Proxy",
    },
  ]);
});
