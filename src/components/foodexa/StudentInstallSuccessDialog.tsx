import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, X } from "lucide-react";
import { LogoMark } from "@/components/foodexa/LogoMark";

export function StudentInstallSuccessDialog({ onClose }: { onClose: () => void }) {
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
        aria-labelledby="student-install-success-title"
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
        <h2 className="pwa-installed-title" id="student-install-success-title">
          Installation Successful!
        </h2>
        <p className="pwa-installed-message">
          HUNGRY has been successfully installed on your device. You can now access your food ordering app from your home screen.
        </p>
        <a className="pwa-installed-primary" href="/auth?hungry_app=student">
          Start Ordering<ArrowRight aria-hidden="true" className="h-5 w-5" />
        </a>
      </section>
    </div>,
    document.body,
  );
}
