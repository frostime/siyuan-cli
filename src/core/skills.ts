import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "pathe";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { loadConfig, resolveWorkspace } from "./config.js";

export interface SkillEntry {
  name: string;
  description: string;
  path: string;
  source: "builtin";
  size: number;
}

function builtinSkillsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "../skills");
}

function parseFrontmatter(content: string): { name: string; description: string } {
  const m = /^---\n([\s\S]*?)\n---/m.exec(content);
  if (!m) throw new Error("Missing skill frontmatter.");
  const block = m[1]!;
  const name = /^name:\s*(.+)$/m.exec(block)?.[1]?.trim();
  const description = /^description:\s*"?([\s\S]+?)"?$/m.exec(block)?.[1]?.trim();
  if (!name || !description) throw new Error("Invalid skill frontmatter.");
  return { name, description };
}

export function listBuiltinSkills(): SkillEntry[] {
  const base = builtinSkillsDir();
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const skillPath = join(base, d.name);
      const skillFile = join(skillPath, "SKILL.md");
      const content = readFileSync(skillFile, "utf-8");
      const fm = parseFrontmatter(content);
      return {
        name: fm.name,
        description: fm.description,
        path: skillPath,
        source: "builtin" as const,
        size: statSync(skillFile).size,
      };
    });
}

export function readSkill(rel: string): string {
  const base = builtinSkillsDir();
  return readFileSync(join(base, rel), "utf-8");
}

function skillInstallTarget(name: string, target = "agents", dest?: string): string {
  if (target === "agents") return join(homedir(), ".agents", "skills", name);
  if (target === "claude") return join(homedir(), ".claude", "skills", name);
  if (target === "claude-project") return join(process.cwd(), ".claude", "skills", name);
  if (target === "custom") {
    if (!dest) throw new Error("--dest is required when --target custom.");
    return join(dest, name);
  }
  throw new Error(`Unsupported target: ${target}`);
}

function templateVars() {
  let workspace = "";
  let baseUrl = "";
  try {
    const cfg = loadConfig();
    const ws = resolveWorkspace(cfg, {});
    workspace = ws.name;
    baseUrl = ws.baseUrl;
  } catch {}
  return {
    "{{cli_version}}": "0.1.0",
    "{{workspace}}": workspace,
    "{{base_url}}": baseUrl,
    "{{cli_path}}": join(process.cwd(), "bin", "siyuan.mjs"),
    "{{today}}": new Date().toISOString().slice(0, 10),
  };
}

function applyTemplates(dir: string): void {
  const vars = templateVars();
  const exts = new Set([".md", ".txt", ".yaml", ".yml", ".json", ".sh"]);
  const walk = (p: string) => {
    for (const name of readdirSync(p, { withFileTypes: true })) {
      const child = join(p, name.name);
      if (name.isDirectory()) walk(child);
      else if (exts.has(extname(name.name))) {
        let text = readFileSync(child, "utf-8");
        for (const [k, v] of Object.entries(vars)) text = text.replaceAll(k, v);
        writeFileSync(child, text, "utf-8");
      }
    }
  };
  walk(dir);
}

export function installSkill(name: string, opts: { target?: string; dest?: string; force?: boolean; dryRun?: boolean }) {
  const entry = listBuiltinSkills().find((s) => s.name === name);
  if (!entry) throw new Error(`Skill "${name}" not found.`);
  const targetDir = skillInstallTarget(name, opts.target, opts.dest);
  const operations = [{ op: "copy", from: entry.path, to: targetDir }, { op: "template", target: targetDir }];
  if (opts.dryRun) {
    return { target: targetDir, operations, dryRun: true };
  }
  if (existsSync(targetDir) && !opts.force) {
    throw new Error(`Target already exists: ${targetDir}. Use --force to overwrite.`);
  }
  mkdirSync(dirname(targetDir), { recursive: true });
  cpSync(entry.path, targetDir, { recursive: true, force: !!opts.force });
  applyTemplates(targetDir);
  return { target: targetDir, files: readdirSync(targetDir), dryRun: false };
}

export function uninstallSkill(name: string, opts: { target?: string; dest?: string }) {
  const targetDir = skillInstallTarget(name, opts.target, opts.dest);
  if (!existsSync(targetDir)) {
    throw new Error(`Target does not exist: ${targetDir}`);
  }
  rmSync(targetDir, { recursive: true, force: true });
  return { removed: targetDir };
}
