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

test("sidepanel saved-query menu uses an owned trigger while standalone MEG keeps the deferred native picker flow", () => {
  const popupSource = read("popup.js");
  const megSource = read("meg-workspace.js");

  assert.match(
    popupSource,
    /class="esm-workspace-meg-saved-trigger"[\s\S]*?class="esm-workspace-meg-saved-menu"/m
  );
  assert.match(
    popupSource,
    /megSavedQueryTriggerButton\?\.addEventListener\("click", \(event\) => \{[\s\S]*?esmWorkspaceToggleMegSavedQueryMenu\(esmWorkspaceState/m
  );
  assert.match(
    popupSource,
    /optionButton\.addEventListener\("click", \(event\) => \{[\s\S]*?void esmWorkspaceRunMegSavedQueryRecord\(esmWorkspaceState, record\);/m
  );
  assert.match(
    megSource,
    /savedQueryPicker\?\.addEventListener\("change", async \(\) => \{[\s\S]*?const executeSavedQuerySelection = async \(\) => \{[\s\S]*?await loadSelectedSavedQuery\(selectedOption\);[\s\S]*?resetSavedQueryPickerSelection\(\);[\s\S]*?setTimeout\(\(\) => \{\s*void executeSavedQuerySelection\(\);/m
  );
  assert.doesNotMatch(popupSource, /megSavedQuerySelectElement\?\.addEventListener\("change"/);
});

test("sidepanel saved-query menu close helper hides the menu and resets the trigger state", () => {
  let restoredFocusCount = 0;
  const pickerElement = {
    classList: {
      remove(name) {
        this.removed = name;
      },
    },
  };
  const triggerButton = {
    setAttribute(name, value) {
      this[name] = value;
    },
    focus() {
      restoredFocusCount += 1;
    },
  };
  const menuElement = {
    hidden: false,
  };
  const { esmWorkspaceCloseMegSavedQueryMenu } = loadFunctions("popup.js", ["esmWorkspaceCloseMegSavedQueryMenu"]);

  esmWorkspaceCloseMegSavedQueryMenu(
    {
      megSavedQueryPickerElement: pickerElement,
      megSavedQueryTriggerButton: triggerButton,
      megSavedQueryMenuElement: menuElement,
    },
    { restoreFocus: true }
  );

  assert.equal(pickerElement.classList.removed, "is-open");
  assert.equal(menuElement.hidden, true);
  assert.equal(triggerButton["aria-expanded"], "false");
  assert.equal(restoredFocusCount, 1);
});

test("debug-flow hydration helpers are wired into the partner SSO runtime paths", () => {
  const popupSource = read("popup.js");

  assert.match(popupSource, /function extractRestV2PartnerFrameworkStatusFromText\(value = ""\)/);
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
    /extractRestV2PartnerFrameworkStatusFromText\(String\(event\?\.responsePreview \|\| ""\)\.trim\(\)\)/m
  );
  assert.match(
    popupSource,
    /await hydrateRestV2PartnerSsoContextFromFlowId\(recordingContext, activeFlowId\);[\s\S]*?probeRestV2PostAuthProfiles\(recordingContext, activeFlowId/m
  );
  assert.match(
    popupSource,
    /await hydrateRestV2PartnerSsoContextFromFlowId\(recordingContext, flowId\);[\s\S]*?probeRestV2PostAuthProfiles\(recordingContext, flowId/m
  );
  assert.match(
    popupSource,
    /hydrateRestV2ContextFromPreparedLoginEntry\(context\);[\s\S]*?await hydrateRestV2PartnerSsoContextFromFlowId\(context, flowId\);[\s\S]*?storeRestV2LearningContextSeed\(context, flowId\);/m
  );
  assert.match(
    popupSource,
    /clearRestV2ProfileHarvestForContext\(recordingContext\);[\s\S]*?storeRestV2LearningContextSeed\(recordingContext, flowId\);/m
  );
  assert.match(
    popupSource,
    /clearRestV2ProfileHarvestForContext\(recordingContext\);[\s\S]*?storeRestV2LearningContextSeed\(recordingContext, activeFlowId\);/m
  );
});

test("partner framework status extraction falls back to debug-flow preview text", () => {
  const validPartnerFrameworkStatus = "valid-partner-framework-status";
  const getCaseInsensitiveObjectValue = (source = null, keyCandidates = []) => {
    if (!source || typeof source !== "object") {
      return "";
    }
    const candidates = (Array.isArray(keyCandidates) ? keyCandidates : [keyCandidates])
      .map((key) => String(key || "").trim().toLowerCase())
      .filter(Boolean);
    for (const [key, value] of Object.entries(source)) {
      if (candidates.includes(String(key || "").trim().toLowerCase())) {
        return String(value || "").trim();
      }
    }
    return "";
  };
  const getCaseInsensitiveHeaderValue = (headersLike = null, keyCandidates = []) =>
    getCaseInsensitiveObjectValue(headersLike, keyCandidates);
  const { extractRestV2PartnerFrameworkStatusFromText, extractRestV2PartnerFrameworkStatusFromDebugFlow } = loadFunctions(
    "popup.js",
    ["extractRestV2PartnerFrameworkStatusFromText", "extractRestV2PartnerFrameworkStatusFromDebugFlow"],
    {
      ADOBE_SP_BASE: "https://sp.auth.adobe.com",
      firstNonEmptyString: (values = []) => values.find((value) => String(value || "").trim()) || "",
      dedupeRestV2CandidateStrings: (values = []) => [...new Set((Array.isArray(values) ? values : [values]).map((value) => String(value || "").trim()).filter(Boolean))],
      decodeURIComponentSafe: (value = "") => {
        try {
          return decodeURIComponent(String(value || "").trim());
        } catch {
          return "";
        }
      },
      decodeBase64TextSafe: (value = "") => {
        try {
          return Buffer.from(String(value || "").trim(), "base64").toString("utf8");
        } catch {
          return "";
        }
      },
      parseJsonText: (value = "", fallback = null) => {
        try {
          return JSON.parse(String(value || ""));
        } catch {
          return fallback;
        }
      },
      getRestV2CaseInsensitiveObjectValue: getCaseInsensitiveObjectValue,
      getRestV2CaseInsensitiveHeaderValue: getCaseInsensitiveHeaderValue,
      resolveRestV2PartnerFrameworkStatusFromSessionData: (sessionData = null, responseHeaders = null) =>
        getCaseInsensitiveObjectValue(sessionData, ["partnerFrameworkStatus"]) ||
        getCaseInsensitiveHeaderValue(responseHeaders, ["AP-Partner-Framework-Status", "ap-partner-framework-status"]),
      isRestV2PartnerFrameworkStatusUsable: (value = "") => String(value || "").trim() === validPartnerFrameworkStatus,
      normalizeRestV2PartnerFrameworkStatusForRequest: (value = "") => String(value || "").trim(),
    }
  );

  const responsePreview = JSON.stringify({
    partnerFrameworkStatus: validPartnerFrameworkStatus,
  });

  assert.equal(extractRestV2PartnerFrameworkStatusFromText(responsePreview), validPartnerFrameworkStatus);
  assert.equal(
    extractRestV2PartnerFrameworkStatusFromDebugFlow({
      events: [
        {
          responsePreview,
        },
      ],
    }),
    validPartnerFrameworkStatus
  );
});

test("sidepanel MEG endpoint picker updates launch state without rebuilding the full option list in change", () => {
  const popupSource = read("popup.js");

  assert.match(popupSource, /function esmWorkspaceSyncMegLaunchUi\(esmWorkspaceState\)/);
  assert.match(
    popupSource,
    /megSelectElement\?\.addEventListener\("change", \(event\) => \{[\s\S]*?esmWorkspaceState\.megSelectedEndpointUrl = String\(event\.target\?\.value \|\| ""\)\.trim\(\);[\s\S]*?esmWorkspaceSyncMegLaunchUi\(esmWorkspaceState\);/m
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
