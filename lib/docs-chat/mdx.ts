// Turns Supabase docs MDX into plain markdown chunks with deep links.
// Pure functions, no I/O, so they can be unit-tested and reused by the eval.

export type Page = { path: string; url: string; title: string; body: string };
export type Chunk = { path: string; chunkIndex: number; url: string; title: string; heading: string; content: string };

const DOCS_BASE = "https://supabase.com/docs/";
const TARGET_CHARS = 2800; // ~700 tokens
const OVERLAP_CHARS = 300;
const MIN_CHARS = 120;

// "apps/docs/content/guides/auth/server-side.mdx" -> "https://supabase.com/docs/guides/auth/server-side"
export function pathToUrl(relPath: string): string {
  const clean = relPath.replace(/\\/g, "/").replace(/^.*?content\//, "").replace(/\.mdx?$/, "").replace(/\/index$/, "");
  return DOCS_BASE + clean;
}

// GitHub-style heading anchors, close to what the docs site generates.
export function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s/g, "-");
}

function parseFrontMatter(src: string): { title: string; rest: string } {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { title: "", rest: src };
  const title = m[1].match(/^title:\s*['"]?(.*?)['"]?\s*$/m)?.[1] ?? "";
  return { title, rest: src.slice(m[0].length) };
}

// PascalCase components (Admonition, TabPanel, StepHikeCompact.Step...) and plain HTML wrappers.
// ALL_CAPS placeholders like <PROJECT_REF> are content and are kept.
const COMPONENT_TAG = /<\/?(?:[A-Z][a-z][A-Za-z0-9]*(?:\.[A-Za-z]+)?|\$[A-Za-z]+|div|span|img|br|p|a|section)(?=[\s>/]|$)[^>]*\/?>/g;
const OPENING_TAG_START = /^\s*<(?:[A-Z][a-z][A-Za-z0-9]*(?:\.[A-Za-z]+)?|\$[A-Za-z]+|div|span|img)(?=[\s>/]|$)/;

export function cleanMdx(src: string): { title: string; body: string } {
  const { title, rest } = parseFrontMatter(src);
  const out: string[] = [];
  let inFence = false;
  let inMultilineTag = false;
  let pendingLabel = "";

  for (const line of rest.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      out.push(line.trimStart());
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    if (inMultilineTag) {
      pendingLabel ||= line.match(/label=["']([^"']+)["']/)?.[1] ?? "";
      if (/>\s*$/.test(line)) {
        inMultilineTag = false;
        if (pendingLabel) out.push(`**${pendingLabel}**`);
        pendingLabel = "";
      }
      continue;
    }
    if (/^\s*(import|export)\s/.test(line)) continue;
    if (/^\s*\{\/\*.*\*\/\}\s*$/.test(line)) continue; // MDX comments

    // Opening tag spread over several lines: skip until it closes, keep a tab label if present.
    if (OPENING_TAG_START.test(line) && !/>/.test(line)) {
      inMultilineTag = true;
      pendingLabel = line.match(/label=["']([^"']+)["']/)?.[1] ?? "";
      continue;
    }

    const label = line.match(/<TabPanel[^>]*label=["']([^"']+)["']/)?.[1];
    const stripped = line.replace(COMPONENT_TAG, "").trimEnd();
    if (label) out.push(`**${label}**`);
    if (stripped.trim() === "" && line.trim() !== "") continue; // line was only tags
    out.push(stripped.replace(/^\s{2,}(?=\S)/, (m) => (m.length >= 4 ? m : "")));
  }

  const body = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { title, body };
}

export function toPage(relPath: string, src: string): Page {
  const { title, body } = cleanMdx(src);
  return { path: relPath.replace(/\\/g, "/"), url: pathToUrl(relPath), title, body };
}

// Last resort for huge blocks (long code samples): cut on line boundaries.
function hardSplit(block: string): string[] {
  if (block.length <= TARGET_CHARS * 1.5) return [block];
  const pieces: string[] = [];
  let piece = "";
  for (const line of block.split("\n")) {
    if (piece.length + line.length > TARGET_CHARS && piece) {
      pieces.push(piece);
      piece = "";
    }
    piece += `${line}\n`;
  }
  if (piece.trim()) pieces.push(piece);
  return pieces;
}

type Section = { heading: string; anchor: string; text: string };

function splitSections(body: string): Section[] {
  const sections: Section[] = [];
  let current: Section = { heading: "", anchor: "", text: "" };
  let inFence = false;
  for (const line of body.split("\n")) {
    if (/^(```|~~~)/.test(line)) inFence = !inFence;
    const h = !inFence && line.match(/^(#{2,3})\s+(.*)$/);
    if (h) {
      if (current.text.trim()) sections.push(current);
      const heading = h[2].replace(/\s*\{#([^}]+)\}\s*$/, "").trim();
      const explicitAnchor = h[2].match(/\{#([^}]+)\}/)?.[1];
      current = { heading, anchor: explicitAnchor ?? slugify(heading), text: `${line}\n` };
    } else {
      current.text += `${line}\n`;
    }
  }
  if (current.text.trim()) sections.push(current);
  return sections;
}

// Paragraph-aware splitting that never cuts through a code block.
function splitLong(text: string): string[] {
  if (text.length <= TARGET_CHARS) return [text];
  const blocks: string[] = [];
  let buf = "";
  let inFence = false;
  for (const line of text.split("\n")) {
    if (/^(```|~~~)/.test(line)) inFence = !inFence;
    buf += `${line}\n`;
    if (!inFence && line.trim() === "") {
      blocks.push(buf);
      buf = "";
    }
  }
  if (buf.trim()) blocks.push(buf);

  const parts: string[] = [];
  let part = "";
  for (const block of blocks.flatMap(hardSplit)) {
    if (part.length + block.length > TARGET_CHARS && part.length > 0) {
      parts.push(part);
      part = part.slice(-OVERLAP_CHARS).replace(/^[^\n]*\n/, "") + block;
    } else {
      part += block;
    }
  }
  if (part.trim()) parts.push(part);
  return parts;
}

export function chunkPage(page: Page): Chunk[] {
  const chunks: Chunk[] = [];
  for (const section of splitSections(page.body)) {
    for (const text of splitLong(section.text)) {
      const content = text.trim();
      if (content.length < MIN_CHARS) continue;
      chunks.push({
        path: page.path,
        chunkIndex: chunks.length,
        url: section.anchor ? `${page.url}#${section.anchor}` : page.url,
        title: page.title,
        heading: section.heading,
        content,
      });
    }
  }
  return chunks;
}
