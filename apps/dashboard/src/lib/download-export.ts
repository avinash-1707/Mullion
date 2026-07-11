import { ApiError } from "./api";

// Deliberately bypasses apiFetch: that helper always parses the body as
// JSON, but this endpoint returns a zip. Same credentials/base-URL contract,
// blob instead of json — the one API call in the app that can't run through
// the shared JSON helper.
export async function downloadSessionExport(sessionId: string): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is not set");
  }

  const response = await fetch(`${baseUrl}/api/sessions/${sessionId}/export`, {
    credentials: "include",
  });

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new ApiError(response.status, body, `Export failed with status ${response.status}`);
  }

  const disposition = response.headers.get("content-disposition") ?? "";
  const filenameMatch = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = filenameMatch?.[1] ?? `mullion-${sessionId}.zip`;

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Deferred: some browsers start the download async — a synchronous revoke
  // can cancel it.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
