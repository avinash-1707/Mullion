import type { BuildTask } from "@mullion/schemas";
import { BuildTaskRow } from "./build-task-row";

interface BuildTaskListProps {
  tasks: BuildTask[];
}

// One row per task (02 §7.1) — sorted by creation order rather than trusting
// array order from the API, since the SSE-triggered refetch (use-build-run)
// re-requests the whole list on every "task" event.
export function BuildTaskList({ tasks }: BuildTaskListProps) {
  const sorted = [...tasks].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const bySpecTaskId = new Map<string, BuildTask>();
  for (const task of tasks) {
    if (task.specTaskId !== null) bySpecTaskId.set(task.specTaskId, task);
  }

  function dependencyStatus(specTaskId: string): BuildTask["status"] | null {
    return bySpecTaskId.get(specTaskId)?.status ?? null;
  }

  return (
    <div className="flex h-full min-h-0 flex-col border border-border bg-bg">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-muted">Tasks</h2>
        <p className="mt-0.5 text-xs text-fg-faint">
          {sorted.length} task{sorted.length === 1 ? "" : "s"} from the frozen task graph
        </p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col divide-y divide-hairline overflow-y-auto">
        {sorted.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-fg-faint">Tasks will appear here once the run starts dispatching.</p>
        ) : (
          sorted.map((task) => <BuildTaskRow key={task.id} task={task} dependencyStatus={dependencyStatus} />)
        )}
      </div>
    </div>
  );
}
