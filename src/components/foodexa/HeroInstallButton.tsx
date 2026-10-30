import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { isAppInstalled, type HungryApp } from "@/lib/pwa-install";

const copy = {
  student: {
    download: "Download HUNGRY",
    audience: "For Students, Faculty & Guests",
    ariaLabel: "Download HUNGRY for Students, Faculty and Guests",
  },
  canteen: {
    download: "Download Canteen Dashboard",
    audience: "For Canteen Owners",
    ariaLabel: "Download the Canteen Dashboard for Canteen Owners",
  },
} satisfies Record<HungryApp, { download: string; audience: string; ariaLabel: string }>;

export function HeroInstallButton({ app }: { app: HungryApp }) {
  const [showAudience, setShowAudience] = useState(false);
  const [installed, setInstalled] = useState(false);
  const label = copy[app];

  useEffect(() => {
    let active = true;
    const updateInstalled = () => {
      void isAppInstalled(app).then((result) => {
        if (active) setInstalled(result);
      });
    };
    const updateWhenVisible = () => {
      if (document.visibilityState === "visible") updateInstalled();
    };
    updateInstalled();
    window.addEventListener("pageshow", updateInstalled);
    window.addEventListener("focus", updateInstalled);
    document.addEventListener("visibilitychange", updateWhenVisible);
    const interval = window.setInterval(() => setShowAudience((current) => !current), 4000);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("pageshow", updateInstalled);
      window.removeEventListener("focus", updateInstalled);
      document.removeEventListener("visibilitychange", updateWhenVisible);
    };
  }, [app]);

  return (
    <a
      href={`/install/${app}`}
      aria-label={installed ? "Already Installed" : label.ariaLabel}
      className="group inline-flex min-w-0 max-w-full shrink items-center justify-center gap-1.5 whitespace-normal rounded-full border border-primary/60 bg-background px-4 py-3.5 text-center text-[13px] font-semibold leading-tight text-foreground transition-all duration-300 hover:scale-[1.04] hover:border-primary hover:shadow-[0_0_30px_-4px_var(--primary-bright)] sm:whitespace-nowrap sm:px-6 sm:text-sm"
    >
      <span className="relative inline-grid min-w-0 max-w-full overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={installed ? "installed" : showAudience ? "audience" : "download"}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {installed ? "Already Installed" : showAudience ? label.audience : label.download}
          </motion.span>
        </AnimatePresence>
      </span>
      <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1">↗</span>
    </a>
  );
}
