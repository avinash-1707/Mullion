import type { BuildTask } from "@mullion/schemas";
import type { LayoutLink } from "./graph-layout";
import { shortId } from "./build-format";

// Pure task -> graph mapping (build-agent-graph.tsx's counterpart to
// architecture-diagram.tsx's buildSynthesizedLinks), kept separate from the
// render layer so "does this produce the right nodes/edges for a given task
// list" is checkable without mounting React Flow (CODING_STANDARDS §6).

// dependsOn holds specTaskId strings, but a task can arrive with no
// specTaskId (ad-hoc, e.g. a fix-cycle task) — fall back to its row id, the
// same fallback build-task-row.tsx uses for its chip, so the list and graph
// panes key the same task identically.
export function buildTaskNodeKey(task: BuildTask): string {
  return task.specTaskId ?? task.id;
}

export function buildTaskDisplayId(task: BuildTask): string {
  return task.specTaskId ?? shortId(task.id);
}

// dependsOn references a dependency by specTaskId, which only resolves for a
// task that's actually in this run's list and has one — layoutGraph already
// drops an edge to a node it's never seen, but build the edge list itself
// defensively so a dangling dependsOn entry never produces an edge with an
// undefined source.
export function buildTaskDependencyLinks(tasks: BuildTask[]): LayoutLink[] {
  const keyBySpecTaskId = new Map<string, string>();
  for (const task of tasks) {
    if (task.specTaskId !== null) keyBySpecTaskId.set(task.specTaskId, buildTaskNodeKey(task));
  }

  const links: LayoutLink[] = [];
  // dependsOn has no uniqueness guarantee — dedupe so a repeated entry can't
  // produce two edges with the same React Flow id.
  const seen = new Set<string>();
  for (const task of tasks) {
    const targetKey = buildTaskNodeKey(task);
    for (const dep of task.dependsOn) {
      const sourceKey = keyBySpecTaskId.get(dep);
      if (sourceKey === undefined) continue;
      const pair = `${sourceKey}->${targetKey}`;
      if (seen.has(pair)) continue;
      seen.add(pair);
      links.push({ sourceKey, targetKey });
    }
  }
  return links;
}
