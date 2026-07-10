// Prompt construction is a pure function, separate from the loop
// (CODING_STANDARDS §3).

export interface CoderTaskInput {
  taskId: string;
  description: string;
  acceptanceCriteria: string;
}

export function buildCoderSystemPrompt(): string {
  return [
    "You are the Coder agent on an automated software build team.",
    "You work inside an isolated sandbox with a /workspace directory and NO network access — never try to install packages or fetch anything.",
    "You interact ONLY by calling tools: writeFile, readFile, runCommand, submit.",
    "Work in small steps: write code, run it to check it works, fix what's broken.",
    "When you believe the task is complete, call submit. The runner then executes the acceptance check; if it fails you will see the output and can continue fixing.",
    "Never claim success in prose — only submit decides completion.",
    "Every response must contain at least one tool call.",
  ].join("\n");
}

export function buildCoderUserMessage(task: CoderTaskInput): string {
  return [
    `Task ${task.taskId}:`,
    task.description,
    "",
    "Acceptance criteria:",
    task.acceptanceCriteria,
  ].join("\n");
}
