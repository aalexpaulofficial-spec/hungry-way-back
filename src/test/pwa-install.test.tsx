import { act, cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("motion/react", () => ({
  motion: { span: ({ children }: { children: ReactNode }) => <span>{children}</span> },
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
}));

import { HeroInstallButton } from "@/components/foodexa/HeroInstallButton";
import { isAppInstalled, markAppInstalled } from "@/lib/pwa-install";
import studentManifestSource from "../../public/manifest-student.webmanifest?raw";
import canteenManifestSource from "../../public/manifest-canteen.webmanifest?raw";

type InstallManifest = {
  id: string;
  name: string;
  start_url: string;
  scope: string;
  theme_color: string;
  icons: { src: string; type: string; sizes: string }[];
};

const studentManifest = JSON.parse(studentManifestSource) as InstallManifest;
const canteenManifest = JSON.parse(canteenManifestSource) as InstallManifest;

describe("separate HUNGRY app install flows", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("keeps distinct app identities, launch pages, icons, and theme colours in the shared scope", () => {
    expect(studentManifest.id).not.toBe(canteenManifest.id);
    expect(studentManifest.name).toContain("Student App");
    expect(canteenManifest.name).toContain("Canteen Owner App");
    expect(studentManifest.start_url).toBe("/auth?hungry_app=student");
    expect(canteenManifest.start_url).toBe("/register-canteen?hungry_app=canteen");
    expect(studentManifest.scope).toBe("/");
    expect(canteenManifest.scope).toBe("/");
    expect(studentManifest.theme_color).not.toBe(canteenManifest.theme_color);
    expect(studentManifest.icons.map((icon) => icon.src)).not.toEqual(
      canteenManifest.icons.map((icon) => icon.src),
    );
    expect(studentManifest.icons.some((icon) => icon.sizes === "192x192")).toBe(true);
    expect(canteenManifest.icons.some((icon) => icon.sizes === "512x512")).toBe(true);
  });

  it("persists install status independently for student and canteen apps", () => {
    expect(isAppInstalled("student")).toBe(false);
    expect(isAppInstalled("canteen")).toBe(false);

    markAppInstalled("student");

    expect(isAppInstalled("student")).toBe(true);
    expect(isAppInstalled("canteen")).toBe(false);
  });

  it("alternates the student button copy every four seconds and shows installed state", () => {
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

    act(() => markAppInstalled("student"));
    expect(screen.getByText("Already Installed")).toBeInTheDocument();
  });

  it("uses the separate canteen audience copy", () => {
    render(<HeroInstallButton app="canteen" />);
    expect(screen.getByText("Download Canteen Dashboard")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/install/canteen");
  });
});
