import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDown, ArrowLeft, ArrowRight, BookOpen, Clock3, MapPin } from "lucide-react";
import { AlreadyInstalledDialog } from "@/components/foodexa/AlreadyInstalledDialog";
import { StudentInstallSuccessDialog } from "@/components/foodexa/StudentInstallSuccessDialog";
import {
  clearDeferredInstallPrompt,
  getDeferredInstallPrompt,
  getPendingInstallApp,
  isAppInstalled,
  requestInstallFromManifest,
  setPendingInstallApp,
  subscribeToInstallPrompt,
} from "@/lib/pwa-install";

export const Route = createFileRoute("/install-hungry")({
  head: () => ({
    links: [{ rel: "manifest", href: "/manifest-student.webmanifest" }],
    meta: [
      { title: "Hungry - Food Ordering Installation" },
      { name: "description", content: "Install HUNGRY to order food on campus." },
      { name: "theme-color", content: "#050505" },
    ],
  }),
  component: HungryInstallPage,
});

function HungryInstallPage() {
  const [installed, setInstalled] = useState(false);
  const [promptReady, setPromptReady] = useState(false);
  const [status, setStatus] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [showAlreadyInstalled, setShowAlreadyInstalled] = useState(false);
  const installRequested = useRef(false);
  const checkRevision = useRef(0);

  useEffect(() => {
    let active = true;
    let readinessTimeout: number | undefined;

    const updatePromptAvailability = () => {
      const ready = Boolean(
        getDeferredInstallPrompt("student") ||
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
      void isAppInstalled("student").then((result) => {
        if (!active || revision !== checkRevision.current) return;
        setInstalled(result);
      });
    };
    const updateWhenVisible = () => {
      if (document.visibilityState === "visible") checkInstalled();
    };
    const onAppInstalled = () => {
      if (getPendingInstallApp() !== "student") return;
      checkRevision.current += 1;
      setPendingInstallApp(null);
      clearDeferredInstallPrompt(undefined, "student");
      installRequested.current = false;
      setInstalled(true);
      setPromptReady(false);
      setStatus("");
      setShowSuccess(true);
    };

    const unsubscribe = subscribeToInstallPrompt(updatePromptAvailability);
    updatePromptAvailability();
    checkInstalled();
    if (!getDeferredInstallPrompt("student") && typeof (navigator as Navigator & { install?: unknown }).install !== "function") {
      setStatus("Preparing the installation option…");
      readinessTimeout = window.setTimeout(() => {
        updatePromptAvailability();
        if (!getDeferredInstallPrompt("student") && typeof (navigator as Navigator & { install?: unknown }).install !== "function") {
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
      setShowAlreadyInstalled(true);
      return;
    }

    const promptEvent = getDeferredInstallPrompt("student");
    const installRequest = promptEvent ? null : requestInstallFromManifest("student");
    if (!promptEvent && !installRequest) {
      void isAppInstalled("student").then((result) => {
        if (result) {
          setInstalled(true);
          setStatus("");
          setShowAlreadyInstalled(true);
        } else {
          setStatus("Direct installation isn't available in this browser right now. Please try again later.");
        }
      });
      return;
    }

    setStatus("");
    setPromptReady(false);
    setPendingInstallApp("student");
    installRequested.current = true;

    try {
      if (promptEvent) {
        const promptResult = promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        clearDeferredInstallPrompt(promptEvent, "student");
        if (choice.outcome === "dismissed") {
          setPendingInstallApp(null);
          installRequested.current = false;
          setStatus("Installation wasn't completed. Refresh this page when you're ready to try again.");
          return;
        }
        await promptResult;
        if (await isAppInstalled("student")) {
          setPendingInstallApp(null);
          installRequested.current = false;
          setInstalled(true);
          setShowSuccess(true);
        }
        return;
      }

      await installRequest;
      setPendingInstallApp(null);
      installRequested.current = false;
      setInstalled(true);
      setShowSuccess(true);
    } catch {
      setPendingInstallApp(null);
      installRequested.current = false;
      if (promptEvent) clearDeferredInstallPrompt(promptEvent, "student");
      setStatus("Installation couldn't be completed. Please try again.");
    }
  }

  return (
    <main className="relative flex min-h-[100dvh] items-center overflow-hidden bg-[#050505] px-4 py-7 text-white sm:px-7 sm:py-10 lg:px-10">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_4%,rgba(190,0,18,0.27),transparent_48%),radial-gradient(ellipse_at_6%_85%,rgba(130,0,12,0.14),transparent_42%)]" />
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full opacity-70" preserveAspectRatio="none" viewBox="0 0 1440 900">
        <defs>
          <filter height="180%" id="install-red-glow-user" width="180%" x="-40%" y="-40%">
            <feGaussianBlur result="blur" stdDeviation="7" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path d="M-80 700 C220 510 340 850 650 665 S1070 490 1520 680" fill="none" filter="url(#install-red-glow-user)" stroke="rgba(230,0,18,.18)" strokeWidth="2" />
        <path d="M-40 760 C250 600 420 880 740 715 S1120 570 1490 760" fill="none" stroke="rgba(255,255,255,.045)" strokeWidth="1" />
      </svg>
      <div className="relative mx-auto w-full max-w-5xl">
        <nav className="mb-5 sm:mb-7">
          <Link className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-4 py-2.5 text-sm font-medium text-white/70 transition hover:border-primary/45 hover:text-white" to="/">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Back to HUNGRY Website
          </Link>
        </nav>
        <section className="relative overflow-hidden rounded-[1.6rem] border border-primary/35 bg-[linear-gradient(140deg,rgba(25,10,11,0.95),rgba(7,7,7,0.98)_54%,rgba(18,7,8,0.96))] px-5 py-7 shadow-[0_24px_90px_rgba(0,0,0,0.5),0_0_55px_rgba(230,0,18,0.13)] sm:rounded-[2rem] sm:px-10 sm:py-10 lg:px-14 lg:py-12">
          <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-primary/10 blur-[90px]" />
          <div className="relative mx-auto max-w-3xl text-center">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.24em] text-primary-bright sm:text-xs">
              YOUR CAMPUS FOOD EXPERIENCE STARTS HERE
            </p>
            <h1 className="display text-[clamp(2.1rem,7vw,4.25rem)] font-extrabold leading-[1.02] tracking-[-0.055em]">
              <span className="block text-white">Hungry</span>
              <span className="mt-1 block bg-gradient-to-r from-white via-white to-primary-bright bg-clip-text text-transparent">
                Food Ordering
              </span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/65 sm:mt-5 sm:text-base">
              Order your favourite campus food, skip the queues and track your orders easily with HUNGRY.
            </p>

            <div className="mt-7 grid grid-cols-3 gap-2.5 text-left sm:mt-9 sm:gap-4">
              <div className="min-w-0 rounded-2xl border border-white/10 bg-black/25 px-2.5 py-3.5 sm:px-4 sm:py-4">
                <BookOpen aria-hidden="true" className="mx-auto mb-2 h-5 w-5 text-primary-bright sm:mx-0 sm:mb-3 sm:h-6 sm:w-6" strokeWidth={1.7} />
                <h2 className="text-center text-xs font-semibold text-white sm:text-left sm:text-sm">Explore Menus</h2>
              </div>
              <div className="min-w-0 rounded-2xl border border-white/10 bg-black/25 px-2.5 py-3.5 sm:px-4 sm:py-4">
                <Clock3 aria-hidden="true" className="mx-auto mb-2 h-5 w-5 text-primary-bright sm:mx-0 sm:mb-3 sm:h-6 sm:w-6" strokeWidth={1.7} />
                <h2 className="text-center text-xs font-semibold text-white sm:text-left sm:text-sm">Skip Queues</h2>
              </div>
              <div className="min-w-0 rounded-2xl border border-white/10 bg-black/25 px-2.5 py-3.5 sm:px-4 sm:py-4">
                <MapPin aria-hidden="true" className="mx-auto mb-2 h-5 w-5 text-primary-bright sm:mx-0 sm:mb-3 sm:h-6 sm:w-6" strokeWidth={1.7} />
                <h2 className="text-center text-xs font-semibold text-white sm:text-left sm:text-sm">Track Orders</h2>
              </div>
            </div>

            <button
              className="mt-6 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-4 text-sm font-bold text-white shadow-[0_8px_26px_rgba(230,0,18,0.28)] transition hover:bg-primary-bright disabled:cursor-not-allowed disabled:opacity-60 sm:mt-8 sm:text-base"
              disabled={!installed && !promptReady}
              onClick={() => void handleInstall()}
              type="button"
            >
              {installed ? "Already Installed" : "Install HUNGRY"}
              {installed ? <ArrowRight aria-hidden="true" className="h-5 w-5" /> : <ArrowDown aria-hidden="true" className="h-5 w-5" />}
            </button>
            {status && <p className="mt-4 text-center text-sm leading-relaxed text-white/60" role="status">{status}</p>}
            {!status && !installed && !promptReady && <span className="sr-only">Preparing installation</span>}
          </div>
        </section>
      </div>
      {showSuccess && <StudentInstallSuccessDialog onClose={() => setShowSuccess(false)} />}
      {showAlreadyInstalled && <AlreadyInstalledDialog app="student" onClose={() => setShowAlreadyInstalled(false)} />}
    </main>
  );
}
