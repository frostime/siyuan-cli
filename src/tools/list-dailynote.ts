import type { ToolSchema } from "../core/schema.js";

export const tool: ToolSchema = {
  id: "list-dailynote",
  summary: "List daily note documents",
  tags: ["read", "aggregate"],
  input: {
    type: "object",
    additionalProperties: false,
    properties: {
      date: { type: "string", description: "Date filter, default today", default: "today" },
      mode: { type: "string", enum: ["at", "before", "after"], default: "at", description: "Date compare mode" },
      filterNotebook: { type: "string", description: "Notebook ID filter" },
    },
  },
  async run(ctx, input) {
    const { filterNotebook } = input as { date?: string; mode?: string; filterNotebook?: string };
    let stmt = "SELECT id, box, hpath, path, created FROM blocks WHERE type='d' AND hpath LIKE '%/daily note/%'";
    if (filterNotebook) stmt += ` AND box = '${filterNotebook.replace(/'/g, "''")}'`;
    stmt += " ORDER BY created DESC LIMIT 100";
    const rows = await ctx.callEndpoint<Array<{ id: string; box: string; hpath: string; path: string; created: string }>>("query.sql", { stmt });
    const content = rows.length
      ? `# Daily Notes (${rows.length})\n` + rows.map((r) => `- ${r.created.slice(0, 10)} [${r.id}] ${r.hpath}`).join("\n")
      : "No daily notes found.";
    return { content, details: { entries: rows.map((r) => ({ id: r.id, notebook: r.box, hpath: r.hpath, path: r.path, created: r.created })) } };
  },
};
