import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const DOC_SECTIONS = ["apps/docs/content/guides/auth", "apps/docs/content/guides/database"];
const REPO = "https://github.com/supabase/supabase.git";

// Sparse, shallow clone of only the doc sections we index. Re-running pulls the latest.
export function ensureDocsCheckout(cacheDir: string): string {
  const repoDir = join(cacheDir, "supabase");
  const git = (args: string[], cwd?: string) => execFileSync("git", args, { cwd, stdio: "inherit" });
  if (!existsSync(join(repoDir, ".git"))) {
    git(["clone", "--depth", "1", "--filter=blob:none", "--sparse", REPO, repoDir]);
  } else {
    git(["pull", "--depth", "1"], repoDir);
  }
  git(["sparse-checkout", "set", ...DOC_SECTIONS], repoDir);
  return join(repoDir, "apps/docs/content");
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.mdx?$/.test(name) && !name.startsWith("_") ? [full] : [];
  });
}

// Sparse checkouts also bring sibling files of the parent folder (ai.mdx, storage.mdx...): keep only our sections.
export function listMdx(contentDir: string): string[] {
  const wanted = DOC_SECTIONS.map((s) => s.replace("apps/docs/content/", ""));
  return walk(contentDir).filter((f) => {
    const rel = relative(contentDir, f).replace(/\\/g, "/");
    return wanted.some((w) => rel.startsWith(`${w}/`) || rel === `${w}.mdx`);
  });
}
