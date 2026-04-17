import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "pathe";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

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
  if (target === "custom") {
    if (!dest) throw new Error("--dest is required when --target custom.");
    return join(dest, name);
  }
  return join(homedir(), ".agents", "skills", name);
}

export function installSkill(name: string, opts: { target?: string; dest?: string; force?: boolean; dryRun?: boolean }) {
  const entry = listBuiltinSkills().find((s) => s.name === name);
  if (!entry) throw new Error(`Skill "${name}" not found.`);
  const targetDir = skillInstallTarget(name, opts.target, opts.dest);
  const operations = [{ op: "copy", from: entry.path, to: targetDir }];
  if (opts.dryRun) {
    return { target: targetDir, operations, dryRun: true };
  }
  if (existsSync(targetDir) && !opts.force) {
    throw new Error(`Target already exists: ${targetDir}. Use --force to overwrite.`);
  }
  mkdirSync(dirname(targetDir), { recursive: true });
  cpSync(entry.path, targetDir, { recursive: true, force: !!opts.force });
  return { target: targetDir, files: readdirSync(targetDir), dryRun: false };
}
