export type HungryApp = "student" | "canteen";

const installedKey = (app: HungryApp) => `hungry-pwa-installed-${app}`;

export function isAppInstalled(app: HungryApp) {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(installedKey(app)) === "true";
}

export function markAppInstalled(app: HungryApp) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(installedKey(app), "true");
  window.dispatchEvent(new Event("hungry-install-status-change"));
}

export function getInstallInstructions() {
  if (typeof navigator === "undefined") return "Use your browser menu to install this app.";

  const ua = navigator.userAgent;
  const isAppleMobile =
    /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isAppleMobile) {
    return "Tap Share, then Add to Home Screen. Confirm Add to finish installing.";
  }
  if (/android/i.test(ua)) {
    return /chrome|edg/i.test(ua)
      ? "Open the ⋮ menu and choose Install app or Add to Home screen."
      : "Open this page in Chrome, then use its ⋮ menu to choose Install app or Add to Home screen.";
  }
  if (/safari/i.test(ua) && !/chrome|chromium|edg/i.test(ua)) {
    return "In Safari, open the File menu and choose Add to Dock.";
  }
  if (/chrome|edg/i.test(ua)) {
    return "Use the install icon in the address bar or choose Install from the browser menu.";
  }
  return "This browser has no install prompt. Open this page in Chrome, Edge, or Safari and use its Install or Add to Home Screen option.";
}

export function isStandaloneApp() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
