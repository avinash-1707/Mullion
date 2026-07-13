"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Avatar } from "@/components/ui/avatar";
import { CameraIcon } from "@/components/planning/icons";
import { useUploadAvatarMutation, useRemoveAvatarMutation } from "@/hooks/use-account-mutations";
import { AvatarUploadModal } from "./avatar-upload-modal";

interface AvatarUploadProps {
  name: string;
  email: string;
  /** Mirrors Avatar's contract — session values arrive as string | null | undefined. */
  image?: string | null | undefined;
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

// Self-contained avatar block: composes the read-only <Avatar>, owns the
// hover-to-open affordance, the corner tap affordance for touch, and the
// upload/remove modal — profile-section.tsx just drops this in and renders
// the same instance in both view and edit mode (the avatar itself is never
// locked to name-edit state, per design spec). Clicking the avatar no
// longer opens the file picker directly: it opens AvatarUploadModal, which
// offers "Upload new photo" (the file picker, via the same hidden input)
// and — only once an image exists — "Remove photo". Errors (validation and
// mutation) render inside the modal only; there's no standalone FormNote
// fallback for when it's closed, so there's exactly one place an avatar
// error can ever be seen, never two possibly-stale copies.
export function AvatarUpload({ name, email, image }: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const uploadAvatar = useUploadAvatarMutation();
  const removeAvatar = useRemoveAvatarMutation();

  const hasImage = Boolean(image && image.trim().length > 0);
  const uploading = uploadAvatar.isPending;
  const busy = uploading || removeAvatar.isPending;

  // Precedence: a fresh client-side validation issue is the most relevant
  // thing to show; otherwise surface whichever mutation last failed.
  const errorMessage = validationError ?? uploadAvatar.error?.message ?? removeAvatar.error?.message ?? null;

  // Closing (success, backdrop, Escape, or the panel's own Close button)
  // always clears every error path too — reopening starts clean, and a
  // just-succeeded mutation has nothing left to show anyway.
  function closeModal() {
    setValidationError(null);
    uploadAvatar.reset();
    removeAvatar.reset();
    setModalOpen(false);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset immediately so choosing the same file twice in a row still fires
    // a change event the second time.
    event.target.value = "";
    if (!file) return;

    // Starting a new action clears every stale error path — a leftover
    // "Couldn't remove" note must not outlive a fresh upload (and vice versa).
    setValidationError(null);
    removeAvatar.reset();

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setValidationError("Use a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setValidationError("Image must be 5MB or smaller.");
      return;
    }

    uploadAvatar.mutate(file, { onSuccess: closeModal });
  }

  function handleRemove() {
    setValidationError(null);
    uploadAvatar.reset();
    removeAvatar.mutate(undefined, { onSuccess: closeModal });
  }

  return (
    <>
      <div className="group relative h-20 w-20 shrink-0">
        <Avatar name={name} email={email} image={image} className="h-20 w-20" />

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          disabled={busy}
          onChange={handleFileChange}
        />

        <button
          type="button"
          aria-label="Change avatar"
          disabled={busy}
          onClick={() => setModalOpen(true)}
          className={`transition-swift absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full focus-visible:outline-none disabled:cursor-not-allowed ${
            uploading
              ? "pointer-events-none bg-bg/80 opacity-100"
              : "bg-bg/70 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          }`}
        >
          {uploading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-fg-faint border-t-ember" />
              <span className="sr-only">Uploading…</span>
            </>
          ) : (
            <>
              <CameraIcon className="h-4 w-4 text-fg" />
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-fg">Change</span>
            </>
          )}
        </button>

        {/* Always-visible corner badge — a touch affordance, since the hover
            overlay above never triggers on a device with no hover. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-border-strong bg-elevated"
        >
          <CameraIcon className="h-2.5 w-2.5 text-fg-muted" />
        </span>
      </div>

      <AvatarUploadModal
        open={modalOpen}
        pending={busy}
        uploading={uploading}
        removing={removeAvatar.isPending}
        hasImage={hasImage}
        errorMessage={errorMessage}
        onCancel={closeModal}
        onUploadClick={() => inputRef.current?.click()}
        onRemove={handleRemove}
        name={name}
        email={email}
        image={image}
      />
    </>
  );
}
