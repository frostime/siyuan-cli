import type { ToolSchema } from "../core/schema.js";

export const tool: ToolSchema = {
  id: "resolve-path",
  summary: "Resolve hpath or id to stable SiYuan path",
  tags: ["read", "util"],
  input: {
    type: "object",
    additionalProperties: false,
    properties: {
      hpath: { type: "string", description: "Human-readable hpath" },
      id: { type: "string", description: "Block or document ID" },
    },
  },
  cli: {
    examples: [
      { command: 'siyuan tool resolve-path --hpath "/私人/日记"' },
      { command: "siyuan tool resolve-path --id 20260417090223-xxxxxxx" },
    ],
  },
  async run(ctx, input) {
    const { hpath, id } = input as { hpath?: string; id?: string };
    if ((hpath ? 1 : 0) + (id ? 1 : 0) !== 1) {
      throw new Error("Exactly one of --hpath or --id is required.");
    }
    const stmt = hpath
      ? "SELECT id, box, path, hpath FROM blocks WHERE type='d' AND hpath = ?"
      : "SELECT id, box, path, hpath FROM blocks WHERE id = ?";
    const rows = await ctx.callEndpoint<Array<{ id: string; box: string; path: string; hpath: string }>>("query.sql", {
      stmt: stmt.replace("?", `'${(hpath ?? id)?.replace(/'/g, "''")}'`),
    });
    const matches = rows.map((r) => ({ id: r.id, notebook: r.box, path: r.path, hpath: r.hpath }));
    const content = matches.length
      ? `找到 ${matches.length} 个匹配：\n` + matches.map((m) => `- ${m.path} (hpath=${m.hpath}, id=${m.id})`).join("\n")
      : "未找到匹配。";
    return { content, details: { matches } };
  },
};
