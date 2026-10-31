import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children, ...props }: { to: string; children: ReactNode; [key: string]: unknown }) => (
      <a href={to} {...props}>{children}</a>
    ),
  };
});

import { CanteenInstallPage } from "@/routes/install-canteen";
import { clearDeferredInstallPrompt, setPendingInstallApp } from "@/lib/pwa-install";

function setCanteenManifest() {
  document.head.querySelector('link[rel="manifest"]')?.remove();
  const manifest = document.createElement("link");
  manifest.rel = "manifest";
  manifest.href = "/manifest-canteen.webmanifest";
  document.head.append(manifest);
}

describe("dedicated Canteen Dashboard installation page", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", "/install-canteen");
    setCanteenManifest();
    Object.defineProperty(navigator, "getInstalledRelatedApps", {
      configurable: true,
      value: vi.fn().mockResolvedValue([]),
    });
  });

  afterEach(() => {
    cleanup();
    clearDeferredInstallPrompt();
    setPendingInstallApp(null);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps the unavailable warning cleared after install confirmation and restores Already Installed on revisit", async () => {
    render(<CanteenInstallPage />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    setPendingInstallApp("canteen");
    await act(async () => {
      window.dispatchEvent(new Event("appinstalled"));
      await Promise.resolve();
    });

    expect(screen.getByRole("heading", { name: "Installation Successful!" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Already Installed" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));

    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.queryByText(/Direct installation isn't available/i)).not.toBeInTheDocument();

    cleanup();
    Object.defineProperty(navigator, "getInstalledRelatedApps", {
      configurable: true,
      value: vi.fn().mockResolvedValue([{
        platform: "webapp",
        id: `${window.location.origin}/?hungry_app=canteen`,
        url: `${window.location.origin}/manifest-canteen.webmanifest`,
      }]),
    });
    render(<CanteenInstallPage />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    fireEvent.click(screen.getByRole("button", { name: "Already Installed" }));
    expect(screen.getByRole("heading", { name: "Already Installed" })).toBeInTheDocument();
    const openButton = screen.getByRole("button", { name: /Open Canteen Dashboard in App/ });
    expect(openButton).toBeDisabled();
    expect(openButton).not.toHaveAttribute("href");
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });
});
