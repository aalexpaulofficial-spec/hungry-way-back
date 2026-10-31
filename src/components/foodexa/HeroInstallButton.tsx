import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { ArrowRight, Download, X } from "lucide-react";
import {
  clearDeferredInstallPrompt,
  getDeferredInstallPrompt,
  getInstallFallback,
  getPendingInstallApp,
  isAppInstalled,
  requestInstallFromManifest,
  setPendingInstallApp,
  type HungryApp,
} from "@/lib/pwa-install";
import { AlreadyInstalledDialog } from "@/components/foodexa/AlreadyInstalledDialog";

const copy = {
  student: {
    download: "Download HUNGRY",
    fallback: "HUNGRY",
    ariaLabel: "Download HUNGRY for Students, Faculty and Guests",
  },
  canteen: {
    download: "Download Canteen Dashboard",
    fallback: "Canteen Dashboard",
    ariaLabel: "Download the Canteen Dashboard for Canteen Owners",
  },
} satisfies Record<HungryApp, { download: string; fallback: string; ariaLabel: string }>;

export function HeroInstallButton({ app }: { app: HungryApp }) {
  const [installed, setInstalled] = useState(false);
  const [showInstalledDialog, setShowInstalledDialog] = useState(false);
  const launchAttempted = useRef(false);
  const [fallback, setFallback] = useState("");
  const label = copy[app];

  useEffect(() => {
    if (!showInstalledDialog || app !== "student") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowInstalledDialog(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [app, showInstalledDialog]);

  const launchStudentEntry = useCallback(() => {
    if (app !== "student" || launchAttempted.current) return;
    launchAttempted.current = true;
    window.location.assign("/auth?hungry_app=student");
  }, [app]);

  useEffect(() => {
    let active = true;
    const updateInstalled = () => {
      void isAppInstalled(app).then((result) => {
        if (!active) return;
        if (result) {
          setInstalled(true);
        } else if (
          app !== "student" ||
          typeof (navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> }).getInstalledRelatedApps === "function"
        ) {
          setInstalled(false);
        }
        if (result && getPendingInstallApp() === app) setPendingInstallApp(null);
      });
    };
    const updateWhenVisible = () => {
      if (document.visibilityState === "visible") updateInstalled();
    };
    const onAppInstalled = () => {
      if (getPendingInstallApp() !== app) return;
      setPendingInstallApp(null);
      clearDeferredInstallPrompt(undefined, app);
      setInstalled(true);
      setFallback("");
      launchStudentEntry();
    };
    updateInstalled();
    window.addEventListener("pageshow", updateInstalled);
    window.addEventListener("focus", updateInstalled);
    window.addEventListener("appinstalled", onAppInstalled);
    document.addEventListener("visibilitychange", updateWhenVisible);
    return () => {
      active = false;
      window.removeEventListener("pageshow", updateInstalled);
      window.removeEventListener("focus", updateInstalled);
      window.removeEventListener("appinstalled", onAppInstalled);
      document.removeEventListener("visibilitychange", updateWhenVisible);
    };
  }, [app, launchStudentEntry]);

  async function handleDownload(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (app === "student" && installed) {
      setShowInstalledDialog(true);
      return;
    }
    setFallback("");
    if (app === "student") launchAttempted.current = false;

    if (installed) {
      if (app === "canteen") setShowInstalledDialog(true);
      return;
    }

    const promptEvent = getDeferredInstallPrompt(app);
    if (promptEvent) {
      // Invoke synchronously in the click handler so Chrome receives the user gesture.
      setPendingInstallApp(app);
      try {
        const choicePromise = promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        clearDeferredInstallPrompt(promptEvent);
        if (choice.outcome === "dismissed") {
          setPendingInstallApp(null);
          return;
        }
        await choicePromise;
        const confirmed = await isAppInstalled(app);
        if (confirmed) {
          setPendingInstallApp(null);
          setInstalled(true);
          launchStudentEntry();
        }
      } catch {
        setPendingInstallApp(null);
        clearDeferredInstallPrompt(promptEvent);
        if (app === "canteen") setFallback(getInstallFallback(app));
      }
      return;
    }

    // Some Chromium versions expose Web Install's manifest-targeted API,
    // allowing the canteen PWA to be installed directly from the landing page
    // without borrowing the student page's beforeinstallprompt event.
    if (app === "canteen") {
      const installRequest = requestInstallFromManifest(app);
      if (installRequest) {
        setPendingInstallApp(app);
        try {
          await installRequest;
          setPendingInstallApp(null);
          setInstalled(true);
          setFallback("");
        } catch (error) {
          setPendingInstallApp(null);
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            if (app === "canteen") setFallback(getInstallFallback(app));
          }
        }
        return;
      }
    }

    const confirmedInstalled = await isAppInstalled(app);
    if (confirmedInstalled) {
      setInstalled(true);
      if (app === "canteen") setShowInstalledDialog(true);
      return;
    }

    if (app === "canteen") setFallback(getInstallFallback(app));
  }

  return (
    <div className="flex min-w-0 flex-col items-start gap-2">
      <button
        type="button"
        aria-label={installed ? "Already Installed" : label.ariaLabel}
        onClick={(event) => void handleDownload(event)}
        className="group inline-flex min-w-0 max-w-full shrink items-center justify-center gap-2 whitespace-normal rounded-full border border-primary/60 bg-background px-4 py-3.5 text-center text-[13px] font-semibold leading-tight text-foreground transition-all duration-300 hover:scale-[1.03] hover:border-primary hover:shadow-[0_0_30px_-4px_var(--primary-bright)] sm:whitespace-nowrap sm:px-6 sm:text-sm"
      >
        {installed ? <ArrowRight aria-hidden="true" className="h-4 w-4" /> : <Download aria-hidden="true" className="h-4 w-4" />}
        {installed ? "Already Installed" : label.download}
      </button>
      {app === "student" && showInstalledDialog && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/65 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowInstalledDialog(false);
          }}
        >
          <section
            className="relative w-full max-w-sm rounded-2xl border border-primary/35 bg-[#0b0b0b] px-6 py-6 pr-12 text-foreground shadow-[0_16px_60px_-18px_rgba(230,0,18,0.4)]"
            role="dialog"
            aria-modal="true"
            aria-label="HUNGRY installation status"
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setShowInstalledDialog(false)}
              className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
            <p className="text-sm font-medium leading-relaxed">HUNGRY is already installed on your device.</p>
          </section>
        </div>
      )}
      {app === "canteen" && fallback && (
        <p className="max-w-xs text-left text-xs leading-relaxed text-muted-foreground" role="status">
          {fallback}
          {app === "canteen" && fallback.includes("owner login page") && (
            <> <a className="font-semibold text-primary-bright underline" href="/canteen?hungry_app=canteen">Open Canteen Owner Login <ArrowRight aria-hidden="true" className="inline h-3 w-3" /></a></>
          )}
        </p>
      )}
      {app === "canteen" && showInstalledDialog && <AlreadyInstalledDialog app={app} onClose={() => setShowInstalledDialog(false)} />}
    </div>
  );
}
