"use client";

import { useCallback, useId } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TabList, TabPanel, type TabItem } from "@/components/ui/tabs";
import { ProfileSection } from "./profile-section";
import { SecuritySection } from "./security-section";
import { ConnectedAccountsSection } from "./connected-accounts-section";
import { MembersSection } from "./members-section";
import { ModelsSection } from "./models-section";
import { AnalyticsSection } from "./analytics-section";

type TabValue = "profile" | "members" | "models" | "analytics";

const TABS: TabItem[] = [
  { value: "profile", label: "Profile" },
  { value: "members", label: "Members" },
  { value: "models", label: "Models" },
  { value: "analytics", label: "Analytics" },
];

function isTabValue(value: string | null): value is TabValue {
  return value === "profile" || value === "members" || value === "models" || value === "analytics";
}

// URL-driven so a tab is bookmarkable/shareable/back-button-able —
// `?tab=` is read via useSearchParams and written via a shallow
// router.replace (no history entry per tab switch, no scroll reset). The
// root layout forces every route dynamic (`dynamic = "force-dynamic"`,
// layout.tsx) so this never hits the "useSearchParams needs a Suspense
// boundary" static-prerender case.
export function SettingsTabs() {
  const idBase = useId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab: TabValue = isTabValue(requestedTab) ? requestedTab : "profile";

  const setActiveTab = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", value);
      router.replace(`/settings?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  return (
    <div>
      <TabList items={TABS} value={activeTab} onChange={setActiveTab} idBase={idBase} />

      <TabPanel value="profile" activeValue={activeTab} idBase={idBase} className="flex flex-col gap-14 pt-14">
        <ProfileSection />
        <div className="border-t border-hairline pt-14">
          <SecuritySection />
        </div>
        <div className="border-t border-hairline pt-14">
          <ConnectedAccountsSection />
        </div>
      </TabPanel>

      <TabPanel value="members" activeValue={activeTab} idBase={idBase} className="pt-14">
        <MembersSection />
      </TabPanel>

      <TabPanel value="models" activeValue={activeTab} idBase={idBase} className="pt-14">
        <ModelsSection />
      </TabPanel>

      <TabPanel value="analytics" activeValue={activeTab} idBase={idBase} className="pt-14">
        <AnalyticsSection />
      </TabPanel>
    </div>
  );
}
