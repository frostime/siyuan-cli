import type { ToolSchema } from "../core/schema.js";

export const tool: ToolSchema = {
  id: "append-content",
  summary: "Append markdown content to daily note, document, or block",
  tags: ["write"],
  input: {
    type: "object",
    required: ["targetId", "targetType", "markdown"],
    additionalProperties: false,
    properties: {
      targetId: { type: "string", description: "Notebook ID for dailynote, or document/block ID" },
      targetType: { type: "string", enum: ["dailynote", "document", "block"], description: "Target type" },
      markdown: { type: "string", description: "Markdown to append" },
    },
  },
  cli: {
    allowSource: { markdown: ["literal", "file", "stdin"] },
  },
  async run(ctx, input) {
    const { targetId, targetType, markdown } = input as { targetId: string; targetType: "dailynote" | "document" | "block"; markdown: string };
    if (!markdown.trim()) throw new Error("markdown is required.");

    let actualTargetId = targetId;

    if (targetType === "dailynote") {
      const daily = await ctx.callEndpoint<{ id?: string } | string>("filetree.createDailyNote", { notebook: targetId });
      actualTargetId = typeof daily === "string" ? daily : (daily?.id ?? targetId);
    } else {
      const rows = await ctx.callEndpoint<Array<{ id: string; hpath?: string }>>("query.sql", {
        stmt: `SELECT id, hpath FROM blocks WHERE id = '${targetId.replace(/'/g, "''")}' LIMIT 1`,
      });
      if (rows.length === 0) {
        throw new Error(`Target ${targetType} not found: ${targetId}`);
      }
    }

    const result = await ctx.callEndpoint<unknown>("block.appendBlock", {
      parentID: actualTargetId,
      data: markdown,
      dataType: "markdown",
    });

    return {
      content: ctx.args.dryRun
        ? `dry-run: 将追加到 [${targetType}] ${actualTargetId}`
        : `已成功追加到 [${targetType}] ${actualTargetId}`,
      details: {
        success: true,
        targetId: actualTargetId,
        targetType,
        result,
      },
    };
  },
};
