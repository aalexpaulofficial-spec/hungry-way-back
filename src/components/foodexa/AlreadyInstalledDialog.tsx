import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, X } from "lucide-react";
import { LogoMark } from "@/components/foodexa/LogoMark";
import type { HungryApp } from "@/lib/pwa-install";

const details = {
  student: {
    message: "HUNGRY is already installed on your device. You can launch it anytime from your home screen or desktop, or start ordering right now!",
    action: "Start Ordering in App",
  },
  canteen: {
    message: "HUNGRY Canteen Dashboard is already installed on your device. You can launch it anytime from your home screen or desktop, or manage your canteen right now!",
    action: "Open Canteen Dashboard",
    href: "/register-canteen?hungry_app=canteen",
  },
} satisfies {
  student: { message: string; action: string };
  canteen: { message: string; action: string; href: string };
};

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
  return createPortal(
    <div className="pwa-installed-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section aria-modal="true" aria-labelledby="pwa-installed-title" className="pwa-installed-dialog" role="dialog">
        <button aria-label="Close dialog" className="pwa-installed-close" onClick={onClose} type="button"><X aria-hidden="true" className="h-5 w-5" /></button>
        <div aria-label="HUNGRY" className="pwa-installed-logo-wrap" role="img">
          <LogoMark className="pwa-installed-logo" />
        </div>
        <h2 className="pwa-installed-title" id="pwa-installed-title">Already Installed</h2>
        <p className="pwa-installed-message">{copy.message}</p>
        {app === "student" ? (
          <button
            className="pwa-installed-primary border-0 font-[inherit] cursor-default disabled:opacity-100"
            disabled
            type="button"
          >
            {details.student.action}<ArrowRight aria-hidden="true" className="h-5 w-5" />
          </button>
        ) : (
          <a className="pwa-installed-primary" href={details.canteen.href}>
            {details.canteen.action}<ArrowRight aria-hidden="true" className="h-5 w-5" />
          </a>
        )}
        <button className="pwa-installed-secondary" onClick={onClose} type="button">Close</button>
      </section>
    </div>,
    document.body,
  );
}
