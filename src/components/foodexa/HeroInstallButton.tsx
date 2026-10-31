import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ArrowRight, Download } from "lucide-react";
import {
  clearDeferredInstallPrompt,
  getInstallFallback,
  getDeferredInstallPrompt,
  getPendingInstallApp,
  isAppInstalled,
  requestInstallFromManifest,
  setPendingInstallApp,
  subscribeToInstallPrompt,
  type HungryApp,
} from "@/lib/pwa-install";
import { AlreadyInstalledDialog } from "@/components/foodexa/AlreadyInstalledDialog";

const copy = {
  student: {
    download: "Download HUNGRY",
    ariaLabel: "Download HUNGRY for Students, Faculty and Guests",
  },
  canteen: {
    download: "Download Canteen Dashboard",
    ariaLabel: "Download the Canteen Dashboard for Canteen Owners",
  },
} satisfies Record<HungryApp, { download: string; ariaLabel: string }>;

export function HeroInstallButton({ app, dedicatedInstallPage = false }: { app: HungryApp; dedicatedInstallPage?: boolean }) {
  const [installed, setInstalled] = useState(false);
  const [showInstalledDialog, setShowInstalledDialog] = useState(false);
  const [installationNotice, setInstallationNotice] = useState("");
  const installCheckRevision = useRef(0);
  const label = copy[app];

  useEffect(() => {
    let active = true;
    const updateInstalled = () => {
      const revision = ++installCheckRevision.current;
      void isAppInstalled(app).then((result) => {
        if (!active || revision !== installCheckRevision.current) return;
        if (result) {
          setInstalled(true);
        } else if (
          app !== "student" ||
          typeof (navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> }).getInstalledRelatedApps === "function"
        ) {
          setInstalled(false);
        }
        if (result && getPendingInstallApp() === app) {
          setPendingInstallApp(null);
        }
      });
    };
    const updateWhenVisible = () => {
      if (document.visibilityState === "visible") updateInstalled();
    };
    const onAppInstalled = () => {
      if (getPendingInstallApp() !== app) return;
      installCheckRevision.current += 1;
      setPendingInstallApp(null);
      clearDeferredInstallPrompt(undefined, app);
      setInstalled(true);
      setInstallationNotice("");
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
    if (app === "canteen") {
      if (installed) return;
      if (dedicatedInstallPage) {
        window.location.assign("/install/canteen");
        return;
      }
      setInstallationNotice("");
      void handleLandingCanteenInstall();
      return;
    }

    if (installed) {
      setShowInstalledDialog(true);
      return;
    }

    const promptEvent = getDeferredInstallPrompt("student");
    if (!promptEvent) return;

    setPendingInstallApp("student");
    try {
      const promptResult = promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      clearDeferredInstallPrompt(promptEvent);
      if (choice.outcome === "dismissed") {
        setPendingInstallApp(null);
        return;
      }
      await promptResult;
      if (await isAppInstalled("student")) {
        setPendingInstallApp(null);
        setInstalled(true);
      }
    } catch {
      setPendingInstallApp(null);
      clearDeferredInstallPrompt(promptEvent);
    }
  }

  async function handleLandingCanteenInstall() {
    const promptEvent = getDeferredInstallPrompt("canteen");
    const installRequest = promptEvent ? null : requestInstallFromManifest("canteen");

    if (!promptEvent && !installRequest) {
      setInstallationNotice(getInstallFallback("canteen"));
      return;
    }

    setPendingInstallApp("canteen");
    if (promptEvent) {
      try {
        const promptResult = promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        clearDeferredInstallPrompt(promptEvent, "canteen");
        if (choice.outcome === "dismissed") {
          setPendingInstallApp(null);
          return;
        }
        await promptResult;
        if (await isAppInstalled("canteen")) {
          setPendingInstallApp(null);
          setInstalled(true);
          setInstallationNotice("");
        }
      } catch {
        setPendingInstallApp(null);
        clearDeferredInstallPrompt(promptEvent, "canteen");
        setInstallationNotice(getInstallFallback("canteen"));
      }
      return;
    }

    try {
      await installRequest;
      if (await isAppInstalled("canteen")) {
        setPendingInstallApp(null);
        setInstalled(true);
        setInstallationNotice("");
      }
    } catch {
      setPendingInstallApp(null);
      setInstallationNotice(getInstallFallback("canteen"));
    }
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
      {showInstalledDialog && <AlreadyInstalledDialog app={app} onClose={() => setShowInstalledDialog(false)} />}
      {app === "canteen" && installationNotice && !installed && (
        <p role="status" className="max-w-64 text-xs leading-relaxed text-muted-foreground">{installationNotice}</p>
      )}
    </div>
  );
}
