import { act, cleanup, render, screen } from "@testing-library/react";
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
  getInstallInstructions,
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

describe("separate HUNGRY app install flows", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    cleanup();
    clearDeferredInstallPrompt();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps distinct app identities, launch pages, icons, and theme colours in the shared scope", () => {
    expect(studentManifest.id).not.toBe(canteenManifest.id);
    expect(studentManifest.name).toBe("HUNGRY");
    expect(studentManifest.short_name).toBe("HUNGRY");
    expect(canteenManifest.name).toBe("HUNGRY CANTEEN DASHBOARD");
    expect(canteenManifest.short_name).toBe("HUNGRY CANTEEN");
    expect(studentManifest.start_url).toBe("/auth?hungry_app=student");
    expect(canteenManifest.start_url).toBe("/register-canteen?hungry_app=canteen");
    expect(studentManifest.scope).toBe("/");
    expect(canteenManifest.scope).toBe("/");
    expect(studentManifest.theme_color).not.toBe(canteenManifest.theme_color);
    expect(studentManifest.icons.map((icon) => icon.src)).toEqual(
      canteenManifest.icons.map((icon) => icon.src),
    );
    expect(studentManifest.icons.some((icon) => icon.sizes === "192x192")).toBe(true);
    expect(canteenManifest.icons.some((icon) => icon.sizes === "512x512")).toBe(true);
  });

  it("uses a fresh related-apps result to detect each app independently", async () => {
    const getInstalledRelatedApps = vi.fn().mockResolvedValue([
      { platform: "webapp", id: `${window.location.origin}/?hungry_app=student` },
    ]);
    Object.defineProperty(navigator, "getInstalledRelatedApps", {
      configurable: true,
      value: getInstalledRelatedApps,
    });

    await expect(isAppInstalled("student")).resolves.toBe(true);
    await expect(isAppInstalled("canteen")).resolves.toBe(false);
    expect(getInstalledRelatedApps).toHaveBeenCalledTimes(2);
    expect(localStorage.length).toBe(0);
  });

  it("does not claim an app is installed when the browser cannot report installation state", async () => {
    Object.defineProperty(navigator, "getInstalledRelatedApps", {
      configurable: true,
      value: undefined,
    });
    await expect(isAppInstalled("student")).resolves.toBe(false);
    await expect(isAppInstalled("canteen")).resolves.toBe(false);
  });

  it("captures the browser install event before the install page hydrates", () => {
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: "accepted" as const, platform: "web" }),
    }) as InstallPromptEvent;
    const update = vi.fn();
    const unsubscribe = subscribeToInstallPrompt(update);

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(getDeferredInstallPrompt()).toBe(event);
    expect(update).toHaveBeenCalledOnce();
    clearDeferredInstallPrompt(event);
    expect(getDeferredInstallPrompt()).toBeNull();
    unsubscribe();
  });

  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1", "Tap Share, then Add to Home Screen."],
    ["Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36", "Open the ⋮ menu and choose Install app"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36", "install icon in the address bar"],
  ])("provides device-specific install instructions for %s", (userAgent, instruction) => {
    vi.stubGlobal("navigator", { userAgent, platform: "", maxTouchPoints: 0 });
    expect(getInstallInstructions()).toContain(instruction);
  });

  it("alternates student button copy and refreshes installed state from the browser", async () => {
    Object.defineProperty(navigator, "getInstalledRelatedApps", {
      configurable: true,
      value: vi.fn().mockResolvedValue([
        { platform: "webapp", id: `${window.location.origin}/?hungry_app=student` },
      ]),
    });
    let tick: (() => void) | undefined;
    vi.spyOn(window, "setInterval").mockImplementation((handler, delay) => {
      expect(delay).toBe(4000);
      tick = handler as () => void;
      return 1 as ReturnType<typeof window.setInterval>;
    });
    vi.spyOn(window, "clearInterval").mockImplementation(() => {});
    render(<HeroInstallButton app="student" />);

    expect(screen.getByText("Download HUNGRY")).toBeInTheDocument();
    act(() => tick?.());
    expect(screen.getByText("For Students, Faculty & Guests")).toBeInTheDocument();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("Already Installed")).toBeInTheDocument();
  });

  it("uses the separate canteen audience copy", () => {
    render(<HeroInstallButton app="canteen" />);
    expect(screen.getByText("Download Canteen Dashboard")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/install/canteen");
  });
});
