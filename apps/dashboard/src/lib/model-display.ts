// Turns an OpenRouter model slug ("anthropic/claude-sonnet-4.5") into the
// human-readable name shown in the model picker ("Claude Sonnet 4.5"). The
// allowlist is server-driven and grows over time (new model versions,
// occasionally a new provider), so this is deliberately NOT a lookup table
// keyed by full slug — that would silently degrade to the raw slug the
// moment the platform allowlists a model this file hasn't seen. Instead it
// is a small set of word-level overrides (acronyms/brand spellings a plain
// title-case would mangle) plus a generic tokenizer, so an unrecognized
// slug still renders as a readable name instead of a slug.

// Tokens whose casing is fixed regardless of position — acronyms and brand
// spellings that naive title-casing gets wrong ("Deepseek" instead of
// "DeepSeek", "Gpt" instead of "GPT").
const WORD_OVERRIDES: Record<string, string> = {
  gpt: "GPT",
  oss: "OSS",
  glm: "GLM",
  llm: "LLM",
  ai: "AI",
  vl: "VL",
  deepseek: "DeepSeek",
  chatgpt: "ChatGPT",
};

// Multi-token family names whose official spelling keeps a hyphen where
// every other word boundary in this formatter gets a space — e.g. OpenAI's
// "gpt-oss" family, not "GPT OSS". Matched as a whole before per-word
// formatting so the hyphen survives.
const HYPHENATED_FAMILIES = ["gpt-oss"];

// One word of a slug's model part -> its display spelling.
function formatWord(word: string): string {
  const lower = word.toLowerCase();
  const override = WORD_OVERRIDES[lower];
  if (override) return override;

  // Bare version number ("4.5", "3.3") — leave as-is, already reads fine.
  if (/^\d/.test(word) && /^[\d.]+$/.test(word)) return word;

  // Parameter count ("70b", "120b") -> ("70B", "120B").
  const paramCount = /^(\d+(?:\.\d+)?)b$/i.exec(word);
  if (paramCount) return `${paramCount[1]}B`;

  // Version tag ("v3.1") — keep the lowercase "v" convention, just
  // normalize casing of whatever follows it.
  if (/^v\d/i.test(word)) return `v${word.slice(1)}`;

  return word.charAt(0).toUpperCase() + word.slice(1);
}

function formatModelPart(modelPart: string): string {
  for (const family of HYPHENATED_FAMILIES) {
    if (modelPart === family || modelPart.startsWith(`${family}-`)) {
      const rest = modelPart.slice(family.length).replace(/^-/, "");
      const familyLabel = family.split("-").map(formatWord).join("-");
      return rest ? `${familyLabel} ${formatModelPart(rest)}` : familyLabel;
    }
  }
  return modelPart.split("-").map(formatWord).join(" ");
}

// Provider prefix is intentionally dropped, not prepended — "meta-llama/
// llama-3.3-70b-instruct" should read "Llama 3.3 70B Instruct", not "Meta
// Llama...". The provider icon (provider-icons.tsx) carries the branding
// instead, keyed off this same prefix.
export function formatModelName(slug: string): string {
  const slashIndex = slug.indexOf("/");
  const modelPart = slashIndex === -1 ? slug : slug.slice(slashIndex + 1);
  if (!modelPart) return slug;
  return formatModelPart(modelPart);
}
