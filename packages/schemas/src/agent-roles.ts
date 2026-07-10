import { z } from "zod";

// ADR-14 roster. Every LLM call site names one of these — never a model slug.
export const agentRoleSchema = z.enum([
  "analyst",
  "planner",
  "coder",
  "tester",
  "reviewer",
  "devops",
]);

export type AgentRole = z.infer<typeof agentRoleSchema>;
