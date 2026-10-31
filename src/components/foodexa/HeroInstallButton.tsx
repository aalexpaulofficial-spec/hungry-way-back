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
  const [fallback, setFallback] = useState("");
  const label = copy[app];

  useEffect(() => {
    let active = true;
    const updateInstalled = () => {
      void isAppInstalled(app).then((result) => {
        if (!active) return;
        setInstalled(result);
        if (result && getPendingInstallApp() === app) setPendingInstallApp(null);
      });
    };
    const updateWhenVisible = () => {
      if (document.visibilityState === "visible") updateInstalled();
    };
    const onAppInstalled = () => {
      if (getPendingInstallApp() !== app) return;
      setPendingInstallApp(null);
      clearDeferredInstallPrompt();
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
    setFallback("");

    if (installed) {
      setShowInstalledDialog(true);
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
        setFallback(getInstallFallback(app));
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
            setFallback(getInstallFallback(app));
          }
        }
        return;
      }
    }

    const confirmedInstalled = await isAppInstalled(app);
    if (confirmedInstalled) {
      setInstalled(true);
      setShowInstalledDialog(true);
      return;
    }

    // A document can expose only one PWA manifest to Chrome. The landing page
    // belongs to the student app, so hand the canteen action to its existing
    // owner-login route, which declares the canteen manifest and owns its prompt.
    if (app === "canteen") {
      const manifestHref = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href ?? "";
      if (!manifestHref.includes("manifest-canteen.webmanifest")) {
        window.location.assign("/canteen?hungry_app=canteen");
        return;
      }
    }

    setFallback(getInstallFallback(app));
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
      {fallback && (
        <p className="max-w-xs text-left text-xs leading-relaxed text-muted-foreground" role="status">
          {fallback}
          {app === "canteen" && fallback.includes("owner login page") && (
            <> <a className="font-semibold text-primary-bright underline" href="/canteen?hungry_app=canteen">Open Canteen Owner Login <ArrowRight aria-hidden="true" className="inline h-3 w-3" /></a></>
          )}
        </p>
      )}
      {showInstalledDialog && <AlreadyInstalledDialog app={app} onClose={() => setShowInstalledDialog(false)} />}
    </div>
  );
}
