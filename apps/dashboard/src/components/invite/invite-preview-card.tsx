"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { redirectToSignIn, redirectToSignUp } from "@/lib/auth-redirect";
import { useSignOutMutation } from "@/hooks/use-auth-mutations";
import { useInvitationPreviewQuery, useAcceptInvitationMutation } from "@/hooks/use-invite-accept";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FormNote } from "@/components/settings/form-note";

interface InvitePreviewCardProps {
  invitationId: string;
}

const CARD_CLASS = "w-full rounded-lg border border-hairline px-6 py-10 text-center";

function TerminalCard({ title, message, signedIn }: { title: string; message: string; signedIn: boolean }) {
  return (
    <div className={CARD_CLASS}>
      <h1 className="font-serif text-2xl text-fg">{title}</h1>
      <p className="mt-2 text-sm text-fg-muted">{message}</p>
      <div className="mt-6">
        {signedIn ? (
          <Link href="/" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Go to dashboard
          </Link>
        ) : (
          <Button type="button" variant="secondary" size="sm" onClick={() => redirectToSignIn()}>
            Sign in
          </Button>
        )}
      </div>
    </div>
  );
}

// Owns the whole accept-flow state machine in one place (same "one
// component, several branches" shape as ByokKeyCard) — loading, the four
// terminal preview statuses, signed-out preview+CTA, wrong-account-email,
// and the signed-in accept action. The preview fetch is unauthenticated
// (hooks/use-invite-accept.ts) precisely so the sign-up-vs-sign-in decision
// below can be made before any session exists.
export function InvitePreviewCard({ invitationId }: InvitePreviewCardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const preview = useInvitationPreviewQuery(invitationId);
  const accept = useAcceptInvitationMutation();
  const signOut = useSignOutMutation();

  if (preview.isPending || sessionPending) {
    return (
      <div className={CARD_CLASS}>
        <Skeleton className="mx-auto h-6 w-48" />
        <Skeleton className="mx-auto mt-4 h-4 w-64" />
        <Skeleton className="mx-auto mt-8 h-9 w-40" />
      </div>
    );
  }

  if (preview.error || !preview.data) {
    return (
      <TerminalCard
        title="Invitation not found"
        message="This link doesn't point to a real invitation - check you copied the whole URL."
        signedIn={Boolean(session)}
      />
    );
  }

  const { orgName, inviterName, invitedEmail, status } = preview.data;

  if (status === "expired") {
    return (
      <TerminalCard
        title="This invitation has expired"
        message={`Ask ${inviterName} to send you a new one.`}
        signedIn={Boolean(session)}
      />
    );
  }

  if (status === "revoked") {
    return (
      <TerminalCard
        title="This invitation was revoked"
        message={`${inviterName} canceled this invitation.`}
        signedIn={Boolean(session)}
      />
    );
  }

  if (status === "accepted") {
    return (
      <TerminalCard
        title="Already used"
        message="This invitation has already been accepted."
        signedIn={Boolean(session)}
      />
    );
  }

  // status === "pending" from here down.

  if (!session) {
    return (
      <div className={CARD_CLASS}>
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-gilt">You&rsquo;re invited</p>
        <h1 className="mt-3 font-serif text-2xl text-fg">
          {inviterName} invited you to join {orgName}
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          Continue with <span className="font-mono text-fg">{invitedEmail}</span> to accept.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <Button type="button" size="sm" onClick={() => redirectToSignUp()}>
            Create account to continue
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => redirectToSignIn()}>
            Already have an account? Sign in
          </Button>
        </div>
      </div>
    );
  }

  const wrongAccount = session.user.email.toLowerCase() !== invitedEmail.toLowerCase();

  if (wrongAccount) {
    return (
      <div className={CARD_CLASS}>
        <h1 className="font-serif text-2xl text-fg">Wrong account</h1>
        <p className="mt-2 text-sm text-fg-muted">
          This invitation is for <span className="font-mono text-fg">{invitedEmail}</span>, but you&rsquo;re signed
          in as <span className="font-mono text-fg">{session.user.email}</span>.
        </p>
        <div className="mt-6">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={signOut.isPending}
            onClick={() => signOut.mutate(undefined, { onSuccess: () => redirectToSignIn() })}
          >
            {signOut.isPending ? "Signing out…" : "Sign out and switch accounts"}
          </Button>
        </div>
        {signOut.error ? (
          <div className="mt-4">
            <FormNote>{signOut.error.message}</FormNote>
          </div>
        ) : null}
      </div>
    );
  }

  // acceptInvitation's response shape isn't pinned by the given backend
  // contract (only the preview endpoint's shape is) — read defensively for
  // an organizationId under either a likely key rather than assume one.
  // Flagged in the build report: verify against the live response once the
  // backend lands; a miss here just means one manual switch from the org
  // switcher instead of landing directly in the new org.
  function extractOrganizationId(data: unknown): string | null {
    if (!data || typeof data !== "object") return null;
    const record = data as { organizationId?: unknown; invitation?: { organizationId?: unknown } };
    if (typeof record.organizationId === "string") return record.organizationId;
    if (record.invitation && typeof record.invitation.organizationId === "string") {
      return record.invitation.organizationId;
    }
    return null;
  }

  function handleAccept() {
    accept.mutate(invitationId, {
      onSuccess: async (data) => {
        const organizationId = extractOrganizationId(data);
        if (organizationId) {
          await authClient.organization.setActive({ organizationId });
        }
        await queryClient.invalidateQueries();
        router.push("/");
      },
    });
  }

  return (
    <div className={CARD_CLASS}>
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-gilt">You&rsquo;re invited</p>
      <h1 className="mt-3 font-serif text-2xl text-fg">
        {inviterName} invited you to join {orgName}
      </h1>
      <div className="mt-6 flex flex-col items-center gap-3">
        <Button type="button" size="sm" disabled={accept.isPending} onClick={handleAccept}>
          {accept.isPending ? "Joining…" : `Join ${orgName}`}
        </Button>
        <Link
          href="/"
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-muted transition-swift hover:text-fg focus-visible:text-fg focus-visible:outline-none"
        >
          Not now - go to dashboard
        </Link>
      </div>
      {accept.error ? (
        <div className="mt-4">
          <FormNote>{accept.error.message}</FormNote>
        </div>
      ) : null}
    </div>
  );
}
