// Dry run: clean + chunk the docs without any API key. Usage: npx tsx scripts/check-mdx.ts <docsContentDir>
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { chunkPage, toPage } from "../lib/docs-chat/mdx";
import { listMdx } from "./docs-source";

const root = process.argv[2];
const files = listMdx(root);
const all = files.flatMap((f) => chunkPage(toPage(relative(root, f), readFileSync(f, "utf8"))));
const sizes = all.map((c) => c.content.length).sort((a, b) => a - b);
console.log({ files: files.length, chunks: all.length, medianChars: sizes[Math.floor(sizes.length / 2)], maxChars: sizes.at(-1), estTokens: Math.round(sizes.reduce((a, b) => a + b, 0) / 4) });
const sample = all[Number(process.argv[3] ?? 0) % all.length];
console.log(sample.url, "\n---\n", sample.content.slice(0, 1500));
