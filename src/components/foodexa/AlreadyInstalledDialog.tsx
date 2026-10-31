import { useEffect } from "react";
import { ArrowRight, X } from "lucide-react";
import type { HungryApp } from "@/lib/pwa-install";

const details = {
  student: {
    message: "HUNGRY is already installed on your device. You can launch it anytime from your home screen or desktop, or start ordering right now!",
    action: "Start Ordering",
    href: "/app?hungry_app=student",
  },
  canteen: {
    message: "HUNGRY Canteen Dashboard is already installed on your device. You can launch it anytime from your home screen or desktop, or manage your canteen right now!",
    action: "Open Canteen Dashboard",
    href: "/canteen?hungry_app=canteen",
  },
} satisfies Record<HungryApp, { message: string; action: string; href: string }>;

export function AlreadyInstalledDialog({ app, onClose }: { app: HungryApp; onClose: () => void }) {
  const copy = details[app];
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
      <section aria-modal="true" aria-labelledby="pwa-installed-title" className="pwa-installed-dialog" role="dialog">
        <button aria-label="Close dialog" className="pwa-installed-close" onClick={onClose} type="button"><X aria-hidden="true" className="h-5 w-5" /></button>
        <img alt="HUNGRY" className="pwa-installed-logo" height="80" src="/pwa-icon-192.png" width="80" />
        <h2 className="pwa-installed-title" id="pwa-installed-title">Already Installed</h2>
        <p className="pwa-installed-message">{copy.message}</p>
        <a className="pwa-installed-primary" href={copy.href}>{copy.action}<ArrowRight aria-hidden="true" className="h-5 w-5" /></a>
        <button className="pwa-installed-secondary" onClick={onClose} type="button">Close</button>
      </section>
    </div>
  );
}
