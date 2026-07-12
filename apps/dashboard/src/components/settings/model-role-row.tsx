"use client";

import type { ChangeEvent } from "react";
import { Select, type SelectOption } from "@/components/ui/select";
import { useUpdateModelMutation } from "@/hooks/use-model-settings";
import { roleLabel, type ModelRoleConfig } from "@/lib/settings-api";
import { FormNote } from "./form-note";

interface ModelRoleRowProps {
  role: ModelRoleConfig;
  byokEnabled: boolean;
  canManage: boolean;
}

// Sentinel <option> value for "no override" — distinct from any real model
// slug so the platform-default row is unambiguous even if a slug were ever
// spelled the same as this string.
const PLATFORM_DEFAULT_VALUE = "__platform_default__";

// One row per role (GET /models). Each row owns its own mutation instance,
// so a slow/failed save on one role never blocks or misattributes state to
// another row's select.
export function ModelRoleRow({ role, byokEnabled, canManage }: ModelRoleRowProps) {
  const updateModel = useUpdateModelMutation();
  const selectedValue = role.overrideModelSlug ?? PLATFORM_DEFAULT_VALUE;

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;
    updateModel.mutate({ role: role.role, modelSlug: value === PLATFORM_DEFAULT_VALUE ? null : value });
  }

  const customPickTitle = !canManage
    ? "Only an organization owner or admin can change models"
    : "Add an API key to pick your own model";
  const options: SelectOption[] = [
    { value: PLATFORM_DEFAULT_VALUE, label: `Platform default (${role.defaultModelSlug})` },
    ...role.allowlist.map((slug) =>
      byokEnabled && canManage
        ? { value: slug, label: slug }
        : { value: slug, label: slug, disabled: true, title: customPickTitle },
    ),
  ];

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
