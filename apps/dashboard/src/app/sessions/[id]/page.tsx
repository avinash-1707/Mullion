"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { redirectToSignIn } from "@/lib/auth-redirect";
import { usePlanningSession } from "@/hooks/use-planning-session";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { RequirementsPhase } from "@/components/planning/requirements-phase";
import { ArchitecturePhase } from "@/components/planning/architecture-phase";
import { ConfirmedView } from "@/components/planning/confirmed-view";
import { ViewOnlyBanner } from "@/components/planning/view-only-banner";
import { AgentStatusStrip } from "@/components/planning/agent-status-strip";
import { SessionErrorState } from "@/components/planning/session-error-state";
import { SessionHeader } from "@/components/planning/session-header";
import { ArchitecturePhaseSkeleton, RequirementsPhaseSkeleton } from "@/components/planning/session-skeletons";

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

  // Ideas are free text and can run long — clamp so the tab stays readable.
  // Stays on the segment's "Planning session" title until the snapshot lands.
  const idea = planning.state?.session.idea ?? null;
  useDocumentTitle(idea ? (idea.length > 60 ? `${idea.slice(0, 59).trimEnd()}…` : idea) : null);

  // A 401 on the page's snapshot fetch (initial load or reload) funnels
  // through the same sign-in redirect as the initial gate. Mid-session
  // expiry on the SSE stream alone isn't detected until the next fetch.
  useEffect(() => {
    if (planning.unauthorized) redirectToSignIn();
  }, [planning.unauthorized]);

  // Same phase-hinted skeleton for every pre-content wait (auth, snapshot
  // fetch, unauthorized-while-redirecting) — a different placeholder per
  // wait reads as a flash of the wrong page.
  const phaseSkeleton =
    phaseHint === "architecture" ? <ArchitecturePhaseSkeleton /> : <RequirementsPhaseSkeleton />;

  if (authPending || !authSession) {
    return phaseSkeleton;
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
    return phaseSkeleton;
  }

  if (planning.loadError) {
    return <SessionErrorState title="Couldn't load this session" message={planning.loadError} />;
  }

  if (planning.isLoading || !planning.state) {
    return phaseSkeleton;
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
      <SessionHeader idea={state.session.idea} phase={state.session.phase} isConfirmed={isConfirmed} />

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
          userName={state.session.userName}
          userImage={state.session.userImage}
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
              userName={state.session.userName}
              userImage={state.session.userImage}
              clarifications={state.clarifications}
              consistency={state.consistency}
              graphVersion={state.session.graphVersion}
              agentState={state.session.agentState}
              agentActor={state.session.agentActor}
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
