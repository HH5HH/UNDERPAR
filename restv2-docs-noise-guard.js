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

function shouldStubRestV2DocsImsProfileRequest(url = "") {
  const normalizedUrl = normalizeRestV2DocsNoiseText(url);
  if (!normalizedUrl) {
    return false;
  }
  try {
    return REST_V2_DOCS_IMS_PROFILE_URL_PATTERN.test(String(new URL(normalizedUrl, "https://developer.adobe.com").href));
  } catch {
    return REST_V2_DOCS_IMS_PROFILE_URL_PATTERN.test(normalizedUrl);
  }
}

function createRestV2DocsNoiseGuardPageScriptSource() {
  return `(() => {
    if (window.__UNDERPAR_RESTV2_DOCS_NOISE_GUARD__ === true) {
      return;
    }
    window.__UNDERPAR_RESTV2_DOCS_NOISE_GUARD__ = true;
    const noisePatternSources = ${JSON.stringify(REST_V2_DOCS_CONSOLE_NOISE_PATTERNS.map((pattern) => pattern.source))};
    const noisePatterns = noisePatternSources.map((source) => new RegExp(source, "i"));
    const imsProfilePattern = new RegExp(${JSON.stringify(REST_V2_DOCS_IMS_PROFILE_URL_PATTERN.source)}, "i");
    const normalizeText = (value) => {
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
    };
    const normalizeUrl = (value) => {
      const raw = normalizeText(value);
      if (!raw) {
        return "";
      }
      try {
        return String(new URL(raw, window.location.href).href);
      } catch {
        return raw;
      }
    };
    const shouldSuppressConsoleArgs = (args) => {
      const text = Array.from(args || []).map((item) => normalizeText(item)).join(" ").trim();
      return Boolean(text) && noisePatterns.some((pattern) => pattern.test(text));
    };
    const shouldStubImsProfileRequest = (url) => imsProfilePattern.test(normalizeUrl(url));
    ["log", "info", "warn", "error", "debug"].forEach((methodName) => {
      const original = console?.[methodName];
      if (typeof original !== "function") {
        return;
      }
      console[methodName] = function underparDocsConsoleNoiseGuard(...args) {
        if (shouldSuppressConsoleArgs(args)) {
          return;
        }
        return original.apply(this, args);
      };
    });
    if (typeof window.fetch === "function") {
      const originalFetch = window.fetch.bind(window);
      window.fetch = function underparDocsNoiseGuardFetch(input, init) {
        const requestUrl =
          typeof input === "string"
            ? input
            : input && typeof input === "object" && "url" in input
              ? input.url
              : "";
        if (shouldStubImsProfileRequest(requestUrl)) {
          return Promise.resolve(
            new Response("{}", {
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
    if (typeof XMLHttpRequest === "function" && XMLHttpRequest?.prototype) {
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;
      const originalSetRequestHeader =
        typeof XMLHttpRequest.prototype.setRequestHeader === "function" ? XMLHttpRequest.prototype.setRequestHeader : null;
      XMLHttpRequest.prototype.open = function underparDocsNoiseGuardOpen(method, url) {
        const requestUrl = normalizeUrl(url);
        this.__underparStubImsProfile = shouldStubImsProfileRequest(requestUrl);
        this.__underparStubImsProfileUrl = requestUrl;
        if (this.__underparStubImsProfile) {
          return undefined;
        }
        return originalOpen.apply(this, arguments);
      };
      if (originalSetRequestHeader) {
        XMLHttpRequest.prototype.setRequestHeader = function underparDocsNoiseGuardSetRequestHeader(name, value) {
          if (this.__underparStubImsProfile) {
            return undefined;
          }
          return originalSetRequestHeader.call(this, name, value);
        };
      }
      XMLHttpRequest.prototype.send = function underparDocsNoiseGuardSend() {
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
        xhr.getAllResponseHeaders = () => "content-type: application/json\\r\\n";
        xhr.getResponseHeader = (headerName) =>
          String(headerName || "").trim().toLowerCase() === "content-type" ? "application/json" : null;
        const dispatch = (type) => {
          let eventObject = null;
          try {
            eventObject = new Event(type);
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
          try {
            xhr.dispatchEvent(eventObject);
          } catch {
            // Ignore event dispatch failures on partial XHR state.
          }
        };
        window.setTimeout(() => {
          dispatch("readystatechange");
          dispatch("load");
          dispatch("loadend");
        }, 0);
        return undefined;
      };
    }
  })();`;
}

function injectRestV2DocsNoiseGuard(documentRef = null) {
  const doc = documentRef || (typeof document !== "undefined" ? document : null);
  if (!doc) {
    return false;
  }
  const parent = doc.documentElement || doc.head || doc.body;
  if (!parent || typeof doc.createElement !== "function") {
    return false;
  }
  const script = doc.createElement("script");
  script.setAttribute("data-underpar-restv2-noise-guard", "true");
  script.textContent = createRestV2DocsNoiseGuardPageScriptSource();
  parent.appendChild(script);
  script.remove();
  return true;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    createRestV2DocsNoiseGuardPageScriptSource,
    injectRestV2DocsNoiseGuard,
    normalizeRestV2DocsNoiseText,
    shouldStubRestV2DocsImsProfileRequest,
    shouldSuppressRestV2DocsConsoleArgs,
  };
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  try {
    injectRestV2DocsNoiseGuard(document);
  } catch {
    // Best-effort page guard only.
  }
}
