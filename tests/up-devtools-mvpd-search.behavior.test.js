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

function normalizeVmValue(value) {
  return JSON.parse(JSON.stringify(value));
}

test("UP DevTools exposes an ENV-scoped MVPD search card and requestorless workspace handoff", () => {
  const devtoolsHtml = read("up-devtools-panel.html");
  const devtoolsCss = read("up-devtools-panel.css");
  const devtoolsJs = read("up-devtools-panel.js");
  const popupSource = read("popup.js");
  const workspaceSource = read("mvpd-workspace.js");

  assert.match(devtoolsHtml, /<p class="field-label mvpd-search-label">MVPDs<\/p>/);
  assert.match(devtoolsHtml, /id="mvpd-search-input"/);
  assert.match(devtoolsHtml, /id="mvpd-search-results"/);
  assert.match(devtoolsHtml, /placeholder="Search"/);
  assert.doesNotMatch(devtoolsHtml, /Google-style admin MVPD search scoped only to the active UnderPAR ENV/);
  assert.doesNotMatch(devtoolsHtml, /id="mvpd-search-btn"/);
  assert.doesNotMatch(devtoolsHtml, /id="mvpd-search-status"/);
  assert.doesNotMatch(devtoolsHtml, /id="mvpd-search-badge"/);

  assert.match(devtoolsCss, /\.mvpd-search-card/);
  assert.match(devtoolsCss, /\.mvpd-search-results-scroll/);
  assert.match(devtoolsCss, /\.mvpd-search-table/);
  assert.match(devtoolsCss, /\.mvpd-search-view-btn/);
  assert.match(devtoolsCss, /\.mvpd-search-name-btn/);
  assert.match(devtoolsCss, /\.mvpd-search-table-empty-row td/);

  assert.match(devtoolsJs, /const canSearch = panelState\.environmentsLoaded && !panelState\.switchBusy;/);
  assert.match(devtoolsJs, /sendVaultActionRequest\("search-env-mvpds"/);
  assert.match(devtoolsJs, /sendVaultActionRequest\("open-mvpd-search-result"/);
  assert.match(devtoolsJs, /No MVPDs found\./);
  assert.match(devtoolsJs, /class="mvpd-search-name-btn"/);
  assert.match(devtoolsJs, /Load the active UnderPAR environment before searching MVPDs\./);
  assert.doesNotMatch(devtoolsJs, /mvpd-search-results-summary/);

  assert.match(popupSource, /function buildUpDevtoolsMvpdSearchCatalog\(/);
  assert.match(popupSource, /buildEntityUrl\("entity\/Mvpd"\)/);
  assert.match(popupSource, /Object\.values\(entityData\.proxiedMvpds\)/);
  assert.match(popupSource, /upDevtoolsProxiedMvpdCatalog/);
  assert.match(popupSource, /buildAdobeConsoleRestApiUrl\("entity\/bulkRetrieve"/);
  assert.match(popupSource, /workspaceKey:\s*"up-devtools-mvpd-search"/);
  assert.match(popupSource, /if \(action === "search-env-mvpds"\)/);
  assert.match(popupSource, /if \(action === "open-mvpd-search-result"\)/);
  assert.match(popupSource, /requestorId:\s*""/);
  assert.match(popupSource, /programmerId:\s*""/);

  assert.match(workspaceSource, /workspace-filter-pill-value">ENV Search<\/span>/);
  assert.match(workspaceSource, /const requestorId = String\(payload\?\.requestorId \|\| getSelectedRequestorId\(\) \|\| ""\)\.trim\(\);/);
  assert.match(workspaceSource, /const label = requestorId && mvpdDisplayLabel \? `\$\{requestorId\} x \$\{mvpdDisplayLabel\}` : mvpdDisplayLabel \|\| "selected MVPD";/);
});

test("UP DevTools MVPD search builds direct and proxied rows using proxied MVPD ownership", () => {
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
            serviceProviderIds: ["adultswim", "cartoonnetwork"],
          },
        },
      ],
    }
  );

  const rows = normalizeVmValue(built.rows);
  assert.deepEqual(rows, [
    {
      resultKey: "mvpdproxy:adultswim",
      entityType: "mvpdproxy",
      id: "AdultSwim",
      displayName: "Adult Swim Proxy",
      proxyOwnerId: "Turner",
      proxyOwnerName: "Turner Direct",
      proxyOwnerLabel: "Turner Direct (Turner)",
      searchText: "adult swim proxy adultswim turner direct turner turner direct (turner) adultswim cartoonnetwork proxied mvpd proxy mvpd",
    },
    {
      resultKey: "mvpd:directonly",
      entityType: "mvpd",
      id: "DirectOnly",
      displayName: "Direct Only",
      proxyOwnerId: "",
      proxyOwnerName: "",
      proxyOwnerLabel: "DIRECT MVPD",
      searchText: "direct only directonly direct mvpd",
    },
    {
      resultKey: "mvpd:turner",
      entityType: "mvpd",
      id: "Turner",
      displayName: "Turner Direct",
      proxyOwnerId: "",
      proxyOwnerName: "",
      proxyOwnerLabel: "DIRECT MVPD",
      searchText: "turner direct turner direct mvpd",
    },
  ]);
});

test("UP DevTools MVPD search filter matches MVPD name, id, and proxy owner tokens", () => {
  const { filterUpDevtoolsMvpdSearchRows } = loadMvpdSearchHelpers();
  const rows = [
    {
      id: "AdultSwim",
      entityType: "mvpdproxy",
      searchText: "adult swim proxy adultswim turner direct turner proxy mvpd",
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
  ];

  assert.deepEqual(
    normalizeVmValue(filterUpDevtoolsMvpdSearchRows(rows, "adult swim")),
    [rows[0]]
  );
  assert.deepEqual(
    normalizeVmValue(filterUpDevtoolsMvpdSearchRows(rows, "turner cartoon")),
    [rows[1]]
  );
  assert.deepEqual(
    normalizeVmValue(filterUpDevtoolsMvpdSearchRows(rows, "directonly")),
    [rows[3]]
  );
});
