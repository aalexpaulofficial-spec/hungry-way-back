import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ArrowRight, Download } from "lucide-react";
import {
  clearDeferredInstallPrompt,
  getDeferredInstallPrompt,
  getPendingInstallApp,
  isAppInstalled,
  requestInstallFromManifest,
  setPendingInstallApp,
  subscribeToInstallPrompt,
  type HungryApp,
} from "@/lib/pwa-install";
import { AlreadyInstalledDialog } from "@/components/foodexa/AlreadyInstalledDialog";
import { CanteenInstallDialog } from "@/components/foodexa/CanteenInstallDialog";

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

export function HeroInstallButton({ app }: { app: HungryApp }) {
  const [installed, setInstalled] = useState(false);
  const [showInstalledDialog, setShowInstalledDialog] = useState(false);
  const [canteenDialog, setCanteenDialog] = useState<"confirm" | "success" | null>(null);
  const [canteenError, setCanteenError] = useState("");
  const canteenRetryAfterPromptWait = useRef(false);
  const canteenInstallRequested = useRef(false);
  const label = copy[app];

  useEffect(() => {
    if (app !== "canteen" || canteenDialog !== "confirm") return;

    let manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    let createdManifestLink = false;
    if (!manifestLink) {
      manifestLink = document.createElement("link");
      manifestLink.rel = "manifest";
      document.head.append(manifestLink);
      createdManifestLink = true;
    }

    const previousManifest = manifestLink.href;
    const canteenManifest = new URL("/manifest-canteen.webmanifest", window.location.origin).href;
    const updatePromptAvailability = () => {
      const promptReady = Boolean(
        getDeferredInstallPrompt("canteen") ||
        typeof (navigator as Navigator & { install?: unknown }).install === "function",
      );
      if (promptReady && canteenRetryAfterPromptWait.current) {
        canteenRetryAfterPromptWait.current = false;
        setCanteenError("The download prompt is ready. Click Continue to Download to try again.");
      }
    };

    const unsubscribe = subscribeToInstallPrompt(updatePromptAvailability);
    if (manifestLink.href !== canteenManifest) manifestLink.href = canteenManifest;
    updatePromptAvailability();

    return () => {
      unsubscribe();
      if (createdManifestLink) {
        manifestLink?.remove();
      } else if (manifestLink?.href === canteenManifest && previousManifest && previousManifest !== canteenManifest) {
        manifestLink.href = previousManifest;
      }
    };
  }, [app, canteenDialog]);
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
        if (result && getPendingInstallApp() === app) {
          setPendingInstallApp(null);
          if (app === "canteen" && canteenInstallRequested.current) {
            canteenInstallRequested.current = false;
            setCanteenDialog("success");
          }
        }
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
      if (app === "canteen" && canteenInstallRequested.current) {
        canteenInstallRequested.current = false;
        setCanteenDialog("success");
      }
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
    if (installed) {
      setShowInstalledDialog(true);
      return;
    }

    if (app === "canteen") {
      setCanteenError("");
      canteenRetryAfterPromptWait.current = false;
      setCanteenDialog("confirm");
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

  async function handleCanteenContinue() {
    const promptEvent = getDeferredInstallPrompt("canteen");
    const installRequest = promptEvent ? null : requestInstallFromManifest("canteen");
    if (!promptEvent && !installRequest) {
      canteenRetryAfterPromptWait.current = true;
      setCanteenError("The download prompt is still getting ready. Please wait a moment and try again.");
      return;
    }
    setCanteenError("");

    setPendingInstallApp("canteen");
    canteenInstallRequested.current = true;

    if (promptEvent) {
      try {
        const promptResult = promptEvent.prompt();
        setCanteenDialog(null);
        const choice = await promptEvent.userChoice;
        clearDeferredInstallPrompt(promptEvent);
        if (choice.outcome === "dismissed") {
          setPendingInstallApp(null);
          canteenInstallRequested.current = false;
          setCanteenError("The download was canceled. You can try again.");
          setCanteenDialog("confirm");
          return;
        }
        await promptResult;
        if (await isAppInstalled("canteen")) {
          setPendingInstallApp(null);
          canteenInstallRequested.current = false;
          setInstalled(true);
          setCanteenDialog("success");
        }
      } catch {
        setPendingInstallApp(null);
        canteenInstallRequested.current = false;
        clearDeferredInstallPrompt(promptEvent);
        setCanteenError("We could not open the download prompt. Please try again.");
        setCanteenDialog("confirm");
      }
      return;
    }

    setCanteenDialog(null);
    try {
      await installRequest;
      setPendingInstallApp(null);
      canteenInstallRequested.current = false;
      setInstalled(true);
      setCanteenDialog("success");
    } catch {
      setPendingInstallApp(null);
      canteenInstallRequested.current = false;
      setCanteenError("The download was canceled or could not be completed. Please try again.");
      setCanteenDialog("confirm");
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
      {app === "canteen" && canteenDialog && (
        <CanteenInstallDialog
          mode={canteenDialog}
          onContinue={() => void handleCanteenContinue()}
          onClose={() => {
            canteenRetryAfterPromptWait.current = false;
            setCanteenError("");
            setCanteenDialog(null);
          }}
          error={canteenError}
        />
      )}
    </div>
  );
}
