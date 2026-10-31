import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, X } from "lucide-react";
import { LogoMark } from "@/components/foodexa/LogoMark";

type DialogMode = "success" | "already";

const content = {
  success: {
    title: "Installation Successful!",
    message: "HUNGRY Canteen Dashboard has been successfully installed on your device. You can now access your canteen management dashboard from your home screen.",
  },
  already: {
    title: "Already Installed",
    message: "HUNGRY Canteen Dashboard is already installed on your device. You can launch it anytime from your home screen or desktop, or manage your canteen right now!",
  },
} satisfies Record<DialogMode, { title: string; message: string }>;

export function CanteenInstallStatusDialog({ mode, onClose }: { mode: DialogMode; onClose: () => void }) {
  const copy = content[mode];

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="pwa-installed-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-modal="true"
        aria-labelledby="canteen-install-status-title"
        className="pwa-installed-dialog"
        role="dialog"
      >
        <button
          aria-label="Close dialog"
          className="pwa-installed-close"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" className="h-5 w-5" />
        </button>
        <div aria-label="HUNGRY" className="pwa-installed-logo-wrap" role="img">
          <LogoMark className="pwa-installed-logo" />
        </div>
        <h2 className="pwa-installed-title" id="canteen-install-status-title">
          {copy.title}
        </h2>
        <p className="pwa-installed-message">{copy.message}</p>
        <button
          className="pwa-installed-primary border-0 font-[inherit] cursor-default disabled:opacity-100"
          disabled
          type="button"
        >
          Open Canteen Dashboard in App<ArrowRight aria-hidden="true" className="h-5 w-5" />
        </button>
        {mode === "already" && (
          <button className="pwa-installed-secondary" onClick={onClose} type="button">
            Close
          </button>
        )}
      </section>
    </div>,
    document.body,
  );
}
