const UNDERPAR_ESM_DEEPLINK_STORAGE_KEY = "underpar_pending_esm_deeplink_v1";
const UNDERPAR_ESM_DEEPLINK_CONTROLLER_PATH = "sidepanel.html";
const UNDERPAR_ESM_NODE_PATH_PREFIX = "/esm/v3/media-company";

function buildUnderparEsmRequestPath(pathname = "", search = "", options = {}) {
  const allowBarePath = options?.allowBarePath === true;
  let normalizedPath = String(pathname || "").trim().replace(/\/+$/g, "");
  if (!normalizedPath) {
    return "";
  }
  if (/^\/?esm\/v3\/media-company(?:\/|$)/i.test(normalizedPath)) {
    if (!normalizedPath.startsWith("/")) {
      normalizedPath = `/${normalizedPath}`;
    }
    return `${normalizedPath}${String(search || "")}`;
  }
  if (!allowBarePath) {
    return "";
  }
  normalizedPath = normalizedPath.replace(/^\/+/, "");
  if (!normalizedPath) {
    return "";
  }
  return `${UNDERPAR_ESM_NODE_PATH_PREFIX}/${normalizedPath}${String(search || "")}`;
}

function normalizeUnderparEsmRequestPath(rawValue = "") {
  const normalized = String(rawValue || "").trim();
  if (!normalized) {
    return "";
  }
  const hasAbsoluteScheme = /^[a-z][a-z\d+.-]*:/i.test(normalized);
  try {
    const parsed = hasAbsoluteScheme ? new URL(normalized) : new URL(normalized, "https://mgmt.auth.adobe.com/esm/v3/media-company/");
    const searchParams = new URLSearchParams(parsed.search);
    searchParams.delete("media-company");
    const search = searchParams.toString();
    return buildUnderparEsmRequestPath(String(parsed.pathname || ""), search ? `?${search}` : "", {
      allowBarePath: !hasAbsoluteScheme,
    });
  } catch (_error) {
    const withoutHash = normalized.split("#")[0] || "";
    const [pathPart, queryPart = ""] = withoutHash.split("?");
    const searchParams = new URLSearchParams(queryPart);
    searchParams.delete("media-company");
    const search = searchParams.toString();
    return buildUnderparEsmRequestPath(pathPart, search ? `?${search}` : "", {
      allowBarePath: !hasAbsoluteScheme,
    });
  }
}

function parseUnderparEsmDeeplinkPayload() {
  const query = String(window.location.hash || "").startsWith("#")
    ? window.location.hash.slice(1)
    : String(window.location.search || "").replace(/^\?/, "");
  const params = new URLSearchParams(query);
  const requestPath = normalizeUnderparEsmRequestPath(params.get("requestPath") || params.get("requestUrl") || "");
  if (!requestPath) {
    return null;
  }
  return {
    requestPath,
    displayNodeLabel: String(params.get("displayNodeLabel") || "").trim(),
    programmerId: String(params.get("programmerId") || "").trim(),
    programmerName: String(params.get("programmerName") || "").trim(),
    environmentKey: String(params.get("environmentKey") || "").trim(),
    environmentLabel: String(params.get("environmentLabel") || "").trim(),
    source: String(params.get("source") || "blondie-button").trim() || "blondie-button",
    createdAt: Number(params.get("createdAt") || Date.now() || 0),
  };
}

async function init() {
  const status = document.getElementById("status");
  const manualWrap = document.getElementById("manual-wrap");
  const manualLink = document.getElementById("manual-link");
  const controllerUrl = chrome.runtime.getURL(UNDERPAR_ESM_DEEPLINK_CONTROLLER_PATH);
  if (manualLink instanceof HTMLAnchorElement) {
    manualLink.href = controllerUrl;
  }

  try {
    const payload = parseUnderparEsmDeeplinkPayload();
    if (!payload) {
      throw new Error("This UnderPAR deeplink is missing a valid ESM request path.");
    }
    status.textContent = "Opening your ESM report card in UnderPAR...";
    await chrome.storage.local.set({
      [UNDERPAR_ESM_DEEPLINK_STORAGE_KEY]: payload,
    });
    window.location.replace(controllerUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    status.textContent = message || "Unable to open UnderPAR.";
    if (manualWrap) {
      manualWrap.hidden = false;
    }
  }
}

void init();
