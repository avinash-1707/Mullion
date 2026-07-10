import { describe, expect, it, vi } from "vitest";
import type Docker from "dockerode";
import { reapContainersForRun } from "./docker-sandbox.js";

// The reaper's whole job is removing leftover containers after a crash
// (ADR-46). Exercised with a fake dockerode — no daemon needed.

describe("reapContainersForRun", () => {
  it("force-removes each labeled container and returns the count", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const getContainer = vi.fn().mockReturnValue({ remove });
    const fake = {
      listContainers: vi.fn().mockResolvedValue([{ Id: "a" }, { Id: "b" }]),
      getContainer,
    } as unknown as Docker;

    expect(await reapContainersForRun("run-1", fake)).toBe(2);
    expect(fake.listContainers).toHaveBeenCalledWith({
      all: true,
      filters: { label: ["mullion.run_id=run-1"] },
    });
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledWith({ force: true });
  });

  it("returns 0 and swallows when the daemon is down", async () => {
    const fake = {
      listContainers: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    } as unknown as Docker;
    expect(await reapContainersForRun("run-1", fake)).toBe(0);
  });

  it("counts only containers that were actually removed", async () => {
    const getContainer = vi.fn().mockImplementation((id: string) => ({
      remove:
        id === "gone"
          ? vi.fn().mockRejectedValue(Object.assign(new Error("no such container"), { statusCode: 404 }))
          : vi.fn().mockResolvedValue(undefined),
    }));
    const fake = {
      listContainers: vi.fn().mockResolvedValue([{ Id: "live" }, { Id: "gone" }]),
      getContainer,
    } as unknown as Docker;
    expect(await reapContainersForRun("run-1", fake)).toBe(1);
  });
});
