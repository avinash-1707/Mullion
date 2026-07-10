import {
  readFileArgsSchema,
  runCommandArgsSchema,
  submitArgsSchema,
  writeFileArgsSchema,
  type CoderToolName,
} from "@mullion/schemas";
import type { ToolDefinition } from "@mullion/llm";
import { z } from "zod";

/**
 * The Coder's fixed toolset (ADR-45): three sandbox primitives plus a
 * terminal `submit`. `submit` deliberately takes no arguments — the runner
 * owns the verify command, so the model requests verification but can
 * never define what "passing" means (ADR-46).
 */
export const CODER_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "writeFile",
      description:
        "Create or overwrite a file in the workspace. Paths are relative to the workspace root.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Workspace-relative file path" },
          content: { type: "string", description: "Full file content" },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "readFile",
      description: "Read a file from the workspace.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Workspace-relative file path" },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "runCommand",
      description:
        "Run a shell command in the workspace. Returns stdout, stderr and the exit code. The sandbox has no network access.",
      parameters: {
        type: "object",
        properties: {
          cmd: { type: "string", description: "Shell command to execute" },
        },
        required: ["cmd"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "submit",
      description:
        "Declare the task complete. The runner will execute the acceptance check; if it fails you will see its output and can keep working.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
];

const argSchemas: Record<CoderToolName, z.ZodType> = {
  writeFile: writeFileArgsSchema,
  readFile: readFileArgsSchema,
  runCommand: runCommandArgsSchema,
  submit: submitArgsSchema,
};

export type ParsedToolCall =
  | { ok: true; name: CoderToolName; args: unknown }
  | { ok: false; error: string };

/** Parse-don't-trust for LLM-emitted tool calls: JSON.parse + zod, never raw. */
export function parseToolCall(name: string, argumentsJson: string): ParsedToolCall {
  if (!(name in argSchemas)) {
    return { ok: false, error: `unknown tool "${name}" — available: writeFile, readFile, runCommand, submit` };
  }
  let raw: unknown;
  try {
    raw = argumentsJson.trim() === "" ? {} : JSON.parse(argumentsJson);
  } catch {
    return { ok: false, error: `arguments for "${name}" are not valid JSON` };
  }
  const parsed = argSchemas[name as CoderToolName].safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return { ok: false, error: `invalid arguments for "${name}": ${issues}` };
  }
  return { ok: true, name: name as CoderToolName, args: parsed.data };
}
