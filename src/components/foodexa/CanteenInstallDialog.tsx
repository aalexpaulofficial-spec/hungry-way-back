import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, X } from "lucide-react";
import { LogoMark } from "@/components/foodexa/LogoMark";

type DialogMode = "confirm" | "success";

const content = {
  confirm: {
    title: "Are You a Canteen Owner?",
    message: "This application is designed exclusively for canteen owners to manage their menus, orders and daily canteen operations.",
  },
  success: {
    title: "Installation Successful!",
    message: "HUNGRY Canteen Dashboard has been successfully installed on your device. You can now access your canteen management dashboard from your home screen.",
  },
} satisfies Record<DialogMode, { title: string; message: string }>;

export function CanteenInstallDialog({
  mode,
  onContinue,
  onClose,
  error,
}: {
  mode: DialogMode;
  onContinue: () => void;
  onClose: () => void;
  error?: string;
}) {
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
        aria-labelledby="canteen-install-title"
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
        <h2 className="pwa-installed-title" id="canteen-install-title">
          {copy.title}
        </h2>
        <p className="pwa-installed-message">{copy.message}</p>
        {mode === "confirm" && error && (
          <p className="mb-4 text-sm leading-relaxed text-primary-bright" role="alert">{error}</p>
        )}
        {mode === "confirm" ? (
          <>
            <button
              className="pwa-installed-primary border-0 font-[inherit] cursor-pointer"
              onClick={onContinue}
              type="button"
            >
              Continue to Download<ArrowRight aria-hidden="true" className="h-5 w-5" />
            </button>
            <button className="pwa-installed-secondary" onClick={onClose} type="button">
              Cancel
            </button>
          </>
        ) : (
          <a className="pwa-installed-primary" href="/register-canteen?hungry_app=canteen">
            Open Canteen Dashboard<ArrowRight aria-hidden="true" className="h-5 w-5" />
          </a>
        )}
      </section>
    </div>,
    document.body,
  );
}