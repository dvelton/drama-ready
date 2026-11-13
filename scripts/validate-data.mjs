import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dramaFor, episodeFormat } from "../site/lib/dramas.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(await fs.readFile(path.join(ROOT, "site/data/finales.json"), "utf8"));
const errors = [];
const fail = (condition, message) => { if (!condition) errors.push(message); };
fail(data.schemaVersion === 3, "schemaVersion must be 3");
fail(Number.isFinite(Date.parse(data.generatedAt)), "generatedAt must be a date");
fail(Array.isArray(data.finales) && Array.isArray(data.upcoming), "Both finale lists must be arrays");
fail(data.count === data.finales?.length, "Ready count must match finales");
fail(data.upcomingCount === data.upcoming?.length, "Upcoming count must match upcoming");
const ids = new Set();
for (const key of ["finales", "upcoming"]) {
  let previousDate = key === "finales" ? "9999-12-31" : "0000-01-01";
  for (const item of data[key] ?? []) {
    const label = `${key}: ${item.id}`;
    fail(Boolean(item.id && item.showName && item.finaleDate && item.readyAt && item.sourceUrl), `${label}: missing required field`);
    fail(Number.isFinite(Date.parse(item.readyAt)), `${label}: invalid readiness date`);
    fail(item.type === "Scripted" && Boolean(dramaFor(item)), `${label}: out-of-scope show`);
    fail(item.drama === dramaFor(item)?.id, `${label}: wrong drama category`);
    fail(item.format === episodeFormat(item.runtime), `${label}: wrong episode format`);
    fail(!("major" in item) && !("prominenceReason" in item), `${label}: obsolete popularity filter`);
    fail(Array.isArray(item.aliases) && item.aliases.every((alias) => typeof alias === "string"), `${label}: invalid aliases`);
    fail(Array.isArray(item.genres), `${label}: invalid genres`);
    fail(Number.isInteger(item.episodeCount) && item.episodeCount > 0 && item.episodeCount === item.finaleEpisode, `${label}: invalid episode order`);
    fail(item.confirmation === "episode-order", `${label}: unconfirmed ending`);
    fail(!ids.has(item.id), `${label}: duplicate id`);
    ids.add(item.id);
    fail(key === "finales"
      ? Date.parse(item.readyAt) <= Date.parse(data.generatedAt)
      : Date.parse(item.readyAt) > Date.parse(data.generatedAt), `${label}: wrong readiness list`);
    fail(key === "finales" ? item.finaleDate <= previousDate : item.finaleDate >= previousDate, `${label}: wrong chronological order`);
    previousDate = item.finaleDate;
    try {
      const source = new URL(item.sourceUrl);
      fail(source.protocol === "https:" && source.hostname === "www.tvmaze.com", `${label}: invalid source URL`);
    } catch { errors.push(`${label}: invalid source URL`); }
  }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Validated ${data.count} complete and ${data.upcomingCount} upcoming drama seasons.`);
}
