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
  const popupCss = read("popup.css");

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
    /savedQueryPicker\?\.addEventListener\("change", async \(\) => \{[\s\S]*?const executeSavedQuerySelection = async \(\) => \{[\s\S]*?await loadSelectedSavedQuery\(selectedOption\);[\s\S]*?setTimeout\(\(\) => \{\s*void executeSavedQuerySelection\(\);/m
  );
  assert.doesNotMatch(popupSource, /megSavedQuerySelectElement\?\.addEventListener\("change"/);
  assert.match(
    popupCss,
    /\.service-esm \.esm-workspace-meg-panel \{[\s\S]*?overflow:\s*visible;/m
  );
});

test("sidepanel saved-query menu opens above the footer trigger so it stays visible inside the ESM service shell", () => {
  const popupCss = read("popup.css");

  assert.match(
    popupCss,
    /\.service-esm \.esm-workspace-meg-saved-picker\.is-open \{[\s\S]*?z-index:\s*45;/m
  );
  assert.match(
    popupCss,
    /\.service-esm \.esm-workspace-meg-saved-menu \{[\s\S]*?top:\s*auto;[\s\S]*?bottom:\s*calc\(100%\s*\+\s*4px\);/m
  );
});

test("sidepanel saved-query menu lifts into a floating body layer when opened", () => {
  const popupSource = read("popup.js");
  const popupCss = read("popup.css");

  assert.match(
    popupSource,
    /if \(menuElement\.parentElement !== document\.body\) \{\s*document\.body\.appendChild\(menuElement\);\s*\}/m
  );
  assert.match(popupSource, /menuElement\.classList\.add\("is-floating"\);/);
  assert.match(popupSource, /function esmWorkspacePositionMegSavedQueryMenu\(esmWorkspaceState\)/);
  assert.match(popupCss, /\.esm-workspace-meg-saved-menu\.is-floating\s*\{/);
});

test("sidepanel MEGSPACE saved-query launcher hands the saved URL to the MEG workspace selection-change flow", async () => {
  const interactions = {
    rememberedSelection: null,
    broadcastWindowId: 0,
    workspaceMessage: null,
    normalizedEndpointArg: null,
    normalizedOptionsArg: null,
  };
  const esmWorkspaceState = {
    controllerWindowId: 31,
    programmer: {
      programmerId: "Turner",
    },
    requestToken: 15,
  };
  const { megWorkspaceOpenSavedQueryFromUi } = loadFunctions("popup.js", ["megWorkspaceOpenSavedQueryFromUi"], {
    state: {
      megWorkspaceWindowId: 0,
      premiumPanelRequestToken: 23,
    },
    stripMegWorkspaceMediaCompanyQueryParam: (value = "") =>
      String(value || "").replace(/[?&]media-company=[^&]+/g, "").replace(/\?$/, ""),
    resolveCurrentPremiumPanelRequestToken: (_programmerId, requestToken) => Number(requestToken || 0),
    megWorkspaceEnsureWorkspaceTab: async () => ({
      id: 77,
      windowId: 45,
    }),
    getActiveAdobePassEnvironment: () => ({
      esmBase: "https://mgmt.auth.adobe.com/esm/v3/media-company/",
      mgmtBase: "https://mgmt.auth.adobe.com",
    }),
    ADOBE_MGMT_BASE: "https://mgmt.auth.adobe.com",
    megWorkspaceBuildAbsoluteServiceUrl: (baseOrigin, value) => new URL(String(value || ""), String(baseOrigin || "")).toString(),
    megWorkspaceNormalizeSelection: (endpoint = null, options = {}) => {
      interactions.normalizedEndpointArg = endpoint;
      interactions.normalizedOptionsArg = options;
      return {
        endpointUrl: String(endpoint?.url || ""),
        endpointPath: "/esm/v3/media-company/year/day?requestor-id=MML",
        endpointLabel: String(options.endpointLabel || ""),
        launchToken: String(options.launchToken || ""),
      };
    },
    generateRequestId: () => "launch-42",
    megWorkspaceRememberSelection: (windowId, selection) => {
      interactions.rememberedSelection = {
        windowId,
        selection,
      };
    },
    megWaitForWorkspaceReady: async () => true,
    megWorkspaceBroadcastControllerState: (_state, windowId) => {
      interactions.broadcastWindowId = Number(windowId || 0);
    },
    megWorkspaceSendWorkspaceMessage: async (event, payload = {}, options = {}) => {
      interactions.workspaceMessage = {
        event,
        payload,
        options,
      };
    },
    setStatus: () => {
      throw new Error("setStatus should not be called on the success path");
    },
    URL,
    Date,
  });

  await megWorkspaceOpenSavedQueryFromUi(
    esmWorkspaceState,
    "/esm/v3/media-company/year/day?requestor-id=MML&media-company=Turner",
    19,
    "Daily Auth"
  );

  assert.equal(
    interactions.normalizedEndpointArg?.url,
    "https://mgmt.auth.adobe.com/esm/v3/media-company/year/day?requestor-id=MML"
  );
  assert.equal(interactions.normalizedOptionsArg?.endpointLabel, "Daily Auth");
  assert.equal(interactions.normalizedOptionsArg?.launchToken, "launch-42");
  assert.equal(interactions.rememberedSelection?.windowId, 45);
  assert.equal(interactions.broadcastWindowId, 45);
  assert.equal(interactions.workspaceMessage?.event, "selection-change");
  assert.equal(interactions.workspaceMessage?.payload?.endpointPath, "/esm/v3/media-company/year/day?requestor-id=MML");
  assert.equal(interactions.workspaceMessage?.payload?.endpointLabel, "Daily Auth");
  assert.equal(interactions.workspaceMessage?.payload?.autoRun, true);
  assert.equal(interactions.workspaceMessage?.payload?.requestToken, 19);
  assert.equal(interactions.workspaceMessage?.options?.targetWindowId, 45);
});

test("sidepanel MEGSPACE saved-query runner no longer routes saved queries through the ESM workspace opener", () => {
  const popupSource = read("popup.js");

  assert.match(
    popupSource,
    /await megWorkspaceOpenSavedQueryFromUi\(esmWorkspaceState, savedQueryUrl, requestToken, savedQueryName\);/
  );
  assert.match(
    popupSource,
    /await megWorkspaceSendWorkspaceMessage\(\s*"selection-change",[\s\S]*?autoRun:\s*true,/m
  );
  assert.doesNotMatch(
    popupSource,
    /await esmWorkspaceOpenRequestPathInWorkspace\(esmWorkspaceState, normalizedSavedQueryUrl, liveRequestToken, \{[\s\S]*?requestSource:\s*"saved-query"/m
  );
});

test("global MEG saved-query dismiss logic treats the floating menu as inside the picker", () => {
  const popupSource = read("popup.js");

  assert.match(
    popupSource,
    /const menuElement = target instanceof Element \? target\.closest\("\.esm-workspace-meg-saved-menu"\) : null;\s*if \(menuElement\) \{\s*return;\s*\}/m
  );
  assert.match(
    popupSource,
    /function resolveEsmWorkspaceStateFromMegSavedQueryNode\(node = null\) \{[\s\S]*?closest\("\.esm-workspace-meg-saved-menu"\)[\s\S]*?__underparEsmWorkspaceState/m
  );
});

test("sidepanel saved-query menu close helper hides the menu and resets the trigger state", () => {
  let restoredFocusCount = 0;
  const pickerElement = {
    classList: {
      remove(name) {
        this.removed = name;
      },
    },
    appendChild(node) {
      this.appendedNode = node;
      node.parentElement = this;
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
    classList: {
      remove(name) {
        this.removed = name;
      },
    },
    style: {},
    parentElement: {
      nodeName: "BODY",
    },
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
  assert.equal(menuElement.classList.removed, "is-floating");
  assert.equal(pickerElement.appendedNode, menuElement);
  assert.equal(triggerButton["aria-expanded"], "false");
  assert.equal(restoredFocusCount, 1);
});

test("REST V2 post-login redirect matcher ignores trailing-slash drift on the landing page", () => {
  const { normalizeAdobeNavigationUrl, isRestV2RedirectAtPostLoginTarget } = loadFunctions(
    "popup.js",
    ["normalizeAdobeNavigationUrl", "isRestV2RedirectAtPostLoginTarget"],
    {
      ADOBE_SP_BASE: "https://sp.auth.adobe.com",
      URL,
    }
  );

  assert.equal(
    isRestV2RedirectAtPostLoginTarget(
      "https://developer.adobe.com/adobe-pass/api/rest_api_v2/interactive/",
      "https://developer.adobe.com/adobe-pass/api/rest_api_v2/interactive"
    ),
    true
  );
  assert.equal(
    isRestV2RedirectAtPostLoginTarget(
      "https://developer.adobe.com/adobe-pass/api/rest_api_v2/interactive?underpar=1",
      normalizeAdobeNavigationUrl("https://developer.adobe.com/adobe-pass/api/rest_api_v2/interactive/")
    ),
    true
  );
});

test("REST V2 Bobtools redirect watcher falls back to the launch page when redirectUrl is unavailable", () => {
  const popupSource = read("popup.js");

  assert.match(
    popupSource,
    /const redirectUrl = firstNonEmptyString\(\[\s*recordingContext\?\.redirectUrl,\s*state\.restV2PreviousTabUrl\s*\]\);/m
  );
});

test("REST V2 Bobtools redirect watcher swaps the tab before profile hydration begins", () => {
  const popupSource = read("popup.js");

  assert.match(
    popupSource,
    /const workspaceUrl = bobtoolsWorkspaceGetWorkspaceUrl\(\);[\s\S]*?await chrome\.tabs\.update\(normalizedTabId, \{ url: workspaceUrl \}\);[\s\S]*?await ensureRestV2ProfilesHydratedForBobtools\(hydrationContext/m
  );
  assert.match(popupSource, /function bobtoolsWorkspaceRefreshSelection\(programmer = null, targetWindowId = 0\)/);
});

test("popup-close success path auto-opens BOBTOOLS in background-hydration mode", () => {
  const popupSource = read("popup.js");

  assert.match(
    popupSource,
    /await bobtoolsWorkspaceOpenFromRestV2\(null, \{[\s\S]*?skipHydration: true,[\s\S]*?allowWithoutProfiles: true,[\s\S]*?\}\);/m
  );
});

test("REST V2 stop success path auto-opens BOBTOOLS after closing the login window", () => {
  const popupSource = read("popup.js");

  assert.match(
    popupSource,
    /closeResult = await closeRestV2LoginAndReturn\(section, \{[\s\S]*?phasePrefix: "recording-close",[\s\S]*?\}\);[\s\S]*?if \(hasRecordingContext && isRestV2ProfileSessionActiveResult\(profileCheckResult\)\) \{[\s\S]*?await maybeOpenBobtoolsWorkspaceForRestV2ProfileSuccess\(activeFlowId, \{[\s\S]*?source: "recording-stop",[\s\S]*?\}\);[\s\S]*?\}/m
  );
});

test("REST V2 popup-close BOBTOOLS launch reuses the prior browsing window before the stale popup window id", async () => {
  const { resolveRestV2BobtoolsLaunchWindowId } = loadFunctions("popup.js", ["resolveRestV2BobtoolsLaunchWindowId"], {
    state: {
      restV2PreviousTabId: 71,
    },
    getTabByIdSafe: async (tabId) => ({ id: tabId, windowId: 314 }),
    chrome: {
      windows: {
        get: async () => ({ id: 999 }),
      },
    },
    resolveSidepanelControllerWindowId: async () => 123,
  });

  await assert.doesNotReject(async () => {
    const windowId = await resolveRestV2BobtoolsLaunchWindowId(999);
    assert.equal(windowId, 314);
  });
});

test("REST V2 popup-close BOBTOOLS launch falls back from a closed popup window to the controller window", async () => {
  const { resolveRestV2BobtoolsLaunchWindowId } = loadFunctions("popup.js", ["resolveRestV2BobtoolsLaunchWindowId"], {
    state: {
      restV2PreviousTabId: 71,
    },
    getTabByIdSafe: async () => null,
    chrome: {
      windows: {
        get: async () => {
          throw new Error("No window with id: 999");
        },
      },
    },
    resolveSidepanelControllerWindowId: async () => 123,
  });

  await assert.doesNotReject(async () => {
    const windowId = await resolveRestV2BobtoolsLaunchWindowId(999);
    assert.equal(windowId, 123);
  });
});

test("shared REST V2 success opener uses the resolved browsing window and background-hydration workspace options", async () => {
  const debugEvents = [];
  let openOptions = null;
  const { maybeOpenBobtoolsWorkspaceForRestV2ProfileSuccess } = loadFunctions(
    "popup.js",
    ["maybeOpenBobtoolsWorkspaceForRestV2ProfileSuccess"],
    {
      resolveRestV2BobtoolsLaunchWindowId: async (windowId) => {
        assert.equal(windowId, 999);
        return 314;
      },
      bobtoolsWorkspaceOpenFromRestV2: async (_programmer, options) => {
        openOptions = options;
        return { id: 11, windowId: Number(options?.windowId || 0) };
      },
      emitRestV2DebugEvent: (...args) => {
        debugEvents.push(args);
      },
    }
  );

  const result = await maybeOpenBobtoolsWorkspaceForRestV2ProfileSuccess("flow-1", {
    preferredWindowId: 999,
    source: "recording-stop",
  });

  assert.equal(result?.ok, true);
  assert.equal(result?.windowId, 314);
  assert.equal(openOptions?.activate, true);
  assert.equal(openOptions?.windowId, 314);
  assert.equal(openOptions?.forceRefresh, false);
  assert.equal(openOptions?.skipHydration, true);
  assert.equal(openOptions?.allowWithoutProfiles, true);
  assert.equal(debugEvents[0]?.[0], "flow-1");
  assert.equal(debugEvents[0]?.[1]?.source, "extension");
  assert.equal(debugEvents[0]?.[1]?.phase, "bobtools-opened");
  assert.equal(debugEvents[0]?.[1]?.reason, "recording-stop");
  assert.equal(debugEvents[0]?.[1]?.activate, true);
  assert.equal(debugEvents[0]?.[1]?.windowId, 314);
});

test("BOBTOOLS selection context includes the current selection harvest when only a selection-scoped error harvest exists", () => {
  const currentSelectionHarvest = {
    programmerId: "Turner",
    requestorId: "MML",
    serviceProviderId: "MML",
    mvpd: "Comcast_SSO",
    mvpdName: "Xfinity",
    profileCheckOutcome: "http_error",
    harvestedAt: 100,
  };
  const { buildBobtoolsWorkspaceSelectionContext } = loadFunctions(
    "popup.js",
    ["buildBobtoolsWorkspaceHarvestList", "buildBobtoolsWorkspaceSelectionContext"],
    {
      state: {
        selectedRequestorId: "MML",
        selectedMvpdId: "Comcast_SSO",
      },
      resolveSelectedProgrammer: () => ({ programmerId: "Turner", programmerName: "Turner" }),
      getRestV2ProfileHarvestBucketForProgrammer: () => [],
      buildCurrentRestV2SelectionContext: () => ({
        ok: true,
        programmerId: "Turner",
        requestorId: "MML",
        mvpd: "Comcast_SSO",
      }),
      getRestV2ProfileHarvestForContext: () => currentSelectionHarvest,
      mergeRestV2ProfileHarvestLists: (...lists) => lists.flat().filter(Boolean),
      findRestV2HarvestByRequestorAndMvpd: (list, requestorId, mvpd) =>
        list.find((item) => item.requestorId === requestorId && item.mvpd === mvpd) || null,
      getRestV2MvpdPickerLabel: () => "Xfinity (Comcast_SSO)",
      getRestV2HarvestRecordKey: () => "harvest-1",
      getUnderparActiveUserLabel: () => "UnderPAR user",
    }
  );

  const selectionContext = buildBobtoolsWorkspaceSelectionContext();
  assert.equal(selectionContext.hasProfiles, true);
  assert.equal(selectionContext.harvestList.length, 1);
  assert.equal(selectionContext.selectedHarvest?.profileCheckOutcome, "http_error");
  assert.equal(selectionContext.requestorId, "MML");
  assert.equal(selectionContext.mvpd, "Comcast_SSO");
  assert.equal(selectionContext.selectedHarvestKey, "harvest-1");
});

test("REST V2 BOBTOOLS launcher unlocks from the current selection harvest even when the programmer bucket is empty", () => {
  const tool = { hidden: true };
  const button = {
    disabled: true,
    title: "",
    attrs: {},
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
  };
  const section = {
    querySelector(selector) {
      if (selector === ".rest-v2-bobtools-tool") {
        return tool;
      }
      if (selector === ".rest-v2-bobtools-open-btn") {
        return button;
      }
      return null;
    },
  };
  const selectedHarvest = {
    requestorId: "MML",
    serviceProviderId: "MML",
    mvpd: "Comcast_SSO",
    mvpdName: "Xfinity",
  };
  const { syncRestV2BobtoolsLauncher } = loadFunctions("popup.js", ["syncRestV2BobtoolsLauncher"], {
    buildBobtoolsWorkspaceSelectionContext: () => ({
      harvestList: [selectedHarvest],
      selectedHarvest,
    }),
    formatRestV2RequestorMvpdDisplay: () => "MML x Xfinity (Comcast_SSO)",
  });

  syncRestV2BobtoolsLauncher(section, null, null);
  assert.equal(tool.hidden, false);
  assert.equal(button.disabled, false);
  assert.equal(button.title, "Open BOBTOOLS Workspace for MML x Xfinity (Comcast_SSO).");
  assert.equal(button.attrs["aria-label"], "Open BOBTOOLS Workspace for MML x Xfinity (Comcast_SSO).");
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
    [
      "isRestV2PartnerSsoApiUrl",
      "extractRestV2PartnerNameFromSsoApiUrl",
      "isRestV2InteractiveDocsUrl",
      "isRestV2ExtensionInitiatedDebugEvent",
      "isRestV2InteractiveDocsDebugEvent",
      "shouldTrustRestV2PartnerSsoLearningEvent",
      "extractRestV2PartnerFrameworkStatusFromText",
      "extractRestV2PartnerFrameworkStatusFromDebugFlow",
    ],
    {
      ADOBE_SP_BASE: "https://sp.auth.adobe.com",
      URL,
      firstNonEmptyString: (values = []) => values.find((value) => String(value || "").trim()) || "",
      dedupeRestV2CandidateStrings: (values = []) => [...new Set((Array.isArray(values) ? values : [values]).map((value) => String(value || "").trim()).filter(Boolean))],
      normalizeRestV2ProfileAttributeValue: (value = "") => String(value == null ? "" : value).trim(),
      collectRestV2CaseInsensitiveObjectValues: (source = null, keyCandidates = []) => {
        if (!source || typeof source !== "object") {
          return [];
        }
        const candidates = (Array.isArray(keyCandidates) ? keyCandidates : [keyCandidates])
          .map((key) => String(key || "").trim().toLowerCase())
          .filter(Boolean);
        const values = [];
        const visit = (node) => {
          if (!node || typeof node !== "object") {
            return;
          }
          if (Array.isArray(node)) {
            node.forEach((entry) => visit(entry));
            return;
          }
          Object.entries(node).forEach(([key, value]) => {
            if (candidates.includes(String(key || "").trim().toLowerCase())) {
              const normalized = String(value == null ? "" : value).trim();
              if (normalized) {
                values.push(normalized);
              }
            }
            if (value && typeof value === "object") {
              visit(value);
            }
          });
        };
        visit(source);
        return values;
      },
      getRestV2InteractiveDocsHeaderAliasCandidates: (headerName = "") => {
        const normalized = String(headerName || "").trim().toLowerCase();
        if (normalized === "ap-partner-framework-status") {
          return [
            "AP-Partner-Framework-Status",
            "ap-partner-framework-status",
            "partnerFrameworkStatus",
            "partner_framework_status",
            "frameworkStatus",
            "framework_status",
          ];
        }
        return [headerName];
      },
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

test("partner framework status extraction ignores extension and interactive-docs self traffic but accepts real app partner SSO requests", () => {
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
  const { extractRestV2PartnerFrameworkStatusFromDebugFlow } = loadFunctions(
    "popup.js",
    [
      "isRestV2PartnerSsoApiUrl",
      "extractRestV2PartnerNameFromSsoApiUrl",
      "isRestV2InteractiveDocsUrl",
      "isRestV2ExtensionInitiatedDebugEvent",
      "isRestV2InteractiveDocsDebugEvent",
      "shouldTrustRestV2PartnerSsoLearningEvent",
      "extractRestV2PartnerFrameworkStatusFromText",
      "extractRestV2PartnerFrameworkStatusFromDebugFlow",
    ],
    {
      ADOBE_SP_BASE: "https://sp.auth.adobe.com",
      URL,
      firstNonEmptyString: (values = []) => values.find((value) => String(value || "").trim()) || "",
      dedupeRestV2CandidateStrings: (values = []) => [...new Set((Array.isArray(values) ? values : [values]).map((value) => String(value || "").trim()).filter(Boolean))],
      normalizeRestV2ProfileAttributeValue: (value = "") => String(value == null ? "" : value).trim(),
      collectRestV2CaseInsensitiveObjectValues: () => [],
      getRestV2InteractiveDocsHeaderAliasCandidates: () => [
        "AP-Partner-Framework-Status",
        "ap-partner-framework-status",
        "partnerFrameworkStatus",
      ],
      decodeURIComponentSafe: (value = "") => String(value || "").trim(),
      decodeBase64TextSafe: () => "",
      parseJsonText: () => null,
      getRestV2CaseInsensitiveObjectValue: getCaseInsensitiveObjectValue,
      getRestV2CaseInsensitiveHeaderValue: getCaseInsensitiveHeaderValue,
      resolveRestV2PartnerFrameworkStatusFromSessionData: (sessionData = null, responseHeaders = null) =>
        getCaseInsensitiveObjectValue(sessionData, ["partnerFrameworkStatus"]) ||
        getCaseInsensitiveHeaderValue(responseHeaders, ["AP-Partner-Framework-Status", "ap-partner-framework-status"]),
      isRestV2PartnerFrameworkStatusUsable: (value = "") => String(value || "").trim() === validPartnerFrameworkStatus,
      normalizeRestV2PartnerFrameworkStatusForRequest: (value = "") => String(value || "").trim(),
    }
  );

  assert.equal(
    extractRestV2PartnerFrameworkStatusFromDebugFlow({
      events: [
        {
          source: "extension",
          phase: "profiles-sso-create-request",
          requestHeaders: {
            "AP-Partner-Framework-Status": validPartnerFrameworkStatus,
          },
        },
        {
          source: "web-request",
          phase: "onBeforeSendHeaders",
          initiator: "chrome-extension://ggiocjgfmddgkjnaamchnflcohgagoma",
          url: "https://sp.auth.adobe.com/api/v2/MML/profiles/sso/Apple",
          requestHeaders: {
            "AP-Partner-Framework-Status": validPartnerFrameworkStatus,
          },
        },
        {
          source: "web-request",
          phase: "onBeforeSendHeaders",
          initiator: "https://developer.adobe.com",
          url: "https://sp.auth.adobe.com/api/v2/MML/profiles/sso/Apple",
          requestHeaders: {
            "AP-Partner-Framework-Status": validPartnerFrameworkStatus,
          },
        },
      ],
    }),
    ""
  );

  assert.equal(
    extractRestV2PartnerFrameworkStatusFromDebugFlow({
      events: [
        {
          source: "web-request",
          phase: "onBeforeSendHeaders",
          initiator: "https://video.example.test",
          url: "https://sp.auth.adobe.com/api/v2/MML/profiles/sso/Apple",
          requestHeaders: {
            "AP-Partner-Framework-Status": validPartnerFrameworkStatus,
          },
        },
      ],
    }),
    validPartnerFrameworkStatus
  );
});

test("SAML extraction ignores extension and interactive-docs partner profile posts but keeps the real app request", () => {
  const encodedSaml = Buffer.from("<samlp:Response>ok</samlp:Response>", "utf8").toString("base64");
  const { extractRestV2SamlResponseFromDebugFlow } = loadFunctions(
    "popup.js",
    [
      "isRestV2PartnerSsoApiUrl",
      "extractRestV2PartnerNameFromSsoApiUrl",
      "isRestV2InteractiveDocsUrl",
      "isRestV2ExtensionInitiatedDebugEvent",
      "isRestV2InteractiveDocsDebugEvent",
      "shouldTrustRestV2PartnerSsoLearningEvent",
      "decodeSimpleHtmlEntities",
      "normalizeRestV2SamlResponseForPartnerProfile",
      "extractRestV2SamlResponseFromText",
      "extractRestV2SamlResponseFromWebRequestEvent",
      "extractRestV2SamlResponseFromDebugFlow",
    ],
    {
      ADOBE_SP_BASE: "https://sp.auth.adobe.com",
      URL,
      base64EncodeUtf8: (value = "") => Buffer.from(String(value || ""), "utf8").toString("base64"),
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
      getRestV2CaseInsensitiveObjectValue: (source = null, keyCandidates = []) => {
        if (!source || typeof source !== "object") {
          return "";
        }
        const candidates = (Array.isArray(keyCandidates) ? keyCandidates : [keyCandidates])
          .map((key) => String(key || "").trim().toLowerCase())
          .filter(Boolean);
        for (const [key, value] of Object.entries(source)) {
          if (candidates.includes(String(key || "").trim().toLowerCase())) {
            return value;
          }
        }
        return "";
      },
      isRestV2PartnerFrameworkStatusUsable: () => false,
    }
  );

  const result = extractRestV2SamlResponseFromDebugFlow({
    events: [
      {
        source: "web-request",
        phase: "onBeforeRequest",
        initiator: "https://video.example.test",
        url: "https://sp.auth.adobe.com/api/v2/MML/profiles/sso/Apple",
        requestBody: {
          formData: {
            SAMLResponse: [encodedSaml],
          },
        },
      },
      {
        source: "web-request",
        phase: "onBeforeRequest",
        initiator: "https://developer.adobe.com",
        url: "https://sp.auth.adobe.com/api/v2/MML/profiles/sso/Apple",
        requestBody: {
          formData: {
            SAMLResponse: [encodedSaml.replace(/=/g, "%3D")],
          },
        },
      },
      {
        source: "web-request",
        phase: "onBeforeRequest",
        initiator: "chrome-extension://ggiocjgfmddgkjnaamchnflcohgagoma",
        url: "https://sp.auth.adobe.com/api/v2/MML/profiles/sso/Apple",
        requestBody: {
          formData: {
            SAMLResponse: [encodedSaml.replace(/=/g, "%3D")],
          },
        },
      },
    ],
  });

  assert.equal(result.samlResponse, encodedSaml);
  assert.equal(result.source, "web-request:onBeforeRequest");
  assert.equal(result.partner, "Apple");
});

test("SAML extraction decodes Apple-style samlAttributeQueryResponse JSON previews from tab-network events", () => {
  const encodedSaml = Buffer.from("<samlp:Response>ok</samlp:Response>", "utf8").toString("base64");
  const { extractRestV2SamlResponseFromDebugFlow } = loadFunctions(
    "popup.js",
    [
      "normalizeRestV2ProfileAttributeValue",
      "dedupeRestV2CandidateStrings",
      "decodeBase64TextSafe",
      "getRestV2CaseInsensitiveObjectValue",
      "collectRestV2CaseInsensitiveObjectValues",
      "decodeURIComponentSafe",
      "parseJsonText",
      "isRestV2PartnerSsoApiUrl",
      "extractRestV2PartnerNameFromSsoApiUrl",
      "isRestV2InteractiveDocsUrl",
      "isRestV2ExtensionInitiatedDebugEvent",
      "isRestV2InteractiveDocsDebugEvent",
      "shouldTrustRestV2PartnerSsoLearningEvent",
      "decodeSimpleHtmlEntities",
      "base64EncodeUtf8",
      "normalizeRestV2SamlResponseForPartnerProfile",
      "extractRestV2SamlResponseFromText",
      "extractRestV2SamlResponseFromTabNetworkEvent",
      "extractRestV2SamlResponseFromDebugFlow",
    ],
    {
      ADOBE_SP_BASE: "https://sp.auth.adobe.com",
      URL,
      atob,
      btoa,
      unescape,
      encodeURIComponent,
      firstNonEmptyString: (values = []) => values.find((value) => String(value || "").trim()) || "",
      isRestV2PartnerFrameworkStatusUsable: () => false,
    }
  );

  const result = extractRestV2SamlResponseFromDebugFlow({
    context: {
      sessionAction: "partner_profile",
    },
    events: [
      {
        source: "tab-network",
        phase: "body",
        url: "https://video.example.test/vsa/callback",
        bodyPreview: JSON.stringify({
          samlAttributeQueryResponse: "<samlp:Response>ok</samlp:Response>",
        }),
      },
    ],
  });

  assert.equal(result.samlResponse, encodedSaml);
  assert.equal(result.source, "tab-network:body");
  assert.equal(result.trustedForPartnerSso, false);
});

test("SAML extraction does not trust standard authenticate captures solely because a partner framework header exists elsewhere in the flow", () => {
  const encodedSaml = Buffer.from("<samlp:Response>ok</samlp:Response>", "utf8").toString("base64");
  const validPartnerFrameworkStatus = Buffer.from(
    JSON.stringify({
      frameworkPermissionInfo: {
        accessStatus: "granted",
      },
      frameworkProviderInfo: {
        id: "Comcast_SSO_Apple",
      },
      frameworkPartnerInfo: {
        name: "Apple",
      },
    }),
    "utf8"
  ).toString("base64");
  const { extractRestV2SamlResponseFromDebugFlow } = loadFunctions(
    "popup.js",
    [
      "normalizeRestV2ProfileAttributeValue",
      "dedupeRestV2CandidateStrings",
      "decodeBase64TextSafe",
      "getRestV2CaseInsensitiveObjectValue",
      "getRestV2CaseInsensitiveHeaderValue",
      "collectRestV2CaseInsensitiveObjectValues",
      "getRestV2InteractiveDocsHeaderAliasCandidates",
      "decodeURIComponentSafe",
      "parseJsonText",
      "parseRestV2PartnerFrameworkStatusPayload",
      "resolveRestV2PartnerFrameworkStatusSummary",
      "isRestV2PartnerFrameworkStatusUsable",
      "normalizeRestV2PartnerFrameworkStatusForRequest",
      "resolveRestV2PartnerFrameworkStatusFromSessionData",
      "isRestV2PartnerSsoApiUrl",
      "extractRestV2PartnerNameFromSsoApiUrl",
      "isRestV2InteractiveDocsUrl",
      "isRestV2ExtensionInitiatedDebugEvent",
      "isRestV2InteractiveDocsDebugEvent",
      "shouldTrustRestV2PartnerSsoLearningEvent",
      "decodeSimpleHtmlEntities",
      "normalizeRestV2SamlResponseForPartnerProfile",
      "extractRestV2PartnerFrameworkStatusFromText",
      "extractRestV2PartnerFrameworkStatusFromDebugFlow",
      "extractRestV2SamlResponseFromText",
      "extractRestV2SamlResponseFromWebRequestEvent",
      "extractRestV2SamlResponseFromTabNetworkEvent",
      "extractRestV2SamlResponseFromDebugFlow",
    ],
    {
      ADOBE_SP_BASE: "https://sp.auth.adobe.com",
      URL,
      atob,
      btoa,
      unescape,
      encodeURIComponent,
      firstNonEmptyString: (values = []) => values.find((value) => String(value || "").trim()) || "",
    }
  );

  const result = extractRestV2SamlResponseFromDebugFlow({
    context: {
      loginUrl: "https://sp.auth.adobe.com/api/v2/authenticate/MML/J859AQV",
      sessionAction: "authenticate",
    },
    partnerFrameworkStatus: validPartnerFrameworkStatus,
    events: [
      {
        source: "tab-network",
        phase: "body",
        url: "https://oauth.xfinity.com/oauth/authorize",
        postDataPreview: `SAMLResponse=${encodeURIComponent(encodedSaml)}`,
      },
    ],
  });

  assert.equal(result.samlResponse, encodedSaml);
  assert.equal(result.source, "tab-network:body");
  assert.equal(result.partner, "");
  assert.equal(result.trustedForPartnerSso, false);
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

test("DCR learning card mirrors the shared ready vs locked top-level state", () => {
  const readyEntryKeys = new Set(["dcr-register"]);
  const { buildDcrInteractiveDocsPanelHtml } = loadFunctions("popup.js", ["buildDcrInteractiveDocsPanelHtml"], {
    DCR_INTERACTIVE_DOC_ENTRIES: [
      {
        key: "dcr-register",
        label: "Register Client",
        methodLabel: "POST",
        operationSummary: "Create a DCR client.",
        operationAnchor: "register",
      },
      {
        key: "dcr-list",
        label: "List Clients",
        methodLabel: "GET",
        operationSummary: "List DCR clients.",
        operationAnchor: "clients",
      },
    ],
    collectDcrRegisterAppOptions: () => [],
    getSelectedDcrRegisterApp: () => null,
    buildDcrInteractiveDocsUrl: (anchor = "") => `https://example.test/dcr/${anchor}`,
    buildDcrInteractiveDocsEntryActivationState: (entry = null) => {
      const key = String(entry?.key || "").trim();
      return {
        ready: readyEntryKeys.has(key),
        reason: readyEntryKeys.has(key) ? "" : "Setup needed",
      };
    },
    getRestV2LearningServiceCollapsed: () => false,
    getActiveDcrLearningUiState: () => ({ entryKey: "" }),
    getHrContextSummary: () => ({ compositeLabel: "Turner x MML x Xfinity" }),
    escapeHtml: (value = "") => String(value),
    firstNonEmptyString: (values = []) => values.find((value) => String(value || "").trim()) || "",
  });

  const readyHtml = buildDcrInteractiveDocsPanelHtml({ programmerId: "Turner" }, { restV2: true });
  assert.match(readyHtml, /class="hr-rest-v2-docs-shell hr-learning-docs-shell hr-dcr-docs-shell"/);
  assert.match(readyHtml, /data-learning-service-state="ready"/);

  readyEntryKeys.clear();
  const lockedHtml = buildDcrInteractiveDocsPanelHtml({ programmerId: "Turner" }, { restV2: true });
  assert.match(lockedHtml, /data-learning-service-state="locked"/);
});

test("REST V2 learning card mirrors the shared ready vs locked top-level state", () => {
  const readyEntryKeys = new Set(["config"]);
  const { buildRestV2InteractiveDocsPanelHtml } = loadFunctions("popup.js", ["buildRestV2InteractiveDocsPanelHtml"], {
    buildRestV2InteractiveDocsUrl: () => "https://example.test/restv2",
    getRestV2InteractiveDocsSections: () => [
      {
        sectionKey: "configuration",
        sectionLabel: "1. Configuration",
        entries: [
          {
            key: "config",
            label: "Retrieve configuration",
            methodLabel: "GET",
            operationSummary: "Fetch configuration.",
          },
          {
            key: "profiles",
            label: "Get profile",
            methodLabel: "GET",
            operationSummary: "Fetch a profile.",
          },
        ],
      },
    ],
    buildRestV2InteractiveDocsEntryActivationState: (entry = null) => {
      const key = String(entry?.key || "").trim();
      return {
        ready: readyEntryKeys.has(key),
        reason: readyEntryKeys.has(key) ? "" : "Setup needed",
      };
    },
    getHrContextSummary: () => ({ compositeLabel: "Turner x MML x Xfinity" }),
    getRestV2LearningServiceCollapsed: () => false,
    buildRestV2InteractiveDocsSectionHtml: (section = null) =>
      `<section data-section-ready-count="${Number(section?.readyCount || 0)}"></section>`,
    escapeHtml: (value = "") => String(value),
  });

  const readyHtml = buildRestV2InteractiveDocsPanelHtml({ programmerId: "Turner" }, { restV2: true });
  assert.match(readyHtml, /class="hr-rest-v2-docs-shell hr-learning-docs-shell"/);
  assert.match(readyHtml, /data-learning-service-state="ready"/);

  readyEntryKeys.clear();
  const lockedHtml = buildRestV2InteractiveDocsPanelHtml({ programmerId: "Turner" }, { restV2: true });
  assert.match(lockedHtml, /data-learning-service-state="locked"/);
});
