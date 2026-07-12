"use client";

import { OrgIcon } from "@/components/planning/icons";
import { Select, type SelectOption } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { isPersonalOrg } from "@/lib/organizations-api";
import { useOrganizationsList, useActiveOrganizationId, useSetActiveOrgMutation } from "@/hooks/use-organizations";

interface OrgSwitcherProps {
  /** Mirrors AccountMenu's variant contract: `rail` sits in the desktop
   * sidebar's fixed 60px icon slot + hover-fade label region; `drawer` is
   * the mobile slide-over's always-expanded equivalent. */
  variant: "rail" | "drawer";
}

// Bare functional dropdown by design (no avatars, no "recent" memory) — a
// direct reuse of ui/select.tsx, which is already the right shape for "a
// small labeled list of options." Org list + which one is active are AUTH
// state, read straight off Better Auth's own hooks (hooks/use-organizations.ts)
// rather than wrapped in TanStack Query, per project convention; switching
// is the one mutation that then has to reach into TanStack Query, since
// every fetched settings/members resource in this app is org-scoped.
export function OrgSwitcher({ variant }: OrgSwitcherProps) {
  const isRail = variant === "rail";
  const { data: organizations, isPending } = useOrganizationsList();
  const activeOrganizationId = useActiveOrganizationId();
  const setActiveOrg = useSetActiveOrgMutation();

  if (isPending || !organizations) {
    return (
      <div className={cn("flex items-center border-b border-hairline", isRail ? "h-11" : "h-12 gap-3 px-6")}>
        <span className={cn("flex shrink-0 items-center justify-center", isRail && "h-11 w-[60px]")}>
          <Skeleton className="h-4 w-4" />
        </span>
        <Skeleton className={cn("h-3 w-20", isRail && "mullion-rail-label")} />
      </div>
    );
  }

  // Fewer than two orgs: nothing to switch between yet (the common case —
  // most users are on just their personal org) — collapse to nothing
  // rather than a functionally-empty dropdown taking up chrome space.
  if (organizations.length < 2) {
    return null;
  }

  const options: SelectOption[] = organizations.map((org) => ({
    value: org.id,
    label: isPersonalOrg(org.metadata) ? `${org.name} (Personal)` : org.name,
  }));

  return (
    <div className={cn("flex items-center border-b border-hairline", isRail ? "h-11" : "h-12 gap-3 px-6")}>
      <span className={cn("flex shrink-0 items-center justify-center text-fg-muted", isRail && "h-11 w-[60px]")}>
        <OrgIcon className="h-4 w-4" />
      </span>
      <div className={cn("min-w-0 flex-1", isRail && "mullion-rail-label overflow-hidden pr-3")}>
        <Select
          fieldId={`org-switcher-${variant}`}
          aria-label="Switch organization"
          value={activeOrganizationId ?? options[0]?.value ?? ""}
          onChange={(organizationId) => setActiveOrg.mutate(organizationId)}
          disabled={setActiveOrg.isPending}
          options={options}
        />
      </div>
    </div>
  );
}
