// Canonical fetch helper for the Hono API, so Phase 1's first real query has
// one place to import from instead of every call site hand-rolling baseURL,
// credentials, and error handling. Deliberately returns `unknown` rather than
// a generic `<T>` cast at the boundary — callers parse the body with a Zod
// schema from packages/schemas before trusting its shape (CODING_STANDARDS §1).

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

interface RawResponse {
  status: number;
  body: unknown;
}

async function rawApiFetch(path: string, init?: RequestInit): Promise<RawResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is not set");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  // Some responses (204 No Content, empty error bodies) have nothing to
  // parse — default to null rather than letting a JSON parse error mask
  // the real HTTP status below.
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, body, `Request to ${path} failed with status ${response.status}`);
  }

  return { status: response.status, body };
}

export async function apiFetch(path: string, init?: RequestInit): Promise<unknown> {
  const { body } = await rawApiFetch(path, init);
  return body;
}

// Same request/error handling as apiFetch, but also surfaces the HTTP status
// — needed the one place a 200-vs-201 distinction is meaningful behavior,
// not just plumbing (POST /api/sessions: 201 new vs 200 "here's your existing
// active session instead", ADR-29).
export async function apiFetchWithStatus(path: string, init?: RequestInit): Promise<RawResponse> {
  return rawApiFetch(path, init);
}
