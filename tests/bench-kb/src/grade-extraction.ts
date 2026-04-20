// Produce a diff-style comparison of extraction outputs. Not auto-scored here — I (Claude) will
// read the JSON sample file I dump and score manually.
import * as fs from "node:fs";
import * as path from "node:path";
import { readJson, writeJson } from "./lib";

function head(text: string, n: number): string {
  return text.split("\n").slice(0, n).join("\n");
}

const DOCS = ["attention", "apple10k"];
const OUT: any = { docs: {} };

for (const doc of DOCS) {
  const dir = `./results/extraction/${doc}`;
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".json") && !f.endsWith(".err.json"));
  const docOut: any = {};
  for (const f of files) {
    const data = readJson<any>(path.join(dir, f));
    docOut[f.replace(".json", "")] = {
      chars: (data.text || "").length,
      ms: data.ms,
      tokens_in: data.usage?.prompt_tokens,
      tokens_out: data.usage?.completion_tokens,
      first_300: (data.text || "").slice(0, 300),
      has_tables: /\|.*\|.*\|/.test(data.text || ""),
      heading_count: ((data.text || "").match(/^#+\s/gm) || []).length,
      bullet_count: ((data.text || "").match(/^[-*]\s/gm) || []).length,
      equation_markers: ((data.text || "").match(/\$[^$]+\$|\\[a-zA-Z]+\{|\^|_\{/g) || []).length,
    };
  }
  OUT.docs[doc] = docOut;
}

writeJson("./results/extraction/graded.json", OUT);
console.log(JSON.stringify(OUT, null, 2).slice(0, 3000));
