import { useEffect } from "react";
import { ArrowRight, X } from "lucide-react";
import type { HungryApp } from "@/lib/pwa-install";

const details = {
  student: {
    message: "HUNGRY is already installed on your device. You can launch it anytime from your home screen or desktop, or start ordering right now!",
    action: "Start Ordering",
    href: "/auth?hungry_app=student",
  },
  canteen: {
    message: "HUNGRY Canteen Dashboard is already installed on your device. You can launch it anytime from your home screen or desktop, or manage your canteen right now!",
    action: "Open Canteen Dashboard",
    href: "/canteen?hungry_app=canteen",
  },
} satisfies Record<HungryApp, { message: string; action: string; href: string }>;

export function AlreadyInstalledDialog({ app, onClose }: { app: HungryApp; onClose: () => void }) {
  const copy = details[app];
  const studentTheme = app === "student";
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);
  return (
    <div className="pwa-installed-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section aria-modal="true" aria-labelledby="pwa-installed-title" className={`pwa-installed-dialog${studentTheme ? " pwa-installed-dialog--student" : ""}`} role="dialog">
        <button aria-label="Close dialog" className={`pwa-installed-close${studentTheme ? " pwa-installed-close--student" : ""}`} onClick={onClose} type="button"><X aria-hidden="true" className="h-5 w-5" /></button>
        <img alt="HUNGRY" className={`pwa-installed-logo${studentTheme ? " pwa-installed-logo--student" : ""}`} height="80" src="/pwa-icon-192.png" width="80" />
        <h2 className={`pwa-installed-title${studentTheme ? " pwa-installed-title--student" : ""}`} id="pwa-installed-title">Already Installed</h2>
        <p className={`pwa-installed-message${studentTheme ? " pwa-installed-message--student" : ""}`}>{copy.message}</p>
        <a className={`pwa-installed-primary${studentTheme ? " pwa-installed-primary--student" : ""}`} href={copy.href}>{copy.action}<ArrowRight aria-hidden="true" className="h-5 w-5" /></a>
        <button className={`pwa-installed-secondary${studentTheme ? " pwa-installed-secondary--student" : ""}`} onClick={onClose} type="button">Close</button>
      </section>
    </div>
  );
}
