export type HungryApp = "student" | "canteen";
export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type RelatedApp = { id?: string; url?: string; platform?: string };
type NavigatorWithInstalledApps = Navigator & {
  getInstalledRelatedApps?: () => Promise<RelatedApp[]>;
};

const appIdentity: Record<HungryApp, { id: string; manifest: string }> = {
  student: { id: "/?hungry_app=student", manifest: "/manifest-student.webmanifest" },
  canteen: { id: "/?hungry_app=canteen", manifest: "/manifest-canteen.webmanifest" },
};

let deferredInstallPrompt: InstallPromptEvent | null = null;
let deferredInstallPromptApp: HungryApp | null = null;
let pendingInstallApp: HungryApp | null = null;
const installPromptSubscribers = new Set<() => void>();

function getPageManifestApp(): HungryApp | null {
  const href = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href ?? "";
  if (href.includes("manifest-student")) return "student";
  if (href.includes("manifest-canteen")) return "canteen";
  return null;
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event as InstallPromptEvent;
    deferredInstallPromptApp = getPageManifestApp();
    installPromptSubscribers.forEach((subscriber) => subscriber());
  });
}

export function getDeferredInstallPrompt(app?: HungryApp) {
  if (app && deferredInstallPromptApp !== app) return null;
  return deferredInstallPrompt;
}

export function getPendingInstallApp() {
  return pendingInstallApp;
}

export function setPendingInstallApp(app: HungryApp | null) {
  pendingInstallApp = app;
}

export function subscribeToInstallPrompt(subscriber: () => void) {
  installPromptSubscribers.add(subscriber);
  return () => installPromptSubscribers.delete(subscriber);
}

export function clearDeferredInstallPrompt(prompt?: InstallPromptEvent) {
  if (prompt && deferredInstallPrompt !== prompt) return;
  deferredInstallPrompt = null;
  deferredInstallPromptApp = null;
  installPromptSubscribers.forEach((subscriber) => subscriber());
}

/**
 * Returns a fresh browser-reported result. Browsers without the related-apps API
 * cannot report installs from a normal tab, so those browsers return false and
 * the UI keeps its download action available.
 */
export async function isAppInstalled(app: HungryApp): Promise<boolean> {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;

  const currentApp = new URLSearchParams(window.location.search).get("hungry_app");
  const appPaths = app === "student" ? ["/auth", "/app"] : ["/canteen", "/register-canteen"];
  if (isStandaloneApp() && (currentApp === app || appPaths.includes(window.location.pathname))) return true;

  const getInstalledRelatedApps = (navigator as NavigatorWithInstalledApps).getInstalledRelatedApps;
  if (!getInstalledRelatedApps) return false;

  try {
    const installedApps = await getInstalledRelatedApps.call(navigator);
    const identity = appIdentity[app];
    const manifestUrl = new URL(identity.manifest, window.location.origin).href;
    const appId = new URL(identity.id, window.location.origin).href;
    return installedApps.some((installed) => {
      if (installed.platform !== "webapp") return false;
      return installed.id === identity.id || installed.id === appId || installed.url === manifestUrl;
    });
  } catch {
    return false;
  }
}

export function getInstallFallback(app: HungryApp) {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const appName = app === "canteen" ? "HUNGRY Canteen Dashboard" : "HUNGRY";
  const isAppleMobile = /iphone|ipad|ipod/i.test(ua) ||
    (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isAppleMobile) {
    return `In Safari, tap Share, then Add to Home Screen. ${appName} will show as installed after it opens from your Home Screen.`;
  }
  if (app === "canteen" && typeof document !== "undefined" && getPageManifestApp() !== "canteen") {
    return "Open the existing Canteen Owner Login page to install the dashboard.";
  }
  if (/android/i.test(ua)) {
    return app === "canteen"
      ? "Chrome did not offer the Canteen Dashboard install prompt. In Chrome, open the menu and choose Install app or Add to Home screen."
      : "Chrome did not offer its install prompt. In Chrome, open the menu and choose Install app or Add to Home screen.";
  }
  if (/safari/i.test(ua) && !/chrome|chromium|edg/i.test(ua)) {
    return `In Safari, choose File, then Add to Dock to install ${appName}.`;
  }
  if (/chrome|edg/i.test(ua)) {
    return app === "canteen"
      ? "Chrome did not offer the Canteen Dashboard install prompt. Use the install icon in the address bar if it is available."
      : "Chrome did not offer its install prompt. Use the install icon in the address bar if it is available.";
  }
  return `This browser did not offer an install prompt. Open this page in Chrome, Edge, or Safari to install ${appName}.`;
}

export function isStandaloneApp() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
