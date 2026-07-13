"use client";

import { Select, type SelectOption } from "@/components/ui/select";
import { useUpdateModelMutation } from "@/hooks/use-model-settings";
import { roleLabel, type ModelRoleConfig } from "@/lib/settings-api";
import { formatModelName } from "@/lib/model-display";
import { ProviderIcon } from "./provider-icons";
import { FormNote } from "./form-note";

interface ModelRoleRowProps {
  role: ModelRoleConfig;
  byokEnabled: boolean;
  canManage: boolean;
}

// One row per role (GET /models). Each row owns its own mutation instance,
// so a slow/failed save on one role never blocks or misattributes state to
// another row's select.
//
// No "Platform default" sentinel row: with no override the select simply
// shows the default model as the selected value, and picking the default
// slug is sent as modelSlug: null (clear the override) so "chose the
// default explicitly" and "never overrode" stay the same server-side state.
export function ModelRoleRow({ role, byokEnabled, canManage }: ModelRoleRowProps) {
  const updateModel = useUpdateModelMutation();
  const selectedValue = role.overrideModelSlug ?? role.defaultModelSlug;

  function handleChange(nextValue: string) {
    if (nextValue === selectedValue) return;
    updateModel.mutate({ role: role.role, modelSlug: nextValue === role.defaultModelSlug ? null : nextValue });
  }

  const customPickTitle = !canManage
    ? "Only an organization owner or admin can change models"
    : "Add an API key to pick your own model";
  const canPick = byokEnabled && canManage;
  // Default first, then the allowlist minus the default so the same model
  // never shows up twice. Slug -> human name + brand icon (model-display.ts
  // / provider-icons.tsx) so the dropdown never shows a raw OpenRouter slug.
  const slugs = [role.defaultModelSlug, ...role.allowlist.filter((slug) => slug !== role.defaultModelSlug)];
  const options: SelectOption[] = slugs.map((slug) => ({
    value: slug,
    label: formatModelName(slug),
    icon: <ProviderIcon slug={slug} />,
    // The current selection stays enabled even without BYOK so the trigger
    // renders it normally; committing it is a no-op (see handleChange).
    ...(canPick || slug === selectedValue ? {} : { disabled: true, title: customPickTitle }),
  }));

  return (
    <li className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-muted">{roleLabel(role.role)}</span>
      <div className="sm:w-80">
        <Select
          fieldId={`model-role-${role.role}`}
          aria-label={`Model for the ${roleLabel(role.role)} role`}
          value={selectedValue}
          onChange={handleChange}
          disabled={updateModel.isPending || !canManage}
          options={options}
        />
      </div>
      {updateModel.isError ? <FormNote>{updateModel.error.message}</FormNote> : null}
    </li>
  );
}
