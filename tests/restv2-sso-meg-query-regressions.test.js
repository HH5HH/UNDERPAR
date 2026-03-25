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
  const bodyStart = source.indexOf("{", start);
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

function loadFunctions(relativePath, functionNames, globals = {}) {
  const source = read(relativePath);
  const script = [
    ...functionNames.map((name) => extractFunctionSource(source, name)),
    `module.exports = { ${functionNames.join(", ")} };`,
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    ...globals,
  };
  vm.runInNewContext(script, context, { filename: path.join(ROOT, relativePath) });
  return context.module.exports;
}

test("CM ESM Health Scope saved query names prefer the captured MVPD label without double-appending the MVPD id", () => {
  const { cmBuildEsmHealthXrefSavedQueryName } = loadFunctions("popup.js", ["cmBuildEsmHealthXrefSavedQueryName"], {
    state: {
      selectedRequestorId: "",
      selectedMvpdId: "",
    },
    firstNonEmptyString: (values = []) => values.find((value) => String(value || "").trim()) || "",
    getRestV2MvpdPickerLabel: () => "Xfinity (Comcast_SSO) (Comcast_SSO)",
    popupNormalizeSavedEsmQueryName: (value = "") => String(value || "").replace(/\s+/g, " ").trim(),
  });

  const name = cmBuildEsmHealthXrefSavedQueryName(
    {
      title: "ESM Health Scope",
      payload: {
        requestorId: "MML",
        mvpd: "Comcast_SSO",
        mvpdLabel: "Xfinity (Comcast_SSO)",
      },
    },
    null
  );

  assert.equal(name, "ESM Health Scope MML x Xfinity (Comcast_SSO)");
});

test("saved-query name normalization collapses repeated MVPD tails in popup and MEG workspace helpers", () => {
  const popupHelpers = loadFunctions("popup.js", ["popupNormalizeSavedEsmQueryName"]);
  const megHelpers = loadFunctions("meg-workspace.js", ["normalizeSavedQueryName"]);
  const duplicatedName = "ESM Health Scope MML x Xfinity (Comcast_SSO) (Comcast_SSO)";

  assert.equal(
    popupHelpers.popupNormalizeSavedEsmQueryName(duplicatedName),
    "ESM Health Scope MML x Xfinity (Comcast_SSO)"
  );
  assert.equal(
    megHelpers.normalizeSavedQueryName(duplicatedName),
    "ESM Health Scope MML x Xfinity (Comcast_SSO)"
  );
});

test("REST V2 learning refresh helper rerenders only for the active RequestorId x MVPD selection", () => {
  let refreshCall = null;
  const { maybeRefreshRestV2InteractiveDocsForContext } = loadFunctions(
    "popup.js",
    ["maybeRefreshRestV2InteractiveDocsForContext"],
    {
      state: {
        selectedRequestorId: "MML",
        selectedMvpdId: "Comcast_SSO",
      },
      resolveSelectedProgrammer: () => ({ programmerId: "Turner" }),
      isRestV2MvpdMatch: () => true,
      refreshProgrammerPanels: (options = {}) => {
        refreshCall = options;
      },
    }
  );

  assert.equal(
    maybeRefreshRestV2InteractiveDocsForContext(
      {
        programmerId: "Turner",
        requestorId: "MML",
        mvpd: "Comcast_SSO",
      },
      "rest-v2-popup-close"
    ),
    true
  );
  assert.equal(refreshCall?.controllerReason, "rest-v2-popup-close");

  refreshCall = null;
  assert.equal(
    maybeRefreshRestV2InteractiveDocsForContext(
      {
        programmerId: "Turner",
        requestorId: "NBADE",
        mvpd: "Comcast_SSO",
      },
      "rest-v2-popup-close"
    ),
    false
  );
  assert.equal(refreshCall, null);
});

test("sidepanel ESM saved-query reset defers placeholder restore until after the picker closes", () => {
  const timers = [];
  const selectElement = {
    value: "/esm/v3/media-company/year?requestor-id=MML",
    title: "Before",
    blurCalls: 0,
    blur() {
      this.blurCalls += 1;
    },
    setAttribute(name, value) {
      this[name] = value;
    },
  };
  const { resetEsmWorkspaceMegSavedQuerySelect } = loadFunctions("popup.js", ["resetEsmWorkspaceMegSavedQuerySelect"], {
    setTimeout: (callback) => {
      timers.push(callback);
      return timers.length;
    },
  });

  resetEsmWorkspaceMegSavedQuerySelect(selectElement);

  assert.equal(selectElement.value, "/esm/v3/media-company/year?requestor-id=MML");
  assert.equal(selectElement.blurCalls, 1);
  assert.equal(timers.length, 1);

  timers[0]();
  assert.equal(selectElement.value, "");
  assert.equal(selectElement.title, "Saved Queries");
  assert.equal(selectElement["aria-label"], "Saved Queries");
});

test("saved-query pickers no longer force the placeholder option into a disabled state", () => {
  const popupSource = read("popup.js");
  const megSource = read("meg-workspace.js");

  assert.doesNotMatch(popupSource, /defaultOption\.disabled\s*=\s*true;/);
  assert.doesNotMatch(megSource, /defaultOption\.disabled\s*=\s*true;/);
});

test("MEG workspace saved-query reset clears the picker after the native menu closes", () => {
  const timers = [];
  const savedQueryPicker = {
    value: "/esm/v3/media-company/year?requestor-id=MML",
    blurCalls: 0,
    style: {},
    blur() {
      this.blurCalls += 1;
    },
  };
  let titleSyncCount = 0;
  let disabledSyncCount = 0;
  const { resetSavedQueryPickerSelection } = loadFunctions("meg-workspace.js", ["resetSavedQueryPickerSelection"], {
    savedQueryPicker,
    syncSavedQueryPickerTitle: () => {
      titleSyncCount += 1;
    },
    syncSavedQueryButtonsDisabled: () => {
      disabledSyncCount += 1;
    },
    setTimeout: (callback) => {
      timers.push(callback);
      return timers.length;
    },
  });

  resetSavedQueryPickerSelection();

  assert.equal(savedQueryPicker.value, "/esm/v3/media-company/year?requestor-id=MML");
  assert.equal(savedQueryPicker.blurCalls, 1);
  assert.equal(timers.length, 1);

  timers[0]();
  assert.equal(savedQueryPicker.value, "");
  assert.equal(titleSyncCount, 1);
  assert.equal(disabledSyncCount, 1);
});

test("saved-query change handlers load the selected query before resetting the picker", () => {
  const popupSource = read("popup.js");
  const megSource = read("meg-workspace.js");

  assert.match(
    popupSource,
    /megSavedQuerySelectElement\?\.addEventListener\("change", async \(event\) => \{[\s\S]*?await esmWorkspaceOpenSavedQueryFromUi\([\s\S]*?resetEsmWorkspaceMegSavedQuerySelect\(selectElement\);/m
  );
  assert.match(
    megSource,
    /savedQueryPicker\?\.addEventListener\("change", async \(\) => \{[\s\S]*?await loadSelectedSavedQuery\(selectedOption\);[\s\S]*?resetSavedQueryPickerSelection\(\);/m
  );
});

test("debug-flow hydration helpers are wired into the partner SSO runtime paths", () => {
  const popupSource = read("popup.js");

  assert.match(popupSource, /function extractRestV2PartnerFrameworkStatusFromDebugFlow\(flow = null\)/);
  assert.match(popupSource, /function hydrateRestV2PartnerSsoContextFromDebugFlow\(context = null, flow = null\)/);
  assert.match(popupSource, /function hydrateRestV2PartnerSsoContextFromFlowId\(context = null, flowId = "", options = \{\}\)/);
  assert.match(
    popupSource,
    /const extractedPartnerFrameworkStatus = extractRestV2PartnerFrameworkStatusFromDebugFlow\(flow\);[\s\S]*?context\.partnerFrameworkStatus = extractedPartnerFrameworkStatus;/m
  );
  assert.match(
    popupSource,
    /const samlDetails = extractRestV2SamlResponseFromDebugFlow\(flow\);[\s\S]*?context\.samlResponse = samlResponse;/m
  );
  assert.match(
    popupSource,
    /await hydrateRestV2PartnerSsoContextFromFlowId\(recordingContext, activeFlowId\);[\s\S]*?probeRestV2PostAuthProfiles\(recordingContext, activeFlowId/m
  );
  assert.match(
    popupSource,
    /await hydrateRestV2PartnerSsoContextFromFlowId\(recordingContext, flowId\);[\s\S]*?probeRestV2PostAuthProfiles\(recordingContext, flowId/m
  );
});

test("popup env badge stays hidden until an AdobePASS session is active", () => {
  const els = {
    pageEnvBadgeRow: {
      hidden: false,
    },
  };
  const state = {
    sessionReady: false,
    loginData: null,
  };
  const { syncPageEnvironmentBadgeVisibility } = loadFunctions("popup.js", ["syncPageEnvironmentBadgeVisibility"], {
    els,
    state,
    shouldShowAdobePassEnvironmentBadge: () =>
      Boolean(state.sessionReady === true && state.loginData && state.loginData.adobePassReady === true),
  });

  syncPageEnvironmentBadgeVisibility();
  assert.equal(els.pageEnvBadgeRow.hidden, true);

  state.sessionReady = true;
  state.loginData = { accessToken: "token", adobePassReady: false };
  syncPageEnvironmentBadgeVisibility();
  assert.equal(els.pageEnvBadgeRow.hidden, true);

  state.loginData = { accessToken: "token", adobePassReady: true };
  syncPageEnvironmentBadgeVisibility();
  assert.equal(els.pageEnvBadgeRow.hidden, false);
});

test("popup env badge renders the console release label", () => {
  const els = {
    pageEnvBadge: {
      dataset: {},
      setAttribute(name, value) {
        this[name] = value;
      },
    },
    pageEnvBadgeValue: {
      textContent: "",
      setAttribute(name, value) {
        this[name] = value;
      },
    },
  };
  const { renderPageEnvironmentBadge } = loadFunctions("popup.js", ["renderPageEnvironmentBadge"], {
    els,
    DEFAULT_ADOBEPASS_ENVIRONMENT: { key: "release-production" },
    shouldShowAdobePassEnvironmentBadge: () => true,
    clearPageEnvironmentBadge: () => {},
    getActiveAdobePassEnvironment: () => ({
      key: "release-staging",
      label: "Staging",
      envBadgeTitle: "Environment : Staging",
    }),
    getUnderParEnvironmentRegistry: () => ({
      buildEnvironmentBadgeLabel: () => "Release Staging",
      buildEnvironmentBadgeTooltip: () => "Environment : Staging\nAdobePASS Console : https://console.auth-staging.adobe.com",
    }),
  });

  renderPageEnvironmentBadge();

  assert.equal(els.pageEnvBadgeValue.textContent, "Release Staging");
  assert.equal(els.pageEnvBadgeValue["aria-hidden"], "false");
  assert.equal(els.pageEnvBadge.dataset.environmentKey, "release-staging");
  assert.equal(els.pageEnvBadge.dataset.environmentLabel, "Release Staging");
});

test("popup env badge clears instead of leaking AdobePASS context for non-AdobePASS sessions", () => {
  const els = {
    pageEnvBadge: {
      dataset: {
        environmentKey: "release-production",
        environmentLabel: "Release Production",
      },
      title: "Environment : Release Production",
      setAttribute(name, value) {
        this[name] = value;
      },
    },
    pageEnvBadgeValue: {
      textContent: "Release Production",
      setAttribute(name, value) {
        this[name] = value;
      },
    },
  };
  const { clearPageEnvironmentBadge, renderPageEnvironmentBadge } = loadFunctions(
    "popup.js",
    ["clearPageEnvironmentBadge", "renderPageEnvironmentBadge"],
    {
      els,
      shouldShowAdobePassEnvironmentBadge: () => false,
      getActiveAdobePassEnvironment: () => ({
        key: "release-production",
        label: "Production",
      }),
      getUnderParEnvironmentRegistry: () => null,
      DEFAULT_ADOBEPASS_ENVIRONMENT: { key: "release-production" },
    }
  );

  clearPageEnvironmentBadge();
  assert.equal(els.pageEnvBadgeValue.textContent, "");
  assert.equal(els.pageEnvBadgeValue["aria-hidden"], "true");
  assert.equal(els.pageEnvBadge.dataset.environmentLabel, "");

  els.pageEnvBadgeValue.textContent = "Release Production";
  renderPageEnvironmentBadge();
  assert.equal(els.pageEnvBadgeValue.textContent, "");
  assert.equal(els.pageEnvBadge.title, "Environment");
});
