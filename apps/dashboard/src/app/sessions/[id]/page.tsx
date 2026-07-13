"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { redirectToSignIn } from "@/lib/auth-redirect";
import { usePlanningSession } from "@/hooks/use-planning-session";
import { RequirementsPhase } from "@/components/planning/requirements-phase";
import { ArchitecturePhase } from "@/components/planning/architecture-phase";
import { ConfirmedView } from "@/components/planning/confirmed-view";
import { ViewOnlyBanner } from "@/components/planning/view-only-banner";
import { AgentStatusStrip } from "@/components/planning/agent-status-strip";
import { SessionErrorState } from "@/components/planning/session-error-state";
import { ArchitecturePhaseSkeleton, RequirementsPhaseSkeleton } from "@/components/planning/session-skeletons";
import { DashboardSkeleton } from "@/components/dashboard-skeleton";

const PHASE_LABEL: Record<string, string> = {
  requirements: "Clarifying requirements",
  architecture: "Planning architecture",
};

export default function PlanningSessionPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params.id;
  const router = useRouter();
  const searchParams = useSearchParams();

  const { data: authSession, isPending: authPending } = authClient.useSession();

  useEffect(() => {
    if (!authPending && !authSession) redirectToSignIn();
  }, [authPending, authSession]);

  const [showResumedNotice] = useState(() => searchParams.get("resumed") === "1");
  // Just a hint from the create-session response (see idea-intake-form.tsx)
  // for which skeleton to show before this page's own snapshot fetch
  // resolves — never trusted as the actual phase once real data arrives.
  const [phaseHint] = useState(() => searchParams.get("phase"));
  useEffect(() => {
    if (searchParams.get("resumed") === "1" || searchParams.get("phase")) {
      router.replace(`/sessions/${sessionId}`, { scroll: false });
    }
    // Only ever needs to run once, on arrival — both flags are captured into
    // state above before this strips them from the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const planning = usePlanningSession(sessionId);

  // A 401 on the page's snapshot fetch (initial load or reload) funnels
  // through the same sign-in redirect as the initial gate. Mid-session
  // expiry on the SSE stream alone isn't detected until the next fetch.
  useEffect(() => {
    if (planning.unauthorized) redirectToSignIn();
  }, [planning.unauthorized]);

  if (authPending || !authSession) {
    return <DashboardSkeleton />;
  }

  if (planning.notFound) {
    return (
      <SessionErrorState
        title="Session not found"
        message="This planning session doesn't exist, or belongs to a different organization."
      />
    );
  }

  if (planning.unauthorized) {
    return <DashboardSkeleton />;
  }

  if (planning.loadError) {
    return <SessionErrorState title="Couldn't load this session" message={planning.loadError} />;
  }

  if (planning.isLoading || !planning.state) {
    return phaseHint === "architecture" ? <ArchitecturePhaseSkeleton /> : <RequirementsPhaseSkeleton />;
  }

  const { state } = planning;
  const isCreator = authSession.user.id === state.session.userId;

  if (state.session.status === "abandoned") {
    return (
      <SessionErrorState
        title="This session was abandoned"
        message="It's no longer active. Start a new one from the dashboard."
      />
    );
  }

  const isConfirmed = state.session.status === "confirmed";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="transition-swift shrink-0 text-sm text-fg-faint hover:text-fg-muted">
            ← Dashboard
          </Link>
          <span className="truncate text-sm text-fg-muted">{state.session.idea}</span>
        </div>
        {!isConfirmed ? (
          <span className="shrink-0 border border-border-strong px-3 py-1 font-mono text-[11px] uppercase tracking-[0.15em] text-fg-muted">
            {PHASE_LABEL[state.session.phase] ?? state.session.phase}
          </span>
        ) : null}
      </div>

      {showResumedNotice ? (
        <div className="border-b border-border bg-elevated px-4 py-2 text-center text-xs text-fg-muted sm:px-6">
          Resuming your active session - you already had one in progress.
        </div>
      ) : null}

      {!isCreator ? <ViewOnlyBanner /> : null}

      {isConfirmed && state.buildSpec ? (
        <ConfirmedView
          sessionId={sessionId}
          buildSpecId={state.buildSpec.id}
          contentHash={state.buildSpec.contentHash}
          frozenAt={state.buildSpec.frozenAt}
          nodes={state.nodes}
          edges={state.edges}
          decisions={state.decisions}
        />
      ) : (
        <>
          <AgentStatusStrip
            agentState={state.session.agentState}
            agentError={state.session.agentError}
            actor={state.session.agentActor}
            isCreator={isCreator}
            onRetry={planning.retry}
            isRetrying={planning.isRetrying}
          />

          {state.session.phase === "requirements" ? (
            <RequirementsPhase
              idea={state.session.idea}
              rounds={state.rounds}
              requirements={state.requirements}
              agentState={state.session.agentState}
              isCreator={isCreator}
              submitAnswers={planning.submitAnswers}
              isSubmittingAnswers={planning.isSubmittingAnswers}
              proceed={planning.proceed}
              isProceeding={planning.isProceeding}
            />
          ) : (
            <ArchitecturePhase
              nodes={state.nodes}
              edges={state.edges}
              decisions={state.decisions}
              clarifications={state.clarifications}
              consistency={state.consistency}
              graphVersion={state.session.graphVersion}
              agentState={state.session.agentState}
              isCreator={isCreator}
              submitEdit={planning.submitEdit}
              isSubmittingEdit={planning.isSubmittingEdit}
              confirm={planning.confirm}
              isConfirming={planning.isConfirming}
              confirmConflict={planning.confirmConflict}
              clearConfirmConflict={planning.clearConfirmConflict}
              markClarificationAnswered={planning.markClarificationAnswered}
            />
          )}
        </>
      )}
    </div>
  );
}
