import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("motion/react", () => ({
  motion: { span: ({ children }: { children: ReactNode }) => <span>{children}</span> },
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
}));

import { HeroInstallButton } from "@/components/foodexa/HeroInstallButton";
import {
  clearDeferredInstallPrompt,
  getDeferredInstallPrompt,
  getInstallFallback,
  isAppInstalled,
  subscribeToInstallPrompt,
  type InstallPromptEvent,
} from "@/lib/pwa-install";
import studentManifestSource from "../../public/manifest-student.webmanifest?raw";
import canteenManifestSource from "../../public/manifest-canteen.webmanifest?raw";

type InstallManifest = {
  id: string;
  name: string;
  start_url: string;
  scope: string;
  theme_color: string;
  short_name: string;
  icons: { src: string; type: string; sizes: string }[];
};

const studentManifest = JSON.parse(studentManifestSource) as InstallManifest;
const canteenManifest = JSON.parse(canteenManifestSource) as InstallManifest;

function setManifest(name: "student" | "canteen") {
  document.head.querySelector('link[rel="manifest"]')?.remove();
  const manifest = document.createElement("link");
  manifest.rel = "manifest";
  manifest.href = `/manifest-${name}.webmanifest`;
  document.head.append(manifest);
}

describe("independent HUNGRY PWA install flows", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/");
    setManifest("student");
  });

  afterEach(() => {
    cleanup();
    clearDeferredInstallPrompt();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps separate student and owner PWA identities and launch pages", () => {
    expect(studentManifest.id).not.toBe(canteenManifest.id);
    expect(studentManifest.name).toBe("Hungry - Food Order");
    expect(studentManifest.start_url).toBe("/auth?hungry_app=student");
    expect(canteenManifest.name).toBe("Hungry - Canteen Dashboard");
    expect(canteenManifest.start_url).toBe("/canteen?hungry_app=canteen");
    expect(studentManifest.scope).toBe("/");
    expect(canteenManifest.scope).toBe("/");
    expect(studentManifest.icons.map((icon) => icon.src)).toEqual(canteenManifest.icons.map((icon) => icon.src));
  });

  it("detects each installation using the browser's related-apps result", async () => {
    Object.defineProperty(navigator, "getInstalledRelatedApps", {
      configurable: true,
      value: vi.fn().mockResolvedValue([{ platform: "webapp", id: `${window.location.origin}/?hungry_app=student` }]),
    });
    await expect(isAppInstalled("student")).resolves.toBe(true);
    await expect(isAppInstalled("canteen")).resolves.toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it("does not claim installation when the browser cannot report it", async () => {
    Object.defineProperty(navigator, "getInstalledRelatedApps", { configurable: true, value: undefined });
    await expect(isAppInstalled("student")).resolves.toBe(false);
    await expect(isAppInstalled("canteen")).resolves.toBe(false);
  });

  it("captures a native prompt only for the manifest active on this page", () => {
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: "accepted" as const, platform: "web" }),
    }) as InstallPromptEvent;
    const update = vi.fn();
    const unsubscribe = subscribeToInstallPrompt(update);
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(getDeferredInstallPrompt("student")).toBe(event);
    expect(getDeferredInstallPrompt("canteen")).toBeNull();
    expect(update).toHaveBeenCalledOnce();
    clearDeferredInstallPrompt(event);
    expect(getDeferredInstallPrompt()).toBeNull();
    unsubscribe();
  });

  it("retains the canteen prompt independently when its manifest is active", () => {
    setManifest("canteen");
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: "accepted" as const, platform: "web" }),
    }) as InstallPromptEvent;
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(getDeferredInstallPrompt("canteen")).toBe(event);
    expect(getDeferredInstallPrompt("student")).toBeNull();
  });

  it("provides an iOS Add to Home Screen fallback without claiming installation", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1", platform: "", maxTouchPoints: 0 });
    expect(getInstallFallback("student")).toContain("Add to Home Screen");
    expect(getInstallFallback("student")).not.toContain("already installed");
  });

  it("shows the fixed student label until browser-reported installation succeeds", async () => {
    Object.defineProperty(navigator, "getInstalledRelatedApps", {
      configurable: true,
      value: vi.fn().mockResolvedValue([{ platform: "webapp", id: `${window.location.origin}/?hungry_app=student` }]),
    });
    render(<HeroInstallButton app="student" />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByRole("button", { name: "Already Installed" })).toHaveTextContent("Already Installed");
  });

  it("directly prompts from the landing-page click without navigating to an install route", async () => {
    Object.defineProperty(navigator, "getInstalledRelatedApps", { configurable: true, value: vi.fn().mockResolvedValue([]) });
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" as const, platform: "web" }),
    }) as InstallPromptEvent;
    window.dispatchEvent(event);
    render(<HeroInstallButton app="student" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Download HUNGRY for Students, Faculty and Guests" }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(prompt).toHaveBeenCalledOnce();
    expect(window.location.pathname).toBe("/");
    expect(screen.getByRole("button", { name: "Download HUNGRY for Students, Faculty and Guests" })).toBeInTheDocument();
    await act(async () => { window.dispatchEvent(new Event("appinstalled")); });
    expect(screen.getByRole("button", { name: "Already Installed" })).toHaveTextContent("Already Installed");
  });

  it("shows the user popup and routes Start Ordering to the existing login page", async () => {
    Object.defineProperty(navigator, "getInstalledRelatedApps", {
      configurable: true,
      value: vi.fn().mockResolvedValue([{ platform: "webapp", id: `${window.location.origin}/?hungry_app=student` }]),
    });
    render(<HeroInstallButton app="student" />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    fireEvent.click(screen.getByRole("button", { name: "Already Installed" }));
    expect(screen.getByRole("heading", { name: "Already Installed" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Start Ordering/ })).toHaveAttribute("href", "/auth?hungry_app=student");
  });

  it("keeps the separate canteen download action as a button", () => {
    render(<HeroInstallButton app="canteen" />);
    expect(screen.getByRole("button", { name: "Download the Canteen Dashboard for Canteen Owners" })).toHaveTextContent("Download Canteen Dashboard");
    expect(screen.queryByRole("link", { name: /Download/ })).not.toBeInTheDocument();
  });

  it("does not reuse the student prompt for the canteen app from the landing manifest", async () => {
    Object.defineProperty(navigator, "getInstalledRelatedApps", { configurable: true, value: vi.fn().mockResolvedValue([]) });
    const prompt = vi.fn().mockResolvedValue(undefined);
    window.dispatchEvent(Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" as const, platform: "web" }),
    }));
    const originalLocationDescriptor = Object.getOwnPropertyDescriptor(window, "location");
    const currentLocation = window.location;
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      get: () => ({ origin: currentLocation.origin, pathname: currentLocation.pathname, search: currentLocation.search, assign }),
    });
    render(<HeroInstallButton app="canteen" />);
    fireEvent.click(screen.getByRole("button", { name: "Download the Canteen Dashboard for Canteen Owners" }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    if (originalLocationDescriptor) Object.defineProperty(window, "location", originalLocationDescriptor);
    expect(prompt).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith("/canteen?hungry_app=canteen");
  });

  it("directly prompts for the Canteen Dashboard on its own manifest route", async () => {
    window.history.replaceState({}, "", "/canteen?hungry_app=canteen");
    setManifest("canteen");
    Object.defineProperty(navigator, "getInstalledRelatedApps", { configurable: true, value: vi.fn().mockResolvedValue([]) });
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" as const, platform: "web" }),
    }) as InstallPromptEvent;
    window.dispatchEvent(event);
    render(<HeroInstallButton app="canteen" />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Download the Canteen Dashboard for Canteen Owners" }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(prompt).toHaveBeenCalledOnce();
    await act(async () => { window.dispatchEvent(new Event("appinstalled")); });
    expect(screen.getByRole("button", { name: "Already Installed" })).toHaveTextContent("Already Installed");
  });

  it("shows the canteen popup and routes to the existing owner login page", async () => {
    Object.defineProperty(navigator, "getInstalledRelatedApps", {
      configurable: true,
      value: vi.fn().mockResolvedValue([{ platform: "webapp", id: `${window.location.origin}/?hungry_app=canteen` }]),
    });
    render(<HeroInstallButton app="canteen" />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    fireEvent.click(screen.getByRole("button", { name: "Already Installed" }));
    expect(screen.getByRole("heading", { name: "Already Installed" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Canteen Dashboard/ })).toHaveAttribute("href", "/canteen?hungry_app=canteen");
  });
});
