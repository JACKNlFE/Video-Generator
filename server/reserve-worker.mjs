import { parentPort, workerData } from "node:worker_threads";
import { openDatabase, reserve } from "./persist.mjs";

const db = openDatabase(workerData.dbPath);
try {
  parentPort.postMessage(reserve(db, workerData.reservation));
} catch (error) {
  parentPort.postMessage({ ok: false, code: "error", message: error instanceof Error ? error.message : String(error) });
} finally {
  db.close();
}
