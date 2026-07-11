"use client";

import { useListAccountsQuery, useLinkGoogleMutation, useUnlinkAccountMutation } from "@/hooks/use-account-mutations";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FormNote } from "./form-note";
import { GoogleIcon, GithubIcon } from "./icons";

// github-login (sign-in OAuth) and github (delivery/repo-push OAuth) are
// deliberately separate connections server-side (ADR: DevOps packaging
// needs repo scopes a sign-in-only token never has) — shown as distinct
// rows here even though both render as "GitHub" to the user. Only Google
// gets a wired-up "Connect" action per this pass's scope; the two GitHub
// connections are established from their own flows (sign-in, delivery
// setup) rather than from this settings page.
const ROWS = [
  { providerId: "google", label: "Google", icon: GoogleIcon, connectable: true },
  { providerId: "github-login", label: "GitHub (sign-in)", icon: GithubIcon, connectable: false },
  { providerId: "github", label: "GitHub (delivery)", icon: GithubIcon, connectable: false },
] as const;

export function ConnectedAccountsSection() {
  const accounts = useListAccountsQuery();
  const linkGoogle = useLinkGoogleMutation();
  const unlink = useUnlinkAccountMutation();

  const total = accounts.data?.length ?? 0;

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="font-serif text-2xl leading-snug tracking-tight text-fg">Connected accounts</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Sign-in methods linked to your account. You can&apos;t disconnect your only one.
        </p>
      </div>

      {accounts.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {ROWS.map((row) => {
            const account = accounts.data?.find((a) => a.providerId === row.providerId);
            const Icon = row.icon;
            const onlyAuthMethod = total <= 1;

            return (
              <li
                key={row.providerId}
                className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4 text-fg-muted" />
                  <div>
                    <p className="text-sm text-fg">{row.label}</p>
                    <p className="font-mono text-xs text-fg-faint">{account ? "Connected" : "Not connected"}</p>
                  </div>
                </div>

                {account ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={onlyAuthMethod || unlink.isPending || linkGoogle.isPending}
                    title={onlyAuthMethod ? "This is your only sign-in method" : undefined}
                    onClick={() => unlink.mutate(row.providerId)}
                  >
                    {unlink.isPending && unlink.variables === row.providerId ? "Disconnecting…" : "Disconnect"}
                  </Button>
                ) : row.connectable ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={linkGoogle.isPending || unlink.isPending}
                    onClick={() => linkGoogle.mutate(window.location.href)}
                  >
                    {linkGoogle.isPending ? "Redirecting…" : "Connect"}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {linkGoogle.error ? <FormNote>{linkGoogle.error.message}</FormNote> : null}
      {unlink.error ? <FormNote>{unlink.error.message}</FormNote> : null}
    </section>
  );
}
