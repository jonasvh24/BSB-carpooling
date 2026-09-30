// Keeps the code evidence in docs/legal honest.
//
// Evidence is written as  `path:line` ⟨needle⟩  where the needle is a literal
// piece of the line it points at. Line numbers drift as code changes; needles
// rarely do. This script re-finds each needle:
//
//   node scripts/legal-refs.mjs          check: exit 1 if a needle is gone or a line is stale
//   node scripts/legal-refs.mjs --fix    rewrite stale line numbers in place
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

export const REF = /`([^`\s:]+):(\d+)` ⟨([^⟩]+)⟩/g;

export function scan(dir = "docs/legal", fix = false) {
  const problems = [];
  let refs = 0;
  let fixed = 0;
  const cache = new Map();
  const linesOf = (file) => {
    if (!cache.has(file)) cache.set(file, existsSync(file) ? readFileSync(file, "utf8").split("\n") : null);
    return cache.get(file);
  };
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const docPath = path.join(dir, name);
    const text = readFileSync(docPath, "utf8");
    const out = text.replace(REF, (whole, file, line, needle) => {
      refs++;
      const lines = linesOf(file);
      if (!lines) {
        problems.push(`${name}: ${file} does not exist`);
        return whole;
      }
      const at = lines.findIndex((l) => l.includes(needle)) + 1;
      if (at === 0) {
        problems.push(`${name}: needle not found in ${file}: ${needle}`);
        return whole;
      }
      if (at !== Number(line)) {
        if (!fix) problems.push(`${name}: ${file}:${line} is stale, needle is on line ${at}`);
        fixed++;
        return `\`${file}:${at}\` ⟨${needle}⟩`;
      }
      return whole;
    });
    if (fix && out !== text) writeFileSync(docPath, out);
  }
  return { refs, fixed, problems };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve("scripts/legal-refs.mjs")) {
  const fix = process.argv.includes("--fix");
  const r = scan("docs/legal", fix);
  for (const p of r.problems) console.error(p);
  console.log(`${r.refs} references, ${fix ? `${r.fixed} line numbers updated` : `${r.problems.length} problems`}`);
  if (r.problems.length) process.exit(1);
}
