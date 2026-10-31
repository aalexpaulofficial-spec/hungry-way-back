(() => {
  const state = (window.__hungryPwaInstallState ??= { prompts: {} });
  if (state.captureInstalled) return;
  state.captureInstalled = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    const manifest = document.querySelector('link[rel="manifest"]')?.href ?? "";
    const app = manifest.includes("manifest-student")
      ? "student"
      : manifest.includes("manifest-canteen")
        ? "canteen"
        : null;
    if (!app) return;

    event.preventDefault();
    state.prompts[app] = event;
    window.dispatchEvent(new CustomEvent("hungry-pwa-install-prompt", { detail: { app } }));
  });
})();
