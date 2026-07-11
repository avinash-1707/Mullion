import JSZip from "jszip";
import type { ArtifactStore } from "@mullion/artifacts";
import { deliverySummaryFile, type DeliveryRequest, type DeliveryResult, type DeliveryTarget } from "./port.js";

/**
 * Archive delivery (ADR-54): zip the produced tree with jszip (already a
 * dep, reused from Fork A export — ADR-42) and store it. In-memory is fine
 * for source-scale output. Always available (no external creds).
 */
export class ArchiveDeliveryTarget implements DeliveryTarget {
  readonly kind = "archive" as const;

  constructor(
    private readonly store: ArtifactStore,
    /** Where the zip goes — a separate "deliveries" run namespace in the store. */
    private readonly sink: (runId: string, zipName: string, zip: Buffer) => Promise<string>,
  ) {}

  async available(): Promise<boolean> {
    return true;
  }

  async deliver(req: DeliveryRequest): Promise<DeliveryResult> {
    const zip = new JSZip();
    for (const file of [...req.repo, deliverySummaryFile(req)]) {
      zip.file(file.path, file.content);
    }
    const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const ref = await this.sink(req.runId, `${req.repoName}.zip`, buffer);
    return { kind: "archive", ref };
  }
}
