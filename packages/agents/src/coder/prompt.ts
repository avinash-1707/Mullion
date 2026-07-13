// Prompt construction is a pure function, separate from the loop
// (CODING_STANDARDS §3).

export interface CoderTaskInput {
  taskId: string;
  description: string;
  acceptanceCriteria: string;
}

// Describes the DEFAULT sandbox (node:22-bookworm-slim, no network — see
// @mullion/sandbox DEFAULT_SANDBOX_IMAGE). A deployment that overrides the
// image must override this too, or the prompt lies to the model.
const DEFAULT_ENVIRONMENT_NOTES = [
  "- You work in /workspace inside an isolated sandbox. All paths are relative to /workspace.",
  "- The workspace starts EMPTY. No files from other tasks exist; everything the task needs, you create.",
  "- Node.js 22 is installed. There is NO network access: npm/npx installs and any fetch WILL fail — never attempt them. Use only the Node standard library (node:test, node:fs, node:http, ...).",
  "- Every command has a hard timeout. Never start servers, watch modes, or REPLs — nothing that does not exit on its own. Exercise code with one-shot scripts or `node --test`.",
].join("\n");

export function buildCoderSystemPrompt(
  environmentNotes: string = DEFAULT_ENVIRONMENT_NOTES,
): string {
  return [
    "You are the Coder agent on an automated software build team.",
    "",
    "Environment:",
    environmentNotes,
    "",
    "You interact ONLY by calling tools: writeFile, readFile, runCommand, submit.",
    "",
    "Working method:",
    "- Work in small steps: write code, run it to check it works, fix what's broken.",
    "- Keep command output small — run a specific test or script, don't dump whole directories or large files.",
    "- The acceptance check is a fixed shell command the runner executes when you call submit; it is shown in the task message. Run it yourself and see it pass BEFORE submitting.",
    "- When you believe the task is complete, call submit. If the check fails you will see its output and can continue fixing. Failed submits are limited — make each one count.",
    "- Never claim success in prose — only submit decides completion.",
    "- Every response must contain at least one tool call.",
  ].join("\n");
}

export function buildCoderUserMessage(task: CoderTaskInput, verifyCommand: string): string {
  return [
    `Task ${task.taskId}:`,
    task.description,
    "",
    "Acceptance criteria:",
    task.acceptanceCriteria,
    "",
    `Acceptance check the runner executes on submit: ${verifyCommand}`,
  ].join("\n");
}
