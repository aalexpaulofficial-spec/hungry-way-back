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
const installPromptSubscribers = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event as InstallPromptEvent;
    installPromptSubscribers.forEach((subscriber) => subscriber());
  });
}

export function getDeferredInstallPrompt() {
  return deferredInstallPrompt;
}

export function subscribeToInstallPrompt(subscriber: () => void) {
  installPromptSubscribers.add(subscriber);
  return () => installPromptSubscribers.delete(subscriber);
}

export function clearDeferredInstallPrompt(prompt?: InstallPromptEvent) {
  if (prompt && deferredInstallPrompt !== prompt) return;
  deferredInstallPrompt = null;
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
  if (isStandaloneApp() && currentApp === app) return true;

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
