import { readdirSync, readFileSync, writeFileSync } from "node:fs";
const dir = "supabase/migrations";
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const combined = files
  .map((f) => `-- ===== ${f} =====\n` + readFileSync(`${dir}/${f}`, "utf8"))
  .join("\n\n");
writeFileSync("supabase/combined.sql", combined);
console.log(`Wrote supabase/combined.sql (${files.length} migrations)`);
