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

test("REST V2 service-provider mismatch detection accepts the plain-language invalid service provider 401", () => {
  const { isServiceProviderTokenMismatchError } = loadFunctions("popup.js", ["isServiceProviderTokenMismatchError"], {
    extractApiErrorCode: () => "",
  });

  assert.equal(
    isServiceProviderTokenMismatchError(
      "REST V2 configuration failed (401): The access token is invalid due to invalid service provider."
    ),
    true
  );
});

test("All Channels scan does not infer universal coverage from missing service-provider hints", () => {
  const popupSource = read("popup.js");
  assert.match(popupSource, /const resolvedAppChannel = getRegisteredAppChannel\(app\);/);
  assert.doesNotMatch(popupSource, /const appIsAllChannels = hints\.length === 0;/);
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

test("BOBTOOLS profile delete runs full REST V2 logout flow instead of skipping user-agent logout action", () => {
  const popupSource = read("popup.js");
  const deleteProfileSource = extractFunctionSource(popupSource, "deleteRestV2ProfileHarvestWithLogout");

  assert.match(deleteProfileSource, /executeRestV2LogoutFlow\(context, flowId\)/);
  assert.doesNotMatch(deleteProfileSource, /skipUserAgentAction\s*:\s*true/);
});

test("MVPD launcher sync preserves selected MVPD when picker is transiently empty", () => {
  const makeButton = () => {
    const classes = new Set();
    return {
      parentElement: null,
      style: {},
      disabled: false,
      tabIndex: 0,
      title: "",
      attributes: {},
      classList: {
        toggle(name, force) {
          if (force) {
            classes.add(name);
            return true;
          }
          classes.delete(name);
          return false;
        },
      },
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
    };
  };

  const row = {
    appendChild(node) {
      node.parentElement = this;
    },
  };
  const button = makeButton();
  const els = {
    mvpdWorkspaceLaunchBtn: button,
    mvpdSelect: {
      value: "",
      options: [],
      selectedOptions: [],
      closest: () => row,
    },
  };
  const state = {
    selectedMvpdId: "Comcast_SSO",
  };

  const { syncGlobalMvpdWorkspaceLauncher } = loadFunctions(
    "popup.js",
    ["resolveStableSelectedMvpdIdFromPicker", "syncGlobalMvpdWorkspaceLauncher"],
    { els, state }
  );

  syncGlobalMvpdWorkspaceLauncher();

  assert.equal(state.selectedMvpdId, "Comcast_SSO");
  assert.equal(button.disabled, false);
  assert.equal(button.style.display, "inline-flex");
  assert.equal(button.attributes["aria-hidden"], "false");
});

test("MVPD launcher sync clears stale MVPD when picker options no longer include it", () => {
  const makeButton = () => {
    const classes = new Set();
    return {
      parentElement: null,
      style: {},
      disabled: false,
      tabIndex: 0,
      title: "",
      attributes: {},
      classList: {
        toggle(name, force) {
          if (force) {
            classes.add(name);
            return true;
          }
          classes.delete(name);
          return false;
        },
      },
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
    };
  };

  const row = {
    appendChild(node) {
      node.parentElement = this;
    },
  };
  const button = makeButton();
  const els = {
    mvpdWorkspaceLaunchBtn: button,
    mvpdSelect: {
      value: "",
      options: [{ value: "Verizon" }],
      selectedOptions: [],
      closest: () => row,
    },
  };
  const state = {
    selectedMvpdId: "Comcast_SSO",
  };

  const { syncGlobalMvpdWorkspaceLauncher } = loadFunctions(
    "popup.js",
    ["resolveStableSelectedMvpdIdFromPicker", "syncGlobalMvpdWorkspaceLauncher"],
    { els, state }
  );

  syncGlobalMvpdWorkspaceLauncher();

  assert.equal(state.selectedMvpdId, "");
  assert.equal(button.disabled, true);
  assert.equal(button.style.display, "none");
  assert.equal(button.attributes["aria-hidden"], "true");
});

test("requestor repopulation keeps selected MVPD when requestor selection is retained", () => {
  const requestorSelect = {
    options: [],
    value: "",
    innerHTML: "",
    appendChild(option) {
      this.options.push(option);
    },
  };
  const mvpdSelect = {
    disabled: false,
    innerHTML: '<option value="Dish">DISH</option>',
    options: [{ value: "Dish" }],
  };
  const els = {
    requestorSelect,
    mvpdSelect,
  };
  const state = {
    selectedRequestorId: "NBADE",
    selectedMvpdId: "Dish",
  };
  const document = {
    createElement() {
      return {
        value: "",
        textContent: "",
      };
    },
  };

  const { populateRequestorSelect } = loadFunctions("popup.js", ["populateRequestorSelect"], {
    state,
    els,
    document,
    getRequestorsForSelectedMediaCompany: () => [{ id: "NBADE", key: "NBADE", label: "NBADE" }],
    resolveSelectedProgrammer: () => ({ programmerId: "NBA" }),
    getCurrentPremiumAppsSnapshot: () => ({}),
    getProgrammerServiceHydrationPromise: () => null,
    syncRequestorSelectHydrationAvailability: () => true,
    syncGlobalQuickLaunchButtons: () => {},
    refreshRestV2LoginPanels: () => {},
    refreshMvpdWorkspaceTools: () => {},
    firstNonEmptyString: (values = []) => values.find((value) => String(value || "").trim()) || "",
  });

  populateRequestorSelect();

  assert.equal(state.selectedRequestorId, "NBADE");
  assert.equal(state.selectedMvpdId, "Dish");
  assert.equal(mvpdSelect.disabled, false);
  assert.match(String(mvpdSelect.innerHTML || ""), /Dish|DISH/);
});

test("requestor repopulation preserves requestor and MVPD during transient hydration gaps", () => {
  const requestorSelect = {
    options: [],
    value: "",
    innerHTML: "",
    appendChild(option) {
      this.options.push(option);
    },
  };
  const mvpdSelect = {
    disabled: false,
    innerHTML: '<option value="Dish">DISH</option>',
    options: [{ value: "Dish" }],
  };
  const els = {
    requestorSelect,
    mvpdSelect,
  };
  const state = {
    selectedRequestorId: "NBADE",
    selectedMvpdId: "Dish",
  };
  const document = {
    createElement() {
      return {
        value: "",
        textContent: "",
      };
    },
  };

  const { populateRequestorSelect } = loadFunctions("popup.js", ["populateRequestorSelect"], {
    state,
    els,
    document,
    getRequestorsForSelectedMediaCompany: () => [],
    resolveSelectedProgrammer: () => ({ programmerId: "NBA" }),
    getCurrentPremiumAppsSnapshot: () => ({}),
    getProgrammerServiceHydrationPromise: () => Promise.resolve(),
    syncRequestorSelectHydrationAvailability: () => true,
    syncGlobalQuickLaunchButtons: () => {},
    refreshRestV2LoginPanels: () => {},
    refreshMvpdWorkspaceTools: () => {},
    firstNonEmptyString: (values = []) => values.find((value) => String(value || "").trim()) || "",
  });

  populateRequestorSelect();

  assert.equal(state.selectedRequestorId, "NBADE");
  assert.equal(state.selectedMvpdId, "Dish");
  assert.equal(mvpdSelect.disabled, false);
  assert.match(String(mvpdSelect.innerHTML || ""), /Dish|DISH/);
});

test("requestor filtering uses derived REST V2 requestor IDs when explicit coverage is temporarily empty", () => {
  const { getRequestorsForSelectedMediaCompany } = loadFunctions("popup.js", ["getRequestorsForSelectedMediaCompany"], {
    state: {
      consoleBootstrapState: {
        channels: [],
      },
    },
    resolveSelectedProgrammer: () => ({
      programmerId: "Rogers Media",
      requestorIds: ["animalplanettv", "foodnetworktv"],
      requestorOptions: [],
    }),
    getCurrentPremiumAppsSnapshot: () => ({
      __restV2RequestorIds: [],
      restV2Apps: [{ guid: "rogers-restv2" }],
    }),
    extractEntityIdFromToken: (value = "") => String(value || "").trim(),
    firstNonEmptyString: (values = []) => values.find((value) => String(value || "").trim()) || "",
    uniqueSorted: (values = []) =>
      Array.from(new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))),
    deriveProgrammerRequestorOptionsFromChannels: () => [],
    resolveStrictRestV2RequestorIdsForProgrammer: () => ["cityvideolive"],
  });

  const options = getRequestorsForSelectedMediaCompany();
  assert.equal(Array.isArray(options), true);
  assert.equal(options.length, 1);
  assert.equal(String(options[0]?.id || ""), "cityvideolive");
});

test("strict REST V2 requestor extraction supports compact app shapes without appData", () => {
  const { collectRestV2RequestorIdsFromApps } = loadFunctions("popup.js", ["collectRestV2RequestorIdsFromApps"], {
    extractEntityIdFromToken: (value = "") => {
      const text = String(value || "").trim();
      const match = text.match(/^@?[A-Za-z][A-Za-z0-9_-]*\s*:(.*)$/);
      return String(match?.[1] || text).trim();
    },
    extractRequestorIdFromServiceProviderValue: (value = "") => {
      const text = String(value || "").trim();
      if (!text) {
        return "";
      }
      const match = text.match(/^@?[A-Za-z][A-Za-z0-9_-]*\s*:(.*)$/);
      return String(match?.[1] || text).trim();
    },
    normalizeEntityToken: (value = "") => String(value || "").trim().toLowerCase(),
    getRegisteredAppChannel: () => null,
  });

  const ids = collectRestV2RequestorIdsFromApps(
    [
      {
        guid: "dc47cbac-5b06-40a8-86bb-2d2901f37589",
        serviceProviders: ["@ServiceProvider:REF30"],
      },
      {
        guid: "9bd95093-1a49-4c87-a8a0-3b091ff7e9d9",
        raw: {
          serviceProviders: ["@ServiceProvider:TestDistributors"],
        },
      },
    ],
    "Adobe"
  );

  assert.equal(Array.isArray(ids), true);
  assert.equal(ids.length, 2);
  assert.equal(ids.includes("REF30"), true);
  assert.equal(ids.includes("TestDistributors"), true);
});

test("requestor filtering fallback no longer widens to global channel list", () => {
  const { getRequestorsForSelectedMediaCompany } = loadFunctions("popup.js", ["getRequestorsForSelectedMediaCompany"], {
    state: {
      consoleBootstrapState: {
        channels: [
          { id: "animalplanettv", name: "Animal Planet", programmerId: "Rogers Media" },
          { id: "global-other", name: "Other", programmerId: "Different Co" },
        ],
      },
    },
    resolveSelectedProgrammer: () => ({
      programmerId: "Rogers Media",
      requestorIds: [],
      requestorOptions: [],
    }),
    getCurrentPremiumAppsSnapshot: () => ({
      __restV2RequestorIds: null,
      restV2Apps: [],
    }),
    extractEntityIdFromToken: (value = "") => String(value || "").trim(),
    firstNonEmptyString: (values = []) => values.find((value) => String(value || "").trim()) || "",
    uniqueSorted: (values = []) =>
      Array.from(new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))),
    deriveProgrammerRequestorOptionsFromChannels: () => [],
    resolveStrictRestV2RequestorIdsForProgrammer: () => [],
  });

  const options = getRequestorsForSelectedMediaCompany();
  assert.equal(Array.isArray(options), true);
  assert.equal(options.length, 0);
});

test("requestor eligibility rejects IDs outside explicit REST V2 requestor coverage", () => {
  const { isRequestorEligibleForSelectedProgrammer } = loadFunctions(
    "popup.js",
    ["isRequestorEligibleForSelectedProgrammer"],
    {
      resolveSelectedProgrammer: () => ({ programmerId: "Rogers Media", requestorIds: ["cityvideolive"] }),
      getCurrentPremiumAppsSnapshot: () => ({ __restV2RequestorIds: ["cityvideolive"] }),
      extractEntityIdFromToken: (value = "") => String(value || "").trim(),
      resolveStrictRestV2RequestorIdsForProgrammer: () => ["cityvideolive"],
    }
  );

  assert.equal(isRequestorEligibleForSelectedProgrammer("animalplanettv"), false);
  assert.equal(isRequestorEligibleForSelectedProgrammer("cityvideolive"), true);
});

test("requestor filtering treats All Channels REST V2 coverage as wildcard", () => {
  const { getRequestorsForSelectedMediaCompany } = loadFunctions("popup.js", ["getRequestorsForSelectedMediaCompany"], {
    state: {
      consoleBootstrapState: {
        channels: [],
      },
    },
    resolveSelectedProgrammer: () => ({
      programmerId: "AETN",
      requestorIds: ["AETN", "HISTORY", "FYI"],
      requestorOptions: [],
    }),
    getCurrentPremiumAppsSnapshot: () => ({
      __restV2AllChannels: true,
      __restV2RequestorIds: null,
      restV2Apps: [{ guid: "aetn-restv2-all" }],
    }),
    resolveStrictRestV2RequestorIdsForProgrammer: () => null,
    extractEntityIdFromToken: (value = "") => String(value || "").trim(),
    firstNonEmptyString: (values = []) => values.find((value) => String(value || "").trim()) || "",
    uniqueSorted: (values = []) =>
      Array.from(new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))),
    deriveProgrammerRequestorOptionsFromChannels: () => [],
  });

  const options = getRequestorsForSelectedMediaCompany();
  assert.equal(Array.isArray(options), true);
  assert.equal(options.length, 3);
  assert.deepEqual(
    options.map((option) => String(option?.id || "")),
    ["AETN", "HISTORY", "FYI"]
  );
});

test("requestor eligibility allows any selected requestor when REST V2 coverage is All Channels", () => {
  const { isRequestorEligibleForSelectedProgrammer } = loadFunctions(
    "popup.js",
    ["isRequestorEligibleForSelectedProgrammer"],
    {
      resolveSelectedProgrammer: () => ({ programmerId: "AETN", requestorIds: ["HISTORY"] }),
      getCurrentPremiumAppsSnapshot: () => ({ __restV2AllChannels: true, __restV2RequestorIds: null }),
      extractEntityIdFromToken: (value = "") => String(value || "").trim(),
      resolveStrictRestV2RequestorIdsForProgrammer: () => null,
    }
  );

  assert.equal(isRequestorEligibleForSelectedProgrammer("HISTORY"), true);
  assert.equal(isRequestorEligibleForSelectedProgrammer("FYI"), true);
});

test("requestor filtering uses programmer-scoped REST V2 candidates when premium app list is empty", () => {
  const { getRequestorsForSelectedMediaCompany, resolveStrictRestV2RequestorIdsForProgrammer } = loadFunctions(
    "popup.js",
    ["resolveStrictRestV2RequestorIdsForProgrammer", "getRequestorsForSelectedMediaCompany"],
    {
      state: {
        consoleBootstrapState: {
          channels: [],
        },
      },
      resolveSelectedProgrammer: () => ({
        programmerId: "Adobe",
        requestorIds: ["REF30", "TestDistributors", "Other"],
        requestorOptions: [],
      }),
      getCurrentPremiumAppsSnapshot: () => ({
        restV2Apps: [],
      }),
      collectProgrammerScopedRestV2AppCandidates: (programmerId = "", premiumApps = null) => {
        assert.equal(programmerId, "Adobe");
        assert.equal(Array.isArray(premiumApps?.restV2Apps), true);
        assert.equal((premiumApps?.restV2Apps || []).length, 0);
        return [
          { guid: "restv2-ref30", serviceProviders: ["@ServiceProvider:REF30"] },
          { guid: "restv2-test", serviceProviders: ["@ServiceProvider:TestDistributors"] },
        ];
      },
      collectRestV2RequestorIdsFromApps: (apps = []) => {
        const ids = [];
        apps.forEach((appInfo) => {
          (Array.isArray(appInfo?.serviceProviders) ? appInfo.serviceProviders : []).forEach((entry) => {
            const text = String(entry || "").trim();
            const match = text.match(/^@?[A-Za-z][A-Za-z0-9_-]*\s*:(.*)$/);
            const id = String(match?.[1] || text).trim();
            if (id) {
              ids.push(id);
            }
          });
        });
        return ids;
      },
      isAllChannelsApp: () => false,
      extractEntityIdFromToken: (value = "") => String(value || "").trim(),
      firstNonEmptyString: (values = []) => values.find((value) => String(value || "").trim()) || "",
      uniqueSorted: (values = []) =>
        Array.from(new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))),
      deriveProgrammerRequestorOptionsFromChannels: () => [],
    }
  );

  assert.deepEqual(resolveStrictRestV2RequestorIdsForProgrammer("Adobe", { restV2Apps: [] }), [
    "REF30",
    "TestDistributors",
  ]);

  const options = getRequestorsForSelectedMediaCompany();
  assert.equal(Array.isArray(options), true);
  assert.equal(options.length, 2);
  assert.deepEqual(
    options.map((option) => String(option?.id || "")),
    ["REF30", "TestDistributors"]
  );
});

test("strict REST V2 requestor resolver returns wildcard for All Channels apps", () => {
  const { resolveStrictRestV2RequestorIdsForProgrammer } = loadFunctions(
    "popup.js",
    ["resolveStrictRestV2RequestorIdsForProgrammer"],
    {
      collectProgrammerScopedRestV2AppCandidates: () => [
        { guid: "aetn-restv2-all", serviceProviders: [] },
      ],
      isAllChannelsApp: () => true,
      collectRestV2RequestorIdsFromApps: () => ["HISTORY"],
    }
  );

  assert.equal(resolveStrictRestV2RequestorIdsForProgrammer("AETN", { restV2Apps: [] }), null);
});

test("All Channels classifier treats explicit empty service provider arrays as wildcard coverage", () => {
  const { isAllChannelsApp } = loadFunctions("popup.js", ["isAllChannelsApp"], {
    getRegisteredAppChannel: () => null,
  });

  assert.equal(isAllChannelsApp({ serviceProviders: [] }), true);
  assert.equal(isAllChannelsApp({ appData: { serviceProviders: [] } }), true);
  assert.equal(isAllChannelsApp({ __rawEnvelope: { entityData: { serviceProviders: [] } } }), true);
  assert.equal(isAllChannelsApp({ serviceProviders: ["@ServiceProvider:HISTORY"] }), false);
});

test("getRegisteredAppChannel treats Console entityData with scopes but no channel hints as All Channels", () => {
  const {
    getRegisteredAppChannel,
    isAllChannelsApp,
  } = loadFunctions("popup.js", ["getRegisteredAppChannel", "isAllChannelsApp"], {
    sanitizePassVaultHintList: (...args) => args.flat().filter((v) => typeof v === "string" && v.trim()),
    isAllChannelsServiceProviderValue: (v) => !String(v || "").trim(),
    extractRequestorIdFromServiceProviderValue: (v) => (String(v || "").trim() ? String(v || "").trim() : ""),
    firstNonEmptyString: (values = []) => values.find((v) => String(v || "").trim()) || "",
    collectPassVaultServiceProviderHintsFromAppData: () => [],
    extractSoftwareStatementFromAppData: () => "",
    normalizeEntityToken: (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, ""),
    extractEntityIdFromToken: (v) => String(v || "").replace(/^@[^:]+:/, "").trim(),
  });

  // Real Console shape: scopes are on appInfo.scopes (normalized after record construction),
  // entityData only has id/name — NO scopes field, NO serviceProviders field.
  const allChannelsFromConsole = {
    scopes: ["urn:adobe:adobepass:api:client:v2"],
    appData: {
      __rawEnvelope: {
        entityData: {
          name: "AETN_API_V2_DCR",
          id: "97d55249-6e0c-4feb-a112-1d10bb9f4506",
          // no serviceProviders — All Channels apps omit this field
          // no scopes — Console puts scopes at item level, not entityData
        },
      },
    },
  };
  assert.equal(getRegisteredAppChannel(allChannelsFromConsole), "");
  assert.equal(isAllChannelsApp(allChannelsFromConsole), true);

  // Also vault-backed app with scopes but NO entityData at all: ambiguous, return null
  // (don't assume All Channels; the app might be channel-specific with JWT not yet decoded).
  const allChannelsVaultBacked = {
    appData: {
      name: "AETN_API_V2_DCR",
      id: "97d55249-6e0c-4feb-a112-1d10bb9f4506",
      scopes: ["urn:adobe:adobepass:api:client:v2"],
      // NO __rawEnvelope.entityData — this is pure vault-backed
    },
  };
  // No entityData at all → can't use scope fallback → return null.
  // This is correct: the app might be channel-specific (AETV) with JWT not yet decoded.
  assert.equal(getRegisteredAppChannel(allChannelsVaultBacked), null);

  // Channel-specific app: entityData present with serviceProviders hint.
  const channelSpecific = {
    scopes: ["urn:adobe:adobepass:api:client:v2"],
    appData: {
      __rawEnvelope: {
        entityData: {
          name: "TBS_API_V2_DCR",
          serviceProviders: ["@ServiceProvider:TBS"],
        },
      },
    },
  };
  assert.notEqual(getRegisteredAppChannel(channelSpecific), "");
  assert.equal(isAllChannelsApp(channelSpecific), false);

  // App with no scopes at all — should NOT be treated as All Channels (fall through).
  const noScopes = {
    appData: {
      __rawEnvelope: {
        entityData: {
          name: "MYSTERY_APP",
        },
      },
    },
  };
  // No scopes → falls through to JWT → no JWT → no appData hints → null (not "")
  assert.notEqual(getRegisteredAppChannel(noScopes), "");
});

test("sanitized app data preserves explicit empty service provider arrays", () => {
  const { sanitizePassVaultApplicationData } = loadFunctions("popup.js", ["sanitizePassVaultApplicationData"], {
    firstNonEmptyString: (values = []) => values.find((value) => String(value || "").trim()) || "",
    getDetectionScopesFromApplication: () => [],
    collectPassVaultServiceProviderHintsFromAppData: () => [],
    sanitizePassVaultHintList: () => [],
    sanitizePassVaultHintValue: () => "",
    extractPassVaultPrimaryRequestorHintFromAppData: () => "",
    extractSoftwareStatementFromAppData: () => "",
  });

  const sanitized = sanitizePassVaultApplicationData(
    {
      name: "AETN_API_V2_DCR",
      serviceProviders: [],
    },
    "97d55249-6e0c-4feb-a112-1d10bb9f4506",
    "fallback"
  );

  assert.equal(Array.isArray(sanitized?.serviceProviders), true);
  assert.equal((sanitized?.serviceProviders || []).length, 0);
});

test("strict REST V2 requestor resolver honors persisted all-channels map metadata", () => {
  const { resolveStrictRestV2RequestorIdsForProgrammer } = loadFunctions(
    "popup.js",
    ["resolveStrictRestV2RequestorIdsForProgrammer"],
    {
      collectProgrammerScopedRestV2AppCandidates: () => [],
      isAllChannelsApp: () => false,
      collectRestV2RequestorIdsFromApps: () => [],
    }
  );

  assert.equal(
    resolveStrictRestV2RequestorIdsForProgrammer("AETN", {
      __allChannelsByServiceKey: {
        restV2: true,
      },
    }),
    null
  );
});

test("ENVx hydration persists all-channels coverage metadata for premium services", () => {
  const { buildPassVaultDirectPremiumServicesSnapshot } = loadFunctions(
    "popup.js",
    ["buildPassVaultDirectPremiumServicesSnapshot"],
    {
      REST_V2_SCOPE: "api:client:v2",
      PREMIUM_SERVICE_SCOPE_BY_KEY: { esm: "api:client:esm" },
      PREMIUM_SERVICE_RESET_TEMPPASS_SCOPE: "api:client:resetTempPass",
      registeredApplicationMatchesNativeRequiredScope: () => false,
      degradationAppHasRequiredScope: () => false,
      selectPreferredPassVaultHydrationServiceApplication: () => null,
      collectRestV2RequestorIdsFromApps: () => [],
      applyPremiumServiceRuntimeSummary: (_programmer, services = {}) => services,
      state: { cmTenantsCatalog: [] },
      scanAllChannelsServiceCoverage: () => ({
        winnerByServiceKey: {},
        allChannelsByServiceKey: {
          restV2: true,
          esm: false,
          degradation: false,
          resetTempPass: false,
        },
        allScopeAppsByServiceKey: {
          restV2: [{ guid: "aetn-restv2-all", serviceProviders: [] }],
          esm: [],
          degradation: [],
          resetTempPass: [],
        },
      }),
    }
  );

  const services = buildPassVaultDirectPremiumServicesSnapshot(
    { programmerId: "AETN" },
    [],
    {},
    {}
  );

  assert.equal(services.__restV2AllChannels, true);
  assert.equal(services.__restV2RequestorIds, null);
  assert.equal(services.__allChannelsByServiceKey?.restV2, true);
});

test("MVPD config loader skips stale requestor IDs during hydration", async () => {
  const state = {
    selectedRequestorId: "animalplanettv",
    selectedMvpdId: "Comcast_SSO",
  };
  const els = {
    requestorSelect: {
      value: "animalplanettv",
    },
    mvpdSelect: {
      innerHTML: "",
      disabled: false,
      value: "",
    },
  };
  let loadCalls = 0;
  let statusMessage = "";
  let statusType = "";
  const { populateMvpdSelectForRequestor } = loadFunctions("popup.js", ["populateMvpdSelectForRequestor"], {
    state,
    els,
    resolveSelectedProgrammer: () => ({ programmerId: "Rogers Media" }),
    getCurrentPremiumAppsSnapshot: () => ({ __restV2RequestorIds: ["cityvideolive"] }),
    isRequestorEligibleForSelectedProgrammer: () => false,
    loadMvpdsFromRestV2: async () => {
      loadCalls += 1;
      return new Map();
    },
    syncGlobalQuickLaunchButtons: () => {},
    refreshRestV2LoginPanels: () => {},
    refreshMvpdWorkspaceTools: () => {},
    refreshRestV2LearningUi: () => {},
    setStatus: (message = "", type = "info") => {
      statusMessage = String(message || "");
      statusType = String(type || "");
    },
  });

  await populateMvpdSelectForRequestor("animalplanettv");

  assert.equal(loadCalls, 0);
  assert.equal(state.selectedRequestorId, "animalplanettv");
  assert.equal(state.selectedMvpdId, "");
  assert.equal(String(els.requestorSelect.value || ""), "animalplanettv");
  assert.equal(els.mvpdSelect.disabled, true);
  assert.match(statusMessage, /Select a Content Provider first\./);
  assert.equal(statusType, "info");
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

test("sidepanel MEGSPACE saved-query picker now uses a native select while standalone MEG keeps the deferred native picker flow", () => {
  const popupSource = read("popup.js");
  const megSource = read("meg-workspace.js");

  assert.match(
    popupSource,
    /class="esm-workspace-meg-saved-picker" hidden>[\s\S]*?class="esm-workspace-meg-saved-select"/m
  );
  assert.match(
    popupSource,
    /megSavedQuerySelectElement:\s*contentElement\.querySelector\("\.esm-workspace-meg-saved-select"\)/m
  );
  assert.match(
    popupSource,
    /megSavedQuerySelectElement\?\.addEventListener\("change", async \(\) => \{[\s\S]*?const selectedRecord = esmWorkspaceGetSelectedMegSavedQueryRecord\(esmWorkspaceState\);[\s\S]*?esmWorkspaceQueueMegSavedQueryLaunch\(esmWorkspaceState, selectedRecord\);/m
  );
  assert.match(
    megSource,
    /savedQueryPicker\?\.addEventListener\("change", async \(\) => \{[\s\S]*?const executeSavedQuerySelection = async \(\) => \{[\s\S]*?await loadSelectedSavedQuery\(selectedOption\);[\s\S]*?setTimeout\(\(\) => \{\s*void executeSavedQuerySelection\(\);/m
  );
  assert.doesNotMatch(popupSource, /esm-workspace-meg-saved-trigger/);
  assert.doesNotMatch(popupSource, /esm-workspace-meg-saved-menu/);
  assert.doesNotMatch(popupSource, /esmWorkspaceToggleMegSavedQueryMenu|closeAllEsmWorkspaceMegSavedQueryMenus|resolveEsmWorkspaceStateFromMegSavedQueryNode/);
});

test("sidepanel MEGSPACE saved-query sync defers DOM rebuilds while the native picker is active", () => {
  const selectElement = {
    innerHTML: "existing",
    selectedOptions: [],
  };
  const esmWorkspaceState = {
    megSavedQueryPickerElement: {
      hidden: false,
      classList: {
        remove() {},
        toggle() {},
      },
    },
    megSavedQuerySelectElement: selectElement,
    megSavedQueryInteractionActive: true,
    megSavedQueryDeferredSyncPending: false,
  };
  const { esmWorkspaceSyncMegSavedQueryUi } = loadFunctions("popup.js", ["esmWorkspaceSyncMegSavedQueryUi"], {
    popupGetSavedEsmQueryRecords: () => [
      {
        storageKey: "underpar:saved-esm-query:daily-auth",
        name: "Daily Auth",
        url: "/esm/v3/media-company/year/day?requestor-id=MML",
      },
    ],
    esmWorkspaceSyncMegSavedQuerySelectMetadata: () => {},
    document: {
      createElement() {
        throw new Error("DOM rebuild should be deferred while picker interaction is active");
      },
    },
  });

  esmWorkspaceSyncMegSavedQueryUi(esmWorkspaceState);

  assert.equal(esmWorkspaceState.megSavedQueryDeferredSyncPending, true);
  assert.equal(selectElement.innerHTML, "existing");
  assert.equal(esmWorkspaceState.megSavedQueryRecords?.[0]?.name, "Daily Auth");
});

test("sidepanel MEGSPACE saved-query launch waits until after the native menu closes before disabling the picker", async () => {
  const timers = [];
  const interactions = {
    runs: [],
    activeStates: [],
  };
  const esmWorkspaceState = {
    megSavedQueryBusy: false,
    megSavedQueryInteractionActive: false,
    megSavedQueryDeferredSyncPending: false,
  };
  const { esmWorkspaceQueueMegSavedQueryLaunch } = loadFunctions(
    "popup.js",
    ["esmWorkspaceQueueMegSavedQueryLaunch"],
    {
      setTimeout: (callback) => {
        timers.push(callback);
        return timers.length;
      },
      esmWorkspaceSetMegSavedQueryInteractionState: (_state, active) => {
        interactions.activeStates.push(active);
        _state.megSavedQueryInteractionActive = active === true;
      },
      esmWorkspaceRunMegSavedQueryRecord: async (_state, record) => {
        interactions.runs.push(record);
      },
    }
  );

  esmWorkspaceQueueMegSavedQueryLaunch(esmWorkspaceState, {
    name: "Daily Auth",
    url: "/esm/v3/media-company/year/day?requestor-id=MML",
  });

  assert.equal(esmWorkspaceState.megSavedQueryPendingLaunchRecord?.name, "Daily Auth");
  assert.deepEqual(interactions.runs, []);
  assert.equal(timers.length, 1);

  await timers[0]();

  assert.equal(interactions.runs.length, 1);
  assert.equal(interactions.runs[0]?.name, "Daily Auth");
  assert.equal(interactions.runs[0]?.url, "/esm/v3/media-company/year/day?requestor-id=MML");
  assert.equal(esmWorkspaceState.megSavedQueryPendingLaunchRecord, null);
  assert.equal(interactions.activeStates[0], true);
});

test("sidepanel MEGSPACE native saved-query select keeps the embedded monochrome picker styling", () => {
  const popupCss = read("popup.css");

  assert.match(
    popupCss,
    /\.service-esm \.esm-workspace-meg-saved-picker::after \{[\s\S]*?content:\s*"▾";/m
  );
  assert.match(
    popupCss,
    /\.service-esm \.esm-workspace-meg-saved-select \{[\s\S]*?padding:\s*0 30px 0 8px;[\s\S]*?appearance:\s*none;[\s\S]*?-webkit-appearance:\s*none;/m
  );
  assert.match(
    popupCss,
    /\.service-esm :is\(\.esm-workspace-search, \.esm-workspace-zoom-filter, \.esm-workspace-meg-select, \.esm-workspace-meg-saved-select\)/m
  );
});

test("sidepanel MEGSPACE saved-query runner disables the native select while launching and resets it afterward", async () => {
  const interactions = {
    opened: null,
    resetTarget: null,
  };
  const pickerElement = {
    classList: {
      added: [],
      removed: [],
      add(name) {
        this.added.push(name);
      },
      remove(name) {
        this.removed.push(name);
      },
    },
  };
  const selectElement = {
    disabled: false,
    setAttribute(name, value) {
      this[name] = value;
    },
    removeAttribute(name) {
      delete this[name];
    },
  };
  const esmWorkspaceState = {
    megSavedQueryPickerElement: pickerElement,
    megSavedQuerySelectElement: selectElement,
    megSavedQueryRecords: [{ name: "Daily Auth", url: "/esm/v3/media-company/year/day?requestor-id=MML" }],
    megSavedQueryBusy: false,
    programmer: {
      programmerId: "Turner",
    },
    requestToken: 19,
  };
  const { esmWorkspaceRunMegSavedQueryRecord } = loadFunctions("popup.js", ["esmWorkspaceRunMegSavedQueryRecord"], {
    state: {
      premiumPanelRequestToken: 31,
    },
    resolveCurrentPremiumPanelRequestToken: (_programmerId, requestToken) => Number(requestToken || 0),
    esmWorkspaceOpenRequestPathInWorkspace: async (...args) => {
      interactions.opened = args;
    },
    setStatus: () => {},
    resetEsmWorkspaceMegSavedQuerySelect: (target) => {
      interactions.resetTarget = target;
    },
  });

  await esmWorkspaceRunMegSavedQueryRecord(esmWorkspaceState, {
    name: "Daily Auth",
    url: "/esm/v3/media-company/year/day?requestor-id=MML",
  });

  assert.equal(esmWorkspaceState.megSavedQueryBusy, false);
  assert.equal(selectElement.disabled, false);
  assert.equal(selectElement["aria-busy"], undefined);
  assert.equal(interactions.opened?.length, 4);
  assert.equal(interactions.opened?.[0], esmWorkspaceState);
  assert.equal(interactions.opened?.[1], "/esm/v3/media-company/year/day?requestor-id=MML");
  assert.equal(interactions.opened?.[2], 19);
  assert.equal(interactions.opened?.[3]?.requestSource, "saved-query");
  assert.equal(interactions.opened?.[3]?.displayNodeLabel, "Daily Auth");
  assert.equal(interactions.resetTarget, selectElement);
  assert.deepEqual(pickerElement.classList.added, ["is-busy"]);
  assert.deepEqual(pickerElement.classList.removed, ["is-busy"]);
});

test("sidepanel MEGSPACE saved-query runner sends the saved URL back through the ESM Workspace opener", async () => {
  const interactions = {
    opened: null,
    resetTarget: null,
  };
  const pickerElement = {
    classList: {
      added: [],
      removed: [],
      add(name) {
        this.added.push(name);
      },
      remove(name) {
        this.removed.push(name);
      },
    },
  };
  const selectElement = {
    disabled: false,
    setAttribute(name, value) {
      this[name] = value;
    },
    removeAttribute(name) {
      delete this[name];
    },
  };
  const esmWorkspaceState = {
    megSavedQueryPickerElement: pickerElement,
    megSavedQuerySelectElement: selectElement,
    megSavedQueryRecords: [{ name: "Daily Auth", url: "/esm/v3/media-company/year/day?requestor-id=MML" }],
    megSavedQueryBusy: false,
    programmer: {
      programmerId: "Turner",
    },
    requestToken: 15,
  };
  const { esmWorkspaceRunMegSavedQueryRecord } = loadFunctions("popup.js", ["esmWorkspaceRunMegSavedQueryRecord"], {
    state: {
      premiumPanelRequestToken: 23,
    },
    resolveCurrentPremiumPanelRequestToken: (_programmerId, requestToken) => Number(requestToken || 0),
    esmWorkspaceOpenRequestPathInWorkspace: async (...args) => {
      interactions.opened = args;
    },
    setStatus: () => {},
    resetEsmWorkspaceMegSavedQuerySelect: (target) => {
      interactions.resetTarget = target;
    },
  });

  await esmWorkspaceRunMegSavedQueryRecord(
    esmWorkspaceState,
    {
      name: "Daily Auth",
      url: "/esm/v3/media-company/year/day?requestor-id=MML",
    }
  );

  assert.equal(interactions.opened?.length, 4);
  assert.equal(interactions.opened?.[0], esmWorkspaceState);
  assert.equal(interactions.opened?.[1], "/esm/v3/media-company/year/day?requestor-id=MML");
  assert.equal(interactions.opened?.[2], 15);
  assert.equal(interactions.opened?.[3]?.requestSource, "saved-query");
  assert.equal(interactions.opened?.[3]?.displayNodeLabel, "Daily Auth");
  assert.equal(interactions.resetTarget, selectElement);
  assert.deepEqual(pickerElement.classList.added, ["is-busy"]);
  assert.deepEqual(pickerElement.classList.removed, ["is-busy"]);
  assert.equal(selectElement.disabled, false);
});

test("sidepanel MEGSPACE saved-query runner reports ESM Workspace launch failures without leaving the picker busy", async () => {
  const interactions = {
    statuses: [],
    resetTarget: null,
  };
  const pickerElement = {
    classList: {
      added: [],
      removed: [],
      add(name) {
        this.added.push(name);
      },
      remove(name) {
        this.removed.push(name);
      },
    },
  };
  const selectElement = {
    disabled: false,
    setAttribute(name, value) {
      this[name] = value;
    },
    removeAttribute(name) {
      delete this[name];
    },
  };
  const esmWorkspaceState = {
    megSavedQueryPickerElement: pickerElement,
    megSavedQuerySelectElement: selectElement,
    megSavedQueryRecords: [{ name: "Daily Auth", url: "/esm/v3/media-company/year/day?requestor-id=MML" }],
    megSavedQueryBusy: false,
    programmer: {
      programmerId: "Turner",
    },
    requestToken: 29,
  };
  const { esmWorkspaceRunMegSavedQueryRecord } = loadFunctions("popup.js", ["esmWorkspaceRunMegSavedQueryRecord"], {
    state: {
      premiumPanelRequestToken: 37,
    },
    resolveCurrentPremiumPanelRequestToken: (_programmerId, requestToken) => Number(requestToken || 0),
    esmWorkspaceOpenRequestPathInWorkspace: async () => {
      throw new Error("selection bridge failed");
    },
    setStatus: (message, level) => {
      interactions.statuses.push({ message, level });
    },
    resetEsmWorkspaceMegSavedQuerySelect: (target) => {
      interactions.resetTarget = target;
    },
  });

  await esmWorkspaceRunMegSavedQueryRecord(esmWorkspaceState, {
    name: "Daily Auth",
    url: "/esm/v3/media-company/year/day?requestor-id=MML",
  });

  assert.equal(esmWorkspaceState.megSavedQueryBusy, false);
  assert.equal(selectElement.disabled, false);
  assert.equal(selectElement["aria-busy"], undefined);
  assert.equal(interactions.resetTarget, selectElement);
  assert.deepEqual(interactions.statuses, [
    {
      message: 'Unable to open Saved Query "Daily Auth" in ESM Workspace: selection bridge failed',
      level: "error",
    },
  ]);
});

test("sidepanel MEGSPACE saved-query runner routes saved queries through the ESM Workspace opener", () => {
  const popupSource = read("popup.js");

  assert.match(
    popupSource,
    /await esmWorkspaceOpenRequestPathInWorkspace\(esmWorkspaceState, savedQueryUrl, requestToken, \{[\s\S]*?requestSource:\s*"saved-query",[\s\S]*?displayNodeLabel:\s*savedQueryName,[\s\S]*?\}\);/m
  );
  assert.doesNotMatch(popupSource, /await megWorkspaceOpenSavedQueryFromUi\(/m);
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
  assert.equal(
    isRestV2RedirectAtPostLoginTarget(
      "https://developer.adobe.com/adobe-pass/api/rest_api_v2/interactive/1-configuration",
      normalizeAdobeNavigationUrl("https://developer.adobe.com/adobe-pass/api/rest_api_v2/interactive/")
    ),
    true
  );
});

test("REST V2 Bobtools redirect watcher checks the configured redirect, the canonical docs target, and the launch page", () => {
  const popupSource = read("popup.js");

  assert.match(
    popupSource,
    /const redirectCandidates = \[\s*String\(recordingContext\?\.redirectUrl \|\| ""\)\.trim\(\),\s*String\(PREMIUM_SERVICE_DOCUMENTATION_URL_BY_KEY\.restV2 \|\| ""\)\.trim\(\),\s*String\(state\.restV2PreviousTabUrl \|\| ""\)\.trim\(\),\s*\]\.filter\(Boolean\);/m
  );
  assert.match(popupSource, /const shouldProbeCompletedNavigation = !matchesRedirect && navigationStatus === "complete";/);
});

test("REST V2 Bobtools redirect watcher hands the launch tab off to BOBTOOLS before profile hydration begins", () => {
  const popupSource = read("popup.js");

  assert.match(
    popupSource,
    /await handoffRestV2LaunchTabToBobtoolsWorkspace\(normalizedTabId, activeFlowId, \{[\s\S]*?\}\);[\s\S]*?await ensureRestV2ProfilesHydratedForBobtools\(hydrationContext/m
  );
  assert.match(popupSource, /function bobtoolsWorkspaceRefreshSelection\(programmer = null, targetWindowId = 0\)/);
});

test("REST V2 redirect-intercept hands off to BOBTOOLS before running the post-auth profile probe", () => {
  const popupSource = read("popup.js");

  assert.match(
    popupSource,
    /if \(matchesRedirect\) \{[\s\S]*?handoffRestV2LaunchTabToBobtoolsWorkspace\(normalizedTabId, activeFlowId, \{[\s\S]*?reason: "redirect-intercept"[\s\S]*?\}\);[\s\S]*?\}[\s\S]*?const postAuthProbe = await probeRestV2PostAuthProfiles\(/m
  );
});

test("REST V2 live-success fallback only swaps the launch tab after a completed navigation returns an active profile", () => {
  const popupSource = read("popup.js");

  assert.match(
    popupSource,
    /if \(!matchesRedirect && !isRestV2ProfileSessionActiveResult\(profileCheckResult\)\) \{\s*return;\s*\}/m
  );
  assert.match(
    popupSource,
    /if \(!handoffResult\) \{[\s\S]*?handoffRestV2LaunchTabToBobtoolsWorkspace\(normalizedTabId, activeFlowId, \{[\s\S]*?reason: "live-profile-success"[\s\S]*?\}\);/m
  );
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

test("REST V2 popup-close BOBTOOLS launch prefers the live popup window before the prior browsing window", async () => {
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
    assert.equal(windowId, 999);
  });
});

test("REST V2 popup-close BOBTOOLS launch falls back from a closed popup window to the prior browsing window", async () => {
  const { resolveRestV2BobtoolsLaunchWindowId } = loadFunctions("popup.js", ["resolveRestV2BobtoolsLaunchWindowId"], {
    state: {
      restV2PreviousTabId: 71,
    },
    getTabByIdSafe: async () => ({ id: 71, windowId: 314 }),
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
    assert.equal(windowId, 314);
  });
});

test("REST V2 popup-close BOBTOOLS launch falls back from missing popup and browsing windows to the controller window", async () => {
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

test("REST V2 launch-tab handoff reuses the launch tab for BOBTOOLS and clears login-window tracking", async () => {
  const debugEvents = [];
  const state = {
    restV2LastLaunchTabId: 55,
    restV2LastLaunchWindowId: 77,
  };
  let boundTab = null;
  let refreshedWindowId = 0;
  const { handoffRestV2LaunchTabToBobtoolsWorkspace } = loadFunctions(
    "popup.js",
    ["handoffRestV2LaunchTabToBobtoolsWorkspace"],
    {
      state,
      chrome: {
        tabs: {
          update: async (tabId, updateInfo) => ({
            id: tabId,
            windowId: 77,
            url: updateInfo.url,
          }),
        },
      },
      bobtoolsWorkspaceGetWorkspaceUrl: () => "chrome-extension://underpar/bobtools-workspace.html",
      bobtoolsWorkspaceBindWorkspaceTab: (windowId, tabId) => {
        boundTab = { windowId, tabId };
      },
      bobtoolsWorkspaceRefreshSelection: (_programmer, windowId) => {
        refreshedWindowId = Number(windowId || 0);
      },
      resolveSelectedProgrammer: () => ({ programmerId: "MLB", programmerName: "MLB" }),
      emitRestV2DebugEvent: (...args) => {
        debugEvents.push(args);
      },
    }
  );

  const result = await handoffRestV2LaunchTabToBobtoolsWorkspace(55, "flow-55", {
    reason: "live-profile-success",
  });

  assert.equal(result?.ok, true);
  assert.equal(result?.tabId, 55);
  assert.equal(result?.windowId, 77);
  assert.deepEqual(boundTab, { windowId: 77, tabId: 55 });
  assert.equal(refreshedWindowId, 77);
  assert.equal(state.restV2LastLaunchTabId, 0);
  assert.equal(state.restV2LastLaunchWindowId, 0);
  assert.equal(debugEvents[0]?.[0], "flow-55");
  assert.equal(debugEvents[0]?.[1]?.phase, "bobtools-launch-tab-handoff");
  assert.equal(debugEvents[0]?.[1]?.reason, "live-profile-success");
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
      isUsableRestV2ProfileHarvest: (harvest) => Boolean(harvest && typeof harvest === "object"),
      findRestV2HarvestByRequestorAndMvpd: (list, requestorId, mvpd) =>
        list.find((item) => item.requestorId === requestorId && item.mvpd === mvpd) || null,
      getRestV2MvpdPickerLabel: () => "Xfinity (Comcast_SSO)",
      getRestV2HarvestRecordKey: () => "harvest-1",
      getBobtoolsWorkspaceSelectedHarvestKey: () => "",
      firstNonEmptyString: (values = []) => values.find((value) => String(value || "").trim()) || "",
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

test("BOBTOOLS refresh paths preserve explicit per-window profile selection instead of forcing global requestor/MVPD fallback", () => {
  const popupSource = read("popup.js");

  assert.match(
    popupSource,
    /const selectedHarvestKey = firstNonEmptyString\(\[[\s\S]*?getBobtoolsWorkspaceSelectedHarvestKey\(targetWindowId\),[\s\S]*?selectionContext\.selectedHarvestKey,[\s\S]*?\]\);/m
  );
  assert.match(
    popupSource,
    /function buildBobtoolsWorkspaceSelectionContext\(programmer = null, appInfoOverride = null, options = \{\}\)[\s\S]*?const preferredHarvestKey = firstNonEmptyString\(\[[\s\S]*?getBobtoolsWorkspaceSelectedHarvestKey\(targetWindowId\),[\s\S]*?\]\);/m
  );
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
