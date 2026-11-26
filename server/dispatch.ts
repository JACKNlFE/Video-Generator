import { mediaWorkerSignature } from "./webhooks";
import type { JobRecord } from "./persist.d.mts";
import type { AppConfig } from "./config";

export async function dispatchToMediaWorker(job: JobRecord, config: AppConfig, fetchImpl: typeof fetch = fetch): Promise<{ dispatched: boolean; reason?: string }> {
  if (!config.mediaWorkerUrl || !config.mediaWorkerSecret) {
    return { dispatched: false, reason: "The media worker URL and secret are not both configured." };
  }
  const root = config.mediaWorkerUrl.endsWith("/") ? config.mediaWorkerUrl : `${config.mediaWorkerUrl}/`;
  const body = Buffer.from(JSON.stringify({ jobId: job.id, kind: job.kind, payload: job.payload }));
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = mediaWorkerSignature(config.mediaWorkerSecret, timestamp, body);
  const response = await fetchImpl(new URL("jobs", root), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-media-worker-timestamp": timestamp,
      "x-media-worker-signature": signature,
      "x-media-worker-delivery-id": job.id,
    },
    body,
    redirect: "manual",
  });
  if (response.status < 200 || response.status >= 300) {
    return { dispatched: false, reason: `The media worker returned HTTP ${response.status}.` };
  }
  return { dispatched: true };
}
