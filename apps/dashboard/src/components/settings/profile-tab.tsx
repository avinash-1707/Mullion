"use client";

import { useListAccountsQuery } from "@/hooks/use-account-mutations";
import { ProfileSection } from "./profile-section";
import { SecuritySection } from "./security-section";
import { ConnectedAccountsSection } from "./connected-accounts-section";
import { ProfileTabSkeleton } from "./tab-skeletons";

// Single pending gate for the whole tab: Security and Connected accounts
// both hang off this same accounts query (shared cache — no extra fetch),
// so gating here makes the tab paint at once instead of piecemeal.
export function ProfileTab() {
  const accounts = useListAccountsQuery();

  if (accounts.isPending) {
    return <ProfileTabSkeleton />;
  }

  return (
    <>
      <ProfileSection />
      <div className="border-t border-hairline pt-14">
        <SecuritySection />
      </div>
      <div className="border-t border-hairline pt-14">
        <ConnectedAccountsSection />
      </div>
    </>
  );
}
