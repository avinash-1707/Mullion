"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { authClient } from "../../../lib/auth-client";
import { useBuildRun } from "../../../hooks/use-build-run";
import { DashboardSkeleton } from "../../../components/dashboard-skeleton";
import { SessionErrorState } from "../../../components/planning/session-error-state";
import { BuildRunSkeleton } from "../../../components/build/build-skeletons";
import { BuildRunHeader } from "../../../components/build/build-run-header";
import { BuildEscalationGate } from "../../../components/build/build-escalation-gate";
import { BuildTaskList } from "../../../components/build/build-task-list";
import { BuildEventTimeline } from "../../../components/build/build-event-timeline";
import { BuildDeliveryPanel } from "../../../components/build/build-delivery-panel";

export default function BuildRunPage() {
  const params = useParams<{ id: string }>();
  const runId = params.id;
  const router = useRouter();

  const { data: authSession, isPending: authPending } = authClient.useSession();

  useEffect(() => {
    if (!authPending && !authSession) router.replace("/sign-in");
  }, [authPending, authSession, router]);

  const build = useBuildRun(runId);

  useEffect(() => {
    if (build.unauthorized) router.replace("/sign-in");
  }, [build.unauthorized, router]);

  const [activeTab, setActiveTab] = useState<"tasks" | "timeline">("tasks");

  if (authPending || !authSession) {
    return <DashboardSkeleton />;
  }

  if (build.notFound) {
    return (
      <SessionErrorState
        title="Build not found"
        message="This build doesn't exist, or belongs to a different organization."
      />
    );
  }

  if (build.unauthorized) {
    return <DashboardSkeleton />;
  }

  if (build.loadError) {
    return <SessionErrorState title="Couldn't load this build" message={build.loadError} />;
  }

  if (build.isRunLoading || !build.run) {
    return <BuildRunSkeleton />;
  }

  const { run } = build;
  const isTerminal = run.status === "done" || run.status === "failed";

  // Latest delivery_result wins — a partial re-ship (rare, but possible on a
  // retried escalation) should show the most recent summary, not the first.
  const deliveryEntry = [...build.timeline.entries].reverse().find((entry) => entry.event.kind === "delivery_result");
  const delivery = deliveryEntry && deliveryEntry.event.kind === "delivery_result" ? deliveryEntry.event : null;

  const showGate = build.timeline.activeEscalation !== null && !isTerminal;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <BuildRunHeader run={run} />

      {showGate && build.timeline.activeEscalation ? (
        <BuildEscalationGate
          // Keyed by specTaskId so a new escalation always mounts fresh —
          // an open "redirect" draft from a resolved gate must never bleed
          // into the next one.
          key={build.timeline.activeEscalation.specTaskId}
          specTaskId={build.timeline.activeEscalation.specTaskId}
          reason={build.timeline.activeEscalation.reason}
          onDecide={build.escalate}
          isSubmitting={build.isEscalating}
          error={build.escalationError}
          onDismissError={build.clearEscalationError}
        />
      ) : null}

      <div className="flex border-b border-border lg:hidden">
        {(["tasks", "timeline"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={[
              "transition-swift flex-1 border-b-2 px-4 py-2.5 text-sm font-medium",
              activeTab === tab ? "border-accent text-fg" : "border-transparent text-fg-faint hover:text-fg-muted",
            ].join(" ")}
          >
            {tab === "tasks" ? "Tasks" : "Timeline"}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6 lg:flex-row">
        <div className={`min-h-[20rem] flex-1 ${activeTab === "tasks" ? "" : "hidden lg:block"}`}>
          <BuildTaskList tasks={build.tasks} />
        </div>
        <div className={`min-h-[18rem] lg:w-[24rem] lg:shrink-0 ${activeTab === "timeline" ? "" : "hidden lg:block"}`}>
          <BuildEventTimeline entries={build.timeline.entries} />
        </div>
      </div>

      {delivery || isTerminal ? (
        <div className="border-t border-border p-4 sm:p-6">
          {delivery ? (
            <BuildDeliveryPanel deliveries={delivery.deliveries} isPartial={delivery.isPartial} />
          ) : (
            <p className="text-center text-xs text-fg-faint">The run finished — waiting on the delivery summary.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
