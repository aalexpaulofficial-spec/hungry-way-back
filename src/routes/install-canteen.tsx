import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Download } from "lucide-react";
import { CanteenInstallStatusDialog } from "@/components/foodexa/CanteenInstallStatusDialog";
import { LogoMark } from "@/components/foodexa/LogoMark";
import {
  clearDeferredInstallPrompt,
  getDeferredInstallPrompt,
  getPendingInstallApp,
  isAppInstalled,
  requestInstallFromManifest,
  setPendingInstallApp,
  subscribeToInstallPrompt,
} from "@/lib/pwa-install";

export const Route = createFileRoute("/install-canteen")({
  head: () => ({
    links: [{ rel: "manifest", href: "/manifest-canteen.webmanifest" }],
    meta: [
      { title: "Hungry - Canteen Dashboard Installation" },
      { name: "description", content: "Install the HUNGRY Canteen Dashboard to manage your canteen." },
      { name: "theme-color", content: "#050505" },
    ],
  }),
  component: CanteenInstallPage,
});

function CanteenInstallPage() {
  const [installed, setInstalled] = useState(false);
  const [promptReady, setPromptReady] = useState(false);
  const [status, setStatus] = useState("");
  const [dialog, setDialog] = useState<"success" | "already" | null>(null);
  const installRequested = useRef(false);
  const checkRevision = useRef(0);

  useEffect(() => {
    let active = true;
    let readinessTimeout: number | undefined;

    const updatePromptAvailability = () => {
      const ready = Boolean(
        getDeferredInstallPrompt("canteen") ||
        typeof (navigator as Navigator & { install?: unknown }).install === "function",
      );
      setPromptReady(ready);
      if (ready) {
        if (readinessTimeout !== undefined) window.clearTimeout(readinessTimeout);
        setStatus("");
      }
    };

    const checkInstalled = () => {
      const revision = ++checkRevision.current;
      void isAppInstalled("canteen").then((result) => {
        if (!active || revision !== checkRevision.current) return;
        setInstalled(result);
      });
    };
    const updateWhenVisible = () => {
      if (document.visibilityState === "visible") checkInstalled();
    };
    const onAppInstalled = () => {
      if (getPendingInstallApp() !== "canteen") return;
      checkRevision.current += 1;
      setPendingInstallApp(null);
      clearDeferredInstallPrompt(undefined, "canteen");
      installRequested.current = false;
      setInstalled(true);
      setPromptReady(false);
      setStatus("");
      setDialog("success");
    };

    const unsubscribe = subscribeToInstallPrompt(updatePromptAvailability);
    updatePromptAvailability();
    checkInstalled();
    if (!getDeferredInstallPrompt("canteen") && typeof (navigator as Navigator & { install?: unknown }).install !== "function") {
      setStatus("Preparing the installation option…");
      readinessTimeout = window.setTimeout(() => {
        updatePromptAvailability();
        if (!getDeferredInstallPrompt("canteen") && typeof (navigator as Navigator & { install?: unknown }).install !== "function") {
          setStatus("Direct installation isn't available in this browser right now. Please try again later.");
        }
      }, 4000);
    }

    window.addEventListener("pageshow", checkInstalled);
    window.addEventListener("focus", checkInstalled);
    window.addEventListener("appinstalled", onAppInstalled);
    document.addEventListener("visibilitychange", updateWhenVisible);
    return () => {
      active = false;
      unsubscribe();
      if (readinessTimeout !== undefined) window.clearTimeout(readinessTimeout);
      window.removeEventListener("pageshow", checkInstalled);
      window.removeEventListener("focus", checkInstalled);
      window.removeEventListener("appinstalled", onAppInstalled);
      document.removeEventListener("visibilitychange", updateWhenVisible);
    };
  }, []);

  async function handleInstall() {
    if (installed) {
      setDialog("already");
      return;
    }

    const promptEvent = getDeferredInstallPrompt("canteen");
    const installRequest = promptEvent ? null : requestInstallFromManifest("canteen");
    if (!promptEvent && !installRequest) {
      void isAppInstalled("canteen").then((result) => {
        if (result) {
          setInstalled(true);
          setStatus("");
          setDialog("already");
        } else {
          setStatus("Direct installation isn't available in this browser right now. Please try again later.");
        }
      });
      return;
    }

    setStatus("");
    setPromptReady(false);
    setPendingInstallApp("canteen");
    installRequested.current = true;

    try {
      if (promptEvent) {
        const promptResult = promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        clearDeferredInstallPrompt(promptEvent, "canteen");
        if (choice.outcome === "dismissed") {
          setPendingInstallApp(null);
          installRequested.current = false;
          setStatus("Installation wasn't completed. Refresh this page when you're ready to try again.");
          return;
        }
        await promptResult;
        if (await isAppInstalled("canteen")) {
          setPendingInstallApp(null);
          installRequested.current = false;
          setInstalled(true);
          setDialog("success");
        }
        return;
      }

      await installRequest;
      setPendingInstallApp(null);
      installRequested.current = false;
      setInstalled(true);
      setDialog("success");
    } catch {
      setPendingInstallApp(null);
      installRequested.current = false;
      if (promptEvent) clearDeferredInstallPrompt(promptEvent, "canteen");
      setStatus("Installation couldn't be completed. Please try again.");
    }
  }

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#050505] px-4 py-10 text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(190,0,18,0.34),transparent_52%)]" />
      <section className="relative w-full max-w-xl rounded-[2rem] border border-primary/35 bg-[linear-gradient(145deg,rgba(25,10,11,0.96),rgba(7,7,7,0.98)_55%,rgba(18,7,8,0.96))] p-6 shadow-[0_0_65px_rgba(230,0,18,0.16)] sm:p-10">
        <Link className="mb-8 inline-flex items-center gap-2 text-sm text-white/65 transition hover:text-white" to="/">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to HUNGRY Website
        </Link>
        <div className="mb-7 flex justify-center">
          <LogoMark className="text-5xl" />
        </div>
        <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.24em] text-primary-bright sm:text-sm">
          ARE YOU A CANTEEN OWNER?
        </p>
        <h1 className="display text-center text-3xl font-bold tracking-tight sm:text-4xl">
          Hungry - Canteen Dashboard
        </h1>
        <p className="mx-auto mt-4 max-w-md text-center text-sm leading-relaxed text-white/65 sm:text-base">
          Manage your canteen menu, orders and daily operations with HUNGRY.
        </p>
        <button
          className="mt-8 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-4 text-sm font-bold text-white shadow-[0_8px_26px_rgba(230,0,18,0.25)] transition hover:bg-primary-bright disabled:cursor-not-allowed disabled:opacity-60 sm:text-base"
          disabled={!installed && !promptReady}
          onClick={() => void handleInstall()}
          type="button"
        >
          {installed ? "Already Installed" : "Install Canteen Dashboard"}
          {installed ? <ArrowRight aria-hidden="true" className="h-5 w-5" /> : <Download aria-hidden="true" className="h-5 w-5" />}
        </button>
        {status && <p className="mt-4 text-center text-sm leading-relaxed text-white/60" role="status">{status}</p>}
        {!status && !installed && !promptReady && <span className="sr-only">Preparing installation</span>}
      </section>
      {dialog && <CanteenInstallStatusDialog mode={dialog} onClose={() => setDialog(null)} />}
    </main>
  );
}
