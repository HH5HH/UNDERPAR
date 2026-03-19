(() => {
  const buildInfo = document.getElementById("build-info");
  if (!buildInfo) {
    return;
  }
  const version = String(globalThis.chrome?.runtime?.getManifest?.()?.version || "").trim();
  if (!version) {
    return;
  }
  buildInfo.textContent = `Version ${version}`;
})();
