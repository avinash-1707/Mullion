"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { redirectToSignIn } from "@/lib/auth-redirect";
import { useBuildRun } from "@/hooks/use-build-run";
import { DashboardSkeleton } from "@/components/dashboard-skeleton";
import { SessionErrorState } from "@/components/planning/session-error-state";
import { BuildRunSkeleton } from "@/components/build/build-skeletons";
import { BuildRunHeader } from "@/components/build/build-run-header";
import { BuildEscalationGate } from "@/components/build/build-escalation-gate";
import { BuildTaskList } from "@/components/build/build-task-list";
import { BuildAgentGraph } from "@/components/build/build-agent-graph";
import { BuildEventTimeline } from "@/components/build/build-event-timeline";
import { BuildDeliveryPanel } from "@/components/build/build-delivery-panel";

export default function BuildRunPage() {
  const params = useParams<{ id: string }>();
  const runId = params.id;

  const { data: authSession, isPending: authPending } = authClient.useSession();

  useEffect(() => {
    if (!authPending && !authSession) redirectToSignIn();
  }, [authPending, authSession]);

  const build = useBuildRun(runId);

  // A 401 on the page's snapshot fetch (initial load or reload) funnels
  // through the same sign-in redirect as the initial gate. Mid-session
  // expiry on the SSE stream alone isn't detected until the next fetch.
  useEffect(() => {
    if (build.unauthorized) redirectToSignIn();
  }, [build.unauthorized]);

  const [activeTab, setActiveTab] = useState<"tasks" | "timeline">("tasks");
  const [tasksView, setTasksView] = useState<"list" | "graph">("list");
  // Bumps whenever the graph pane transitions into visibility — same
  // hidden-tab remount problem architecture-diagram.tsx solves (fitView
  // against a still-0×0 container never self-corrects), bumped directly in
  // the List/Graph toggle and mobile-tab click handlers below.
  const [graphRefitToken, setGraphRefitToken] = useState(0);

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

      <div className="flex border-b border-border lg:hidden" aria-label="Build panes">
        {(["tasks", "timeline"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            aria-pressed={activeTab === tab}
            onClick={() => {
              setActiveTab(tab);
              if (tab === "tasks" && tasksView === "graph") setGraphRefitToken((token) => token + 1);
            }}
            className={[
              "transition-swift flex-1 border-b-2 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.15em]",
              activeTab === tab ? "border-accent text-fg" : "border-transparent text-fg-faint hover:text-fg-muted",
            ].join(" ")}
          >
            {tab === "tasks" ? "Tasks" : "Timeline"}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6 lg:flex-row">
        <div className={`flex min-h-[20rem] flex-1 flex-col gap-3 ${activeTab === "tasks" ? "" : "hidden lg:flex"}`}>
          <div className="flex shrink-0 justify-end">
            <div className="inline-flex items-center border border-border bg-surface" aria-label="Task view">
              {(["list", "graph"] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  aria-pressed={tasksView === view}
                  onClick={() => {
                    setTasksView(view);
                    if (view === "graph") setGraphRefitToken((token) => token + 1);
                  }}
                  className={[
                    "transition-swift border-b-2 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em]",
                    tasksView === view ? "border-accent text-fg" : "border-transparent text-fg-faint hover:text-fg-muted",
                  ].join(" ")}
                >
                  {view === "list" ? "List" : "Graph"}
                </button>
              ))}
            </div>
          </div>
          <div className={tasksView === "list" ? "min-h-0 flex-1" : "hidden"}>
            <BuildTaskList tasks={build.tasks} />
          </div>
          <div className={tasksView === "graph" ? "min-h-0 flex-1" : "hidden"}>
            <BuildAgentGraph
              tasks={build.tasks}
              escalatedSpecTaskId={build.timeline.activeEscalation?.specTaskId ?? null}
              refitToken={graphRefitToken}
            />
          </div>
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
            <p className="text-center text-xs text-fg-faint">The run finished - waiting on the delivery summary.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
