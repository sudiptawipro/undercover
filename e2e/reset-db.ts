// Deletes the end-to-end tests' database, so the backend seeds a fresh one.
import { rmSync } from "node:fs";

const db = process.env.UNDERCOVER_DB;
if (!db) throw new Error("UNDERCOVER_DB is not set");
rmSync(db, { force: true });
