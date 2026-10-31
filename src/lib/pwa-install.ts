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
  if (app === "canteen" && typeof document !== "undefined" && getPageManifestApp() !== "canteen") {
    return "Chrome can install the Canteen Dashboard only from its owner login page. Open Canteen Owner Login to continue.";
  }
  const isAppleMobile = /iphone|ipad|ipod/i.test(ua) ||
    (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isAppleMobile) {
    return "In Safari, tap Share, then Add to Home Screen. HUNGRY will show as installed after it opens from your Home Screen.";
  }
  return "Chrome has not offered an installation prompt for this page yet. Try again in Chrome after the page finishes loading.";
}

export function isStandaloneApp() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
