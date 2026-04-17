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

    if (ctx.args.dryRun) {
      if (targetType === "dailynote") {
        return {
          content: `dry-run: 将在笔记本 ${targetId} 创建/获取今日日记并追加内容`,
          details: {
            success: true,
            targetType,
            targetId,
            operations: [
              { endpoint: "filetree.createDailyNote", payload: { notebook: targetId } },
              { endpoint: "block.appendBlock", payload: { parentID: "<dailyNoteId>", data: markdown, dataType: "markdown" } },
            ],
          },
        };
      }
      return {
        content: `dry-run: 将追加到 [${targetType}] ${targetId}`,
        details: {
          success: true,
          targetType,
          targetId,
          operations: [
            { endpoint: "block.appendBlock", payload: { parentID: targetId, data: markdown, dataType: "markdown" } },
          ],
        },
      };
    }

    let actualTargetId = targetId;

    if (targetType === "dailynote") {
      // createDailyNote historically returns either {id} or the doc path string;
      // handle both and resolve the id via SQL if only a path was returned.
      const daily = await ctx.callEndpoint<{ id?: string } | string | null>(
        "filetree.createDailyNote",
        { notebook: targetId },
      );
      if (daily && typeof daily === "object" && typeof daily.id === "string") {
        actualTargetId = daily.id;
      } else if (typeof daily === "string" && daily.length > 0) {
        const rows = await ctx.callEndpoint<Array<{ id: string }>>("query.sql", {
          stmt: `SELECT id FROM blocks WHERE type='d' AND box='${targetId.replace(/'/g, "''")}' AND path='${daily.replace(/'/g, "''")}' LIMIT 1`,
        });
        if (rows.length === 0) {
          throw new Error(`createDailyNote returned path ${daily} but no matching block was found.`);
        }
        actualTargetId = rows[0]!.id;
      } else {
        throw new Error(`createDailyNote returned an unexpected value for notebook ${targetId}.`);
      }
    }
    // For document/block: no client-side probe. The kernel's block.appendBlock
    // will itself return code != 0 (surfaced as KERNEL_ERROR) for unknown IDs.

    const result = await ctx.callEndpoint<unknown>("block.appendBlock", {
      parentID: actualTargetId,
      data: markdown,
      dataType: "markdown",
    });

    return {
      content: `已成功追加到 [${targetType}] ${actualTargetId}`,
      details: {
        success: true,
        targetId: actualTargetId,
        targetType,
        result,
      },
    };
  },
};
