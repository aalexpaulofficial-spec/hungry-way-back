import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";

vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ pathname: "/app", searchStr: "" }),
  useRouter: () => ({}),
}));

import { BackButton, BackProvider, getBackFallbackPath, navigateBack, useBackNavigationEnabled, useBackStep } from "@/lib/back-nav";

describe("shared back navigation", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["/auth", "/"],
    ["/register-canteen", "/"],
    ["/app/orders/123", "/app/orders"],
  ])("uses the parent fallback for %s", (pathname, expected) => {
    expect(getBackFallbackPath(pathname)).toBe(expected);
  });

  it("uses app history when a previous browser entry exists", () => {
    vi.spyOn(window.history, "length", "get").mockReturnValue(2);
    const router = { history: { back: vi.fn() }, navigate: vi.fn() };

    navigateBack(router as never, "/auth", []);

    expect(router.history.back).toHaveBeenCalledOnce();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it("uses the parent fallback when this page has no previous entry", () => {
    vi.spyOn(window.history, "length", "get").mockReturnValue(1);
    const router = { history: { back: vi.fn() }, navigate: vi.fn() };

    navigateBack(router as never, "/app/orders/123", []);

    expect(router.history.back).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith({ to: "/app/orders" });
  });

  it("runs the current in-page back step before changing routes", () => {
    vi.spyOn(window.history, "length", "get").mockReturnValue(2);
    const step = vi.fn();
    const router = { history: { back: vi.fn() }, navigate: vi.fn() };

    navigateBack(router as never, "/app", [{ id: 1, fn: step }]);

    expect(step).toHaveBeenCalledOnce();
    expect(router.history.back).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it("disables back navigation and back-step registration for installed app shells", () => {
    function BackNavigationProbe() {
      useBackStep(true, vi.fn());
      return createElement("span", null, useBackNavigationEnabled() ? "enabled" : "disabled");
    }

    render(
      createElement(
        BackProvider,
        { disabled: true },
        createElement(BackButton),
        createElement(BackNavigationProbe),
      ),
    );

    expect(screen.getByText("disabled")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Go back" })).not.toBeInTheDocument();
  });

  it("keeps the website back button enabled by default", () => {
    render(createElement(BackProvider, null, createElement(BackButton)));

    expect(screen.getByRole("button", { name: "Go back" })).toBeInTheDocument();
  });
});
