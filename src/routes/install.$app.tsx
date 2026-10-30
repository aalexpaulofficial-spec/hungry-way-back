import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Download, Smartphone } from "lucide-react";
import {
  clearDeferredInstallPrompt,
  getDeferredInstallPrompt,
  getInstallInstructions,
  isAppInstalled,
  markAppInstalled,
  subscribeToInstallPrompt,
  type InstallPromptEvent,
  type HungryApp,
} from "@/lib/pwa-install";

const appDetails = {
  student: {
    name: "HUNGRY",
    audience: "Students, Faculty & Guests",
    description: "Open Create Account / Login with Student, Faculty and Guest options.",
    manifest: "/manifest-student.webmanifest",
  },
  canteen: {
    name: "HUNGRY Canteen Dashboard",
    audience: "Canteen Owners",
    description: "Open Register & Login Canteen with registration and owner login.",
    manifest: "/manifest-canteen.webmanifest",
  },
} satisfies Record<HungryApp, { name: string; audience: string; description: string; manifest: string }>;

export const Route = createFileRoute("/install/$app")({
  head: ({ params }) => ({
    meta: [{ title: `Install ${appDetails[params.app as HungryApp]?.name ?? "HUNGRY"}` }],
    links: [{ rel: "manifest", href: appDetails[params.app as HungryApp]?.manifest ?? appDetails.student.manifest }],
  }),
  component: InstallPage,
});

function InstallPage() {
  const { app: appParam } = Route.useParams();
  const validApp = appParam === "student" || appParam === "canteen";
  const app = (validApp ? appParam : "student") as HungryApp;
  const details = appDetails[app];
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(getDeferredInstallPrompt);
  const [installed, setInstalled] = useState(false);
  const [message, setMessage] = useState("");
  const [instructions, setInstructions] = useState("Use your browser menu to install this app.");
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const updateInstalled = () => setInstalled(isAppInstalled(app));
    const confirmInstalled = () => {
      clearDeferredInstallPrompt();
      markAppInstalled(app);
      setInstalled(true);
      setInstalling(false);
      setMessage("Installation confirmed. You can open the app from your Home Screen or app launcher.");
    };

    updateInstalled();
    setPromptEvent(getDeferredInstallPrompt());
    setInstructions(getInstallInstructions());
    const unsubscribePrompt = subscribeToInstallPrompt(() => {
      setPromptEvent(getDeferredInstallPrompt());
    });
    window.addEventListener("storage", updateInstalled);
    window.addEventListener("hungry-install-status-change", updateInstalled);
    window.addEventListener("appinstalled", confirmInstalled);

    if ("serviceWorker" in navigator) {
      // One idempotent root-scope worker serves both manifests and does not keep app-specific state.
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        setMessage("App installation is unavailable while the service worker cannot be registered. Please try again over HTTPS.");
      });
    }

    return () => {
      window.removeEventListener("storage", updateInstalled);
      window.removeEventListener("hungry-install-status-change", updateInstalled);
      window.removeEventListener("appinstalled", confirmInstalled);
      unsubscribePrompt();
    };
  }, [app]);

  async function install() {
    if (!promptEvent) return;
    setMessage("");
    setInstalling(true);
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      clearDeferredInstallPrompt(promptEvent);
      setPromptEvent(null);
      if (choice.outcome === "dismissed") {
        setInstalling(false);
        setMessage("Installation was cancelled. You can install later from this page or follow the browser instructions below.");
      } else {
        setInstalling(false);
        setMessage(
          isAppInstalled(app)
            ? "Installation confirmed. You can open the app from your Home Screen or app launcher."
            : "The browser accepted the request. Waiting for installation confirmation…",
        );
      }
    } catch {
      setInstalling(false);
      clearDeferredInstallPrompt(promptEvent);
      setPromptEvent(null);
      setMessage("The browser could not start installation. Follow the Add to Home Screen instructions below.");
    }
  }

  return (
    <main className="grain relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-5 py-16">
      <div aria-hidden className="ember anim-pulse-glow pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2" />
      <section className="glass-red relative w-full max-w-xl rounded-[2rem] p-7 sm:p-10">
        <a href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to HUNGRY
        </a>
        <div className="mt-9 grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
          <Smartphone className="h-6 w-6" />
        </div>
        <p className="mt-6 text-[10px] tracking-[0.3em] text-primary-bright">{details.audience.toUpperCase()}</p>
        <h1 className="display mt-2 text-3xl sm:text-4xl">Install {details.name}</h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">{details.description}</p>

        {installed ? (
          <div role="status" className="mt-8 rounded-2xl border border-primary/40 bg-primary/10 px-5 py-4 text-sm text-foreground">
            Already Installed. Open it from your Home Screen or app launcher.
          </div>
        ) : promptEvent ? (
          <button
            type="button"
            disabled={installing}
            onClick={() => void install()}
            className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-4 text-sm font-semibold text-primary-foreground transition hover:shadow-[0_0_40px_-6px_var(--primary-bright)] disabled:opacity-60"
          >
            <Download className="h-4 w-4" /> {installing ? "Waiting for confirmation…" : `Install ${details.name}`}
          </button>
        ) : (
          <div className="mt-8 rounded-2xl border border-border bg-ink/50 px-5 py-4">
            <p className="text-sm font-semibold text-foreground">Add to your device</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{instructions}</p>
          </div>
        )}

        {message && <p role="status" className="mt-4 text-sm text-muted-foreground">{message}</p>}
        <p className="mt-6 text-xs leading-relaxed text-muted-foreground/80">
          After installing, the app opens directly to {app === "student" ? "Create Account / Login" : "Register & Login Canteen"}. You can still use the website in your browser.
        </p>
      </section>
    </main>
  );
}
