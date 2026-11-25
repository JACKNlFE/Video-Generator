import { loadConfig } from "./config";
import { startServer } from "./http";
import { createPlatform } from "./platform";
import { openDatabase } from "./persist.mjs";

const config = loadConfig(process.env);
const db = openDatabase(config.jobsDbPath);
const platform = createPlatform(config, db);
const handle = await startServer(platform);
console.log(`api listening on http://${config.host}:${handle.port}`);
