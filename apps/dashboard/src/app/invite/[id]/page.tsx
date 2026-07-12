"use client";

import { useParams } from "next/navigation";
import { InvitePreviewCard } from "@/components/invite/invite-preview-card";

// Client component reading the dynamic segment via useParams (same pattern
// as app/builds/[id]/page.tsx) rather than an async `params` prop — this
// route needs to render for a signed-out visitor, so it deliberately
// doesn't use the generic redirectToSignIn() wall every other dashboard
// route uses: it shows who invited you before sending you to auth.
export default function InviteAcceptPage() {
  const params = useParams<{ id: string }>();
  const invitationId = params.id;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-6 py-20">
      <InvitePreviewCard invitationId={invitationId} />
    </div>
  );
}
