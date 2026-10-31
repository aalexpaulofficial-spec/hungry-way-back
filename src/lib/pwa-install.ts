export type HungryApp = "student" | "canteen";
export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type RelatedApp = { id?: string; url?: string; platform?: string };
type NavigatorWithInstalledApps = Navigator & {
  getInstalledRelatedApps?: () => Promise<RelatedApp[]>;
};
type NavigatorWithWebInstall = Navigator & {
  install?: (options: { manifest: string }) => Promise<unknown>;
};
type PwaInstallWindow = Window & {
  __hungryPwaInstallState?: {
    captureInstalled?: boolean;
    prompts?: Partial<Record<HungryApp, InstallPromptEvent>>;
  };
};

const appIdentity: Record<HungryApp, { id: string; manifest: string }> = {
  student: { id: "/?hungry_app=student", manifest: "/manifest-student.webmanifest" },
  canteen: { id: "/?hungry_app=canteen", manifest: "/manifest-canteen.webmanifest" },
};

const deferredInstallPrompts = new Map<HungryApp, InstallPromptEvent>();
let latestDeferredInstallApp: HungryApp | null = null;
let pendingInstallApp: HungryApp | null = null;
const installPromptSubscribers = new Set<() => void>();

function getPageManifestApp(): HungryApp | null {
  const href = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href ?? "";
  if (href.includes("manifest-student")) return "student";
  if (href.includes("manifest-canteen")) return "canteen";
  return null;
}

if (typeof window !== "undefined") {
  const earlyPrompts = (window as PwaInstallWindow).__hungryPwaInstallState?.prompts;
  if (earlyPrompts) {
    for (const app of ["student", "canteen"] as const) {
      const prompt = earlyPrompts[app];
      if (prompt) {
        deferredInstallPrompts.set(app, prompt);
        latestDeferredInstallApp = app;
      }
    }
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    const app = getPageManifestApp();
    if (!app) return;
    event.preventDefault();
    if (deferredInstallPrompts.get(app) === event) return;
    deferredInstallPrompts.set(app, event as InstallPromptEvent);
    const earlyState = (window as PwaInstallWindow).__hungryPwaInstallState;
    if (earlyState?.prompts) earlyState.prompts[app] = event as InstallPromptEvent;
    latestDeferredInstallApp = app;
    installPromptSubscribers.forEach((subscriber) => subscriber());
  });

  window.addEventListener("hungry-pwa-install-prompt", ((event: CustomEvent<{ app: HungryApp }>) => {
    const prompt = (window as PwaInstallWindow).__hungryPwaInstallState?.prompts?.[event.detail.app];
    if (!prompt) return;
    deferredInstallPrompts.set(event.detail.app, prompt);
    latestDeferredInstallApp = event.detail.app;
    installPromptSubscribers.forEach((subscriber) => subscriber());
  }) as EventListener);
}

export function getDeferredInstallPrompt(app?: HungryApp) {
  if (app) return deferredInstallPrompts.get(app) ?? null;
  return latestDeferredInstallApp ? deferredInstallPrompts.get(latestDeferredInstallApp) ?? null : null;
}

/**
 * Chrome's experimental Web Install API can install a specific same-origin PWA
 * from a page whose active manifest belongs to a different app. Keep this as a
 * progressive enhancement; the established beforeinstallprompt flow remains
 * the fallback on browsers that do not expose it.
 */
export function requestInstallFromManifest(app: HungryApp) {
  if (typeof window === "undefined" || typeof navigator === "undefined") return null;
  const install = (navigator as NavigatorWithWebInstall).install;
  if (typeof install !== "function") return null;
  const manifest = new URL(appIdentity[app].manifest, window.location.origin).href;
  return install.call(navigator, { manifest });
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

export function clearDeferredInstallPrompt(prompt?: InstallPromptEvent, app?: HungryApp) {
  if (prompt) {
    for (const [app, deferredPrompt] of deferredInstallPrompts) {
      if (deferredPrompt === prompt) deferredInstallPrompts.delete(app);
    }
    const prompts = typeof window !== "undefined" ? (window as PwaInstallWindow).__hungryPwaInstallState?.prompts : undefined;
    if (prompts) {
      for (const name of ["student", "canteen"] as const) {
        if (prompts[name] === prompt) delete prompts[name];
      }
    }
    if (latestDeferredInstallApp && !deferredInstallPrompts.has(latestDeferredInstallApp)) {
      latestDeferredInstallApp = null;
    }
  } else if (app) {
    deferredInstallPrompts.delete(app);
    const prompts = typeof window !== "undefined" ? (window as PwaInstallWindow).__hungryPwaInstallState?.prompts : undefined;
    if (prompts) delete prompts[app];
    if (latestDeferredInstallApp === app) {
      latestDeferredInstallApp = deferredInstallPrompts.size
        ? [...deferredInstallPrompts.keys()].at(-1) ?? null
        : null;
    }
  } else {
    deferredInstallPrompts.clear();
    latestDeferredInstallApp = null;
    const prompts = typeof window !== "undefined" ? (window as PwaInstallWindow).__hungryPwaInstallState?.prompts : undefined;
    if (prompts) {
      delete prompts.student;
      delete prompts.canteen;
    }
  }
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
    return "This Chrome version cannot install a second PWA directly from this page. The dashboard has not been installed.";
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
