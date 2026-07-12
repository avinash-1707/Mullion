"use client";

import { useByokQuery } from "@/hooks/use-byok-mutations";
import { useModelsQuery } from "@/hooks/use-model-settings";
import { Skeleton } from "@/components/ui/skeleton";
import { ByokKeyCard } from "./byok-key-card";
import { ModelRoleRow } from "./model-role-row";
import { FormNote } from "./form-note";

export function ModelsSection() {
  const byok = useByokQuery();
  const models = useModelsQuery();
  const modelsData = models.data;

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="font-serif text-2xl leading-snug tracking-tight text-fg">Models</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Bring your own OpenRouter key to pick the model each role runs on. Without one, every role runs on the
          platform default.
        </p>
      </div>

      {byok.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : byok.data ? (
        <ByokKeyCard status={byok.data} />
      ) : byok.error ? (
        <FormNote>{byok.error.message}</FormNote>
      ) : null}

      <div className="border-t border-hairline pt-6">
        {models.isPending ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : modelsData ? (
          <ul className="flex flex-col divide-y divide-border">
            {modelsData.roles.map((role) => (
              <ModelRoleRow key={role.role} role={role} byokEnabled={modelsData.byokEnabled} />
            ))}
          </ul>
        ) : models.error ? (
          <FormNote>{models.error.message}</FormNote>
        ) : null}
      </div>
    </section>
  );
}
