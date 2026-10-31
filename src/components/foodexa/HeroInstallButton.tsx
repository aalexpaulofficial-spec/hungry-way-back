import { useEffect, useState, type MouseEvent } from "react";
import { ArrowRight, Download } from "lucide-react";
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
  const [showInstalledMessage, setShowInstalledMessage] = useState(false);
  const [fallback, setFallback] = useState("");
  const label = copy[app];

  useEffect(() => {
    if (!showInstalledMessage) return;
    const timeout = window.setTimeout(() => setShowInstalledMessage(false), 3200);
    return () => window.clearTimeout(timeout);
  }, [showInstalledMessage]);

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
  }, [app]);

  async function handleDownload(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (app === "student" && installed) {
      setShowInstalledMessage(true);
      return;
    }
    setFallback("");

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
      {app === "student" && showInstalledMessage && (
        <p
          className="max-w-xs rounded-xl border border-primary/35 bg-background/95 px-3 py-2 text-xs leading-relaxed text-foreground shadow-[0_0_16px_-8px_var(--primary-bright)]"
          role="status"
          aria-live="polite"
        >
          HUNGRY is already installed on your device.
        </p>
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
