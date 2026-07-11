"use client";

import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { useUpdateProfileMutation } from "@/hooks/use-account-mutations";
import { TextField } from "@/components/ui/text-field";
import { Button } from "@/components/ui/button";
import { FormNote } from "./form-note";

function initial(name: string, email: string): string {
  const source = name.trim() || email;
  return source.slice(0, 1).toUpperCase() || "?";
}

export function ProfileSection() {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const [name, setName] = useState(user?.name ?? "");
  const [image, setImage] = useState(user?.image ?? "");
  const updateProfile = useUpdateProfileMutation();

  const trimmedImage = image.trim();
  const imageLooksValid = trimmedImage.length === 0 || /^https:\/\//i.test(trimmedImage);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!imageLooksValid || updateProfile.isPending) return;
    updateProfile.mutate({ name, image: trimmedImage });
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="font-serif text-2xl leading-snug tracking-tight text-fg">Profile</h2>
        <p className="mt-1 text-sm text-fg-muted">Your name and avatar, as the rest of your team sees them.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden border border-border bg-elevated">
            {trimmedImage && imageLooksValid ? (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary user-supplied URL, not a static/optimizable asset
              <img
                src={trimmedImage}
                alt="Avatar preview"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="font-serif text-xl text-fg-muted">{initial(name, user?.email ?? "")}</span>
            )}
          </div>
          <div className="flex-1">
            <TextField
              fieldId="avatar-url"
              label="Avatar URL"
              type="url"
              placeholder="https://…"
              value={image}
              onChange={(event) => setImage(event.target.value)}
              aria-invalid={!imageLooksValid}
            />
            {!imageLooksValid ? <p className="mt-1.5 text-xs text-fg-faint">Must be an https:// URL.</p> : null}
          </div>
        </div>

        <TextField
          fieldId="name"
          label="Name"
          placeholder="Your name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />

        {updateProfile.error ? <FormNote>{updateProfile.error.message}</FormNote> : null}
        {updateProfile.isSuccess ? <FormNote tone="success">Saved.</FormNote> : null}

        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={updateProfile.isPending || !imageLooksValid}>
            {updateProfile.isPending ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </form>
    </section>
  );
}
