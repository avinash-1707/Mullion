// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrgDropdown } from "./org-dropdown";

// The component reads everything through the hooks module, so mocking it
// wholesale keeps the tests free of Better Auth + QueryClient plumbing —
// the mutation contract (mutate/isPending/isError/error) is the seam.
const mocks = vi.hoisted(() => ({
  list: { data: null as unknown, isPending: false },
  activeId: null as string | null,
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  error: null as Error | null,
  push: vi.fn(),
}));

vi.mock("@/hooks/use-organizations", () => ({
  useOrganizationsList: () => mocks.list,
  useActiveOrganizationId: () => mocks.activeId,
  useSetActiveOrgMutation: () => ({
    mutate: mocks.mutate,
    isPending: mocks.isPending,
    isError: mocks.isError,
    error: mocks.error,
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

const ORGS = [
  { id: "org-personal", name: "Avinash", metadata: { personal: true } },
  { id: "org-acme", name: "Acme Inc", metadata: null },
];

beforeEach(() => {
  mocks.list = { data: ORGS, isPending: false };
  mocks.activeId = "org-acme";
  mocks.isPending = false;
  mocks.isError = false;
  mocks.error = null;
  mocks.mutate.mockReset();
  mocks.push.mockReset();
});

afterEach(cleanup);

function trigger() {
  return screen.getByRole("button", { expanded: false }) as HTMLButtonElement;
}

describe("OrgDropdown", () => {
  it("renders a skeleton row while organizations load", () => {
    mocks.list = { data: null, isPending: true };
    const { container } = render(<OrgDropdown variant="rail" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector(".animate-skeleton, [class*='skeleton'], [class*='Skeleton']")).not.toBeNull();
  });

  it("stays visible with a single org (reversal of the old <2-orgs null)", () => {
    mocks.list = { data: [ORGS[0]], isPending: false };
    mocks.activeId = "org-personal";
    render(<OrgDropdown variant="rail" />);
    expect(screen.getByRole("button", { name: /Avinash \(Personal\)/ })).toBeTruthy();
  });

  it("opens on click, sets data-menu-open, and closes on Escape refocusing the trigger", async () => {
    const user = userEvent.setup();
    const { container } = render(<OrgDropdown variant="rail" />);
    const triggerButton = trigger();

    expect(container.querySelector("[data-menu-open]")).toBeNull();
    await user.click(triggerButton);
    expect(triggerButton.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("[data-menu-open]")).not.toBeNull();

    await user.keyboard("{Escape}");
    expect(triggerButton.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("[data-menu-open]")).toBeNull();
    expect(document.activeElement).toBe(triggerButton);
  });

  it("closes on pointerdown outside without stealing focus back", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div>
        <OrgDropdown variant="rail" />
        <button type="button">elsewhere</button>
      </div>,
    );
    await user.click(trigger());
    expect(container.querySelector("[data-menu-open]")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(container.querySelector("[data-menu-open]")).toBeNull();
  });

  it("marks the active org checked and shows both orgs as menuitemradio", async () => {
    const user = userEvent.setup();
    render(<OrgDropdown variant="rail" />);
    await user.click(trigger());

    const radios = screen.getAllByRole("menuitemradio");
    expect(radios).toHaveLength(2);
    expect(radios[0]?.getAttribute("aria-checked")).toBe("false");
    expect(radios[1]?.getAttribute("aria-checked")).toBe("true");
  });

  it("switching to another org calls setActive with its id and closes", async () => {
    const user = userEvent.setup();
    const { container } = render(<OrgDropdown variant="rail" />);
    await user.click(trigger());

    await user.click(screen.getByRole("menuitemradio", { name: /Avinash \(Personal\)/ }));
    expect(mocks.mutate).toHaveBeenCalledExactlyOnceWith("org-personal");
    expect(container.querySelector("[data-menu-open]")).toBeNull();
  });

  it("clicking the already-active org just closes, no mutation", async () => {
    const user = userEvent.setup();
    const { container } = render(<OrgDropdown variant="rail" />);
    await user.click(trigger());

    await user.click(screen.getByRole("menuitemradio", { name: /Acme Inc/ }));
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(container.querySelector("[data-menu-open]")).toBeNull();
  });

  it("disables the trigger while a switch is pending (double-switch guard)", () => {
    mocks.isPending = true;
    render(<OrgDropdown variant="rail" />);
    expect(trigger().disabled).toBe(true);
  });

  it("opens from the trigger keyboard: ArrowDown/Enter focus first, ArrowUp focuses last", async () => {
    const user = userEvent.setup();
    render(<OrgDropdown variant="rail" />);
    const triggerButton = trigger();

    triggerButton.focus();
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Create organization" }));

    await user.keyboard("{Escape}");
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getAllByRole("menuitemradio")[0]);

    await user.keyboard("{Escape}");
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getAllByRole("menuitemradio")[0]);
  });

  it("Tab closes the menu and lands focus on the trigger, never a dead inert item", async () => {
    const user = userEvent.setup();
    const { container } = render(<OrgDropdown variant="rail" />);
    const triggerButton = trigger();
    await user.click(triggerButton);

    await user.tab();
    expect(container.querySelector("[data-menu-open]")).toBeNull();
    expect(document.activeElement).toBe(triggerButton);
  });

  it("falls back to the first org in the trigger when no active id, with nothing checked", async () => {
    const user = userEvent.setup();
    mocks.activeId = null;
    render(<OrgDropdown variant="rail" />);

    expect(trigger().textContent).toContain("Avinash (Personal)");
    await user.click(trigger());
    for (const radio of screen.getAllByRole("menuitemradio")) {
      expect(radio.getAttribute("aria-checked")).toBe("false");
    }
  });

  it("roves focus with arrows/Home/End, wrapping across the create item", async () => {
    const user = userEvent.setup();
    render(<OrgDropdown variant="rail" />);
    await user.click(trigger());

    const radios = screen.getAllByRole("menuitemradio");
    const create = screen.getByRole("menuitem", { name: "Create organization" });

    expect(document.activeElement).toBe(radios[0]);
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(radios[1]);
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(create);
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(radios[0]);
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(create);
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(radios[0]);
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(create);
  });

  it("create-organization navigates to settings, closes, and notifies the drawer", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const { container } = render(<OrgDropdown variant="drawer" onNavigate={onNavigate} />);
    await user.click(trigger());

    await user.click(screen.getByRole("menuitem", { name: "Create organization" }));
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith("/settings?tab=members");
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(container.querySelector("[data-menu-open]")).toBeNull();
  });

  it("surfaces a switch failure as an alert while the trigger keeps the real org", () => {
    mocks.isError = true;
    mocks.error = new Error("Membership check failed");
    render(<OrgDropdown variant="rail" />);
    expect(screen.getByRole("alert").textContent).toContain("Membership check failed");
    expect(trigger().textContent).toContain("Acme Inc");
  });
});
