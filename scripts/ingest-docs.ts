// Index the Supabase Auth + Database guides into doc_chunks.
// Usage: npm run ingest            (clones/pulls the docs into .cache/)
//        npm run ingest -- --dir <path-to-apps/docs/content>
// Incremental: pages whose content did not change are skipped, removed pages are deleted.
import "./load-env";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { embedMany } from "ai";
import { embeddingModel } from "../lib/ai";
import { chunkPage, toPage, type Chunk } from "../lib/docs-chat/mdx";
import { costUsd } from "../lib/pricing";
import { db } from "../lib/supabase";
import { ensureDocsCheckout, listMdx } from "./docs-source";

const BATCH = 100;
const MIN_EXPECTED_PAGES = 100; // fail loudly if the docs layout changed upstream

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// What gets embedded: the breadcrumb gives short code-only chunks their context.
export function embeddingText(c: Chunk): string {
  return `${[c.title, c.heading].filter(Boolean).join(" > ")}\n\n${c.content}`;
}

async function existingHashes(): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from("doc_chunks").select("path, page_hash").eq("chunk_index", 0).range(from, from + 999);
    if (error) throw new Error(error.message);
    data.forEach((r) => hashes.set(r.path, r.page_hash));
    if (data.length < 1000) return hashes;
  }
}

async function main() {
  const contentDir = arg("dir") ? resolve(arg("dir")!) : ensureDocsCheckout(resolve(".cache"));
  const files = listMdx(contentDir);
  if (files.length < MIN_EXPECTED_PAGES) {
    throw new Error(`Only ${files.length} pages found in ${contentDir}. Did the docs layout change?`);
  }

  const pages = files.map((f) => {
    const page = toPage(relative(contentDir, f), readFileSync(f, "utf8"));
    return { page, hash: createHash("sha256").update(page.body).digest("hex") };
  });
  const before = await existingHashes();
  const changed = pages.filter(({ page, hash }) => before.get(page.path) !== hash);
  const removed = [...before.keys()].filter((p) => !pages.some(({ page }) => page.path === p));
  console.log(`${pages.length} pages, ${changed.length} new or changed, ${removed.length} removed`);

  const { modelId, model } = embeddingModel();
  let tokens = 0;
  let chunkCount = 0;

  for (const { page, hash } of changed) {
    const chunks = chunkPage(page);
    const embeddings: number[][] = [];
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH);
      const res = await embedMany({ model, values: batch.map(embeddingText), maxRetries: 5 });
      embeddings.push(...res.embeddings);
      tokens += res.usage?.tokens ?? 0;
    }

    const del = await db().from("doc_chunks").delete().eq("path", page.path);
    if (del.error) throw new Error(del.error.message);
    if (chunks.length === 0) continue;
    const ins = await db().from("doc_chunks").insert(
      chunks.map((c, i) => ({
        path: c.path,
        chunk_index: c.chunkIndex,
        url: c.url,
        title: c.title,
        heading: c.heading,
        content: c.content,
        page_hash: hash,
        embedding: JSON.stringify(embeddings[i]),
      })),
    );
    if (ins.error) throw new Error(`${page.path}: ${ins.error.message}`);
    chunkCount += chunks.length;
    process.stdout.write(".");
  }

  for (const path of removed) {
    const { error } = await db().from("doc_chunks").delete().eq("path", path);
    if (error) throw new Error(error.message);
  }

  console.log(`\nIndexed ${chunkCount} chunks, ${tokens} embedding tokens, cost $${costUsd(modelId, tokens, 0).toFixed(4)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
