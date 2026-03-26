const REST_V2_DOCS_CONSOLE_NOISE_PATTERNS = Object.freeze([
  /Going to iterate over instancesSettings/i,
  /Attempting to get field body but it does not exist/i,
]);
const REST_V2_DOCS_IMS_PROFILE_URL_PATTERN = /^https:\/\/ims-na1\.adobelogin\.com\/ims\/profile\/v1(?:[?#].*)?$/i;

function normalizeRestV2DocsNoiseText(value = "") {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  try {
    return JSON.stringify(value).trim();
  } catch {
    return String(value || "").trim();
  }
}

function shouldSuppressRestV2DocsConsoleArgs(args = []) {
  const message = (Array.isArray(args) ? args : [args]).map((item) => normalizeRestV2DocsNoiseText(item)).join(" ").trim();
  if (!message) {
    return false;
  }
  return REST_V2_DOCS_CONSOLE_NOISE_PATTERNS.some((pattern) => pattern.test(message));
}

function shouldStubRestV2DocsImsProfileRequest(url = "", baseUrl = "https://developer.adobe.com") {
  const normalizedUrl = normalizeRestV2DocsNoiseText(url);
  if (!normalizedUrl) {
    return false;
  }
  try {
    return REST_V2_DOCS_IMS_PROFILE_URL_PATTERN.test(String(new URL(normalizedUrl, baseUrl).href));
  } catch {
    return REST_V2_DOCS_IMS_PROFILE_URL_PATTERN.test(normalizedUrl);
  }
}

function installRestV2DocsNoiseGuard(globalRef = null) {
  const root = globalRef || (typeof window !== "undefined" ? window : null);
  if (!root) {
    return false;
  }
  if (root.__UNDERPAR_RESTV2_DOCS_NOISE_GUARD__ === true) {
    return true;
  }
  root.__UNDERPAR_RESTV2_DOCS_NOISE_GUARD__ = true;

  const baseUrl = normalizeRestV2DocsNoiseText(root?.location?.href) || "https://developer.adobe.com";
  const normalizeUrl = (value) => {
    const raw = normalizeRestV2DocsNoiseText(value);
    if (!raw) {
      return "";
    }
    try {
      return String(new URL(raw, baseUrl).href);
    } catch {
      return raw;
    }
  };
  const shouldStubRequest = (url) => shouldStubRestV2DocsImsProfileRequest(normalizeUrl(url), baseUrl);

  ["log", "info", "warn", "error", "debug"].forEach((methodName) => {
    const original = root.console?.[methodName];
    if (typeof original !== "function") {
      return;
    }
    root.console[methodName] = function underparDocsConsoleNoiseGuard(...args) {
      if (shouldSuppressRestV2DocsConsoleArgs(args)) {
        return undefined;
      }
      return original.apply(this, args);
    };
  });

  if (typeof root.fetch === "function") {
    const originalFetch = root.fetch.bind(root);
    const ResponseCtor = root.Response || (typeof Response === "function" ? Response : null);
    root.fetch = function underparDocsNoiseGuardFetch(input, init) {
      const requestUrl =
        typeof input === "string"
          ? input
          : input && typeof input === "object" && "url" in input
            ? input.url
            : "";
      if (shouldStubRequest(requestUrl) && ResponseCtor) {
        return Promise.resolve(
          new ResponseCtor("{}", {
            status: 200,
            statusText: "OK",
            headers: {
              "Content-Type": "application/json",
            },
          })
        );
      }
      return originalFetch(input, init);
    };
  }

  if (typeof root.XMLHttpRequest === "function" && root.XMLHttpRequest?.prototype) {
    const xhrPrototype = root.XMLHttpRequest.prototype;
    const originalOpen = xhrPrototype.open;
    const originalSend = xhrPrototype.send;
    const originalSetRequestHeader =
      typeof xhrPrototype.setRequestHeader === "function" ? xhrPrototype.setRequestHeader : null;
    const EventCtor = root.Event || (typeof Event === "function" ? Event : null);
    const setTimer = typeof root.setTimeout === "function" ? root.setTimeout.bind(root) : setTimeout;
    xhrPrototype.open = function underparDocsNoiseGuardOpen(method, url) {
      const requestUrl = normalizeUrl(url);
      this.__underparStubImsProfile = shouldStubRequest(requestUrl);
      this.__underparStubImsProfileUrl = requestUrl;
      if (this.__underparStubImsProfile) {
        return undefined;
      }
      return originalOpen.apply(this, arguments);
    };
    if (originalSetRequestHeader) {
      xhrPrototype.setRequestHeader = function underparDocsNoiseGuardSetRequestHeader(name, value) {
        if (this.__underparStubImsProfile) {
          return undefined;
        }
        return originalSetRequestHeader.call(this, name, value);
      };
    }
    xhrPrototype.send = function underparDocsNoiseGuardSend() {
      if (!this.__underparStubImsProfile) {
        return originalSend.apply(this, arguments);
      }
      const xhr = this;
      const responseText = "{}";
      const defineConstant = (propertyName, value) => {
        try {
          Object.defineProperty(xhr, propertyName, {
            configurable: true,
            get: () => value,
          });
        } catch {
          // Ignore read-only browser implementations.
        }
      };
      defineConstant("readyState", 4);
      defineConstant("status", 200);
      defineConstant("statusText", "OK");
      defineConstant("responseURL", xhr.__underparStubImsProfileUrl || "");
      defineConstant("responseText", responseText);
      defineConstant("response", responseText);
      defineConstant("responseXML", null);
      xhr.getAllResponseHeaders = () => "content-type: application/json\r\n";
      xhr.getResponseHeader = (headerName) =>
        String(headerName || "").trim().toLowerCase() === "content-type" ? "application/json" : null;
      const dispatch = (type) => {
        let eventObject = null;
        try {
          eventObject = EventCtor ? new EventCtor(type) : { type };
        } catch {
          eventObject = { type };
        }
        const handler = xhr["on" + type];
        if (typeof handler === "function") {
          try {
            handler.call(xhr, eventObject);
          } catch {
            // Ignore consumer handler failures.
          }
        }
        if (typeof xhr.dispatchEvent === "function") {
          try {
            xhr.dispatchEvent(eventObject);
          } catch {
            // Ignore event dispatch failures on partial XHR state.
          }
        }
      };
      setTimer(() => {
        dispatch("readystatechange");
        dispatch("load");
        dispatch("loadend");
      }, 0);
      return undefined;
    };
  }

  return true;
}

function injectRestV2DocsNoiseGuard(documentRef = null) {
  const doc = documentRef || (typeof document !== "undefined" ? document : null);
  const root =
    (doc && doc.defaultView) ||
    (typeof window !== "undefined" ? window : null);
  return installRestV2DocsNoiseGuard(root);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    injectRestV2DocsNoiseGuard,
    installRestV2DocsNoiseGuard,
    normalizeRestV2DocsNoiseText,
    shouldStubRestV2DocsImsProfileRequest,
    shouldSuppressRestV2DocsConsoleArgs,
  };
}

if (typeof window !== "undefined") {
  try {
    installRestV2DocsNoiseGuard(window);
  } catch {
    // Best-effort page guard only.
  }
}
