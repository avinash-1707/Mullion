"use client";

import { useByokQuery } from "@/hooks/use-byok-mutations";
import { useModelsQuery } from "@/hooks/use-model-settings";
import { ByokKeyCard } from "./byok-key-card";
import { ModelRoleRow } from "./model-role-row";
import { FormNote } from "./form-note";
import { ModelsTabSkeleton } from "./tab-skeletons";

export function ModelsSection() {
  const byok = useByokQuery();
  const models = useModelsQuery();
  const modelsData = models.data;

  // Whole-tab gate across both queries so the tab paints at once.
  if (byok.isPending || models.isPending) {
    return <ModelsTabSkeleton />;
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="font-serif text-2xl leading-snug tracking-tight text-fg">Models</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Bring your own OpenRouter key to pick the model each role runs on. Without one, every role runs on the
          platform default.
        </p>
      </div>

      {byok.data ? (
        <ByokKeyCard status={byok.data} />
      ) : byok.error ? (
        <FormNote>{byok.error.message}</FormNote>
      ) : null}

      <div className="flex flex-col gap-5 border-t border-hairline pt-6">
        {/* Same left-rule callout recipe as FormNote's error tone, in the
            accent family instead of danger - informational, not a failure. */}
        <p className="rounded-r-md border-l-2 border-accent bg-accent-soft px-3.5 py-2.5 text-sm text-fg">
          Models are picked for you based on your subscription tier. Attach your own OpenRouter key above to choose a
          different model per role.
        </p>
        {modelsData ? (
          <ul className="flex flex-col divide-y divide-border">
            {modelsData.roles.map((role) => (
              <ModelRoleRow
                key={role.role}
                role={role}
                byokEnabled={modelsData.byokEnabled}
                canManage={modelsData.canManage}
              />
            ))}
          </ul>
        ) : models.error ? (
          <FormNote>{models.error.message}</FormNote>
        ) : null}
      </div>
    </section>
  );
}
