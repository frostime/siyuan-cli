import type { ToolSchema } from "../core/schema.js";

export const tool: ToolSchema = {
  id: "append-content",
  summary: "Append markdown content to a document or block",
  tags: ["write"],
  input: {
    type: "object",
    required: ["targetId", "targetType", "markdown"],
    additionalProperties: false,
    properties: {
      targetId: { type: "string", description: "Target document/block ID" },
      targetType: { type: "string", enum: ["dailynote", "document", "block"], description: "Target type" },
      markdown: { type: "string", description: "Markdown to append" },
    },
  },
  cli: {
    allowSource: { markdown: ["literal", "file", "stdin"] },
  },
  async run(ctx, input) {
    const { targetId, targetType, markdown } = input as { targetId: string; targetType: string; markdown: string };
    const res = await ctx.callEndpoint<unknown>("block.appendBlock", {
      parentID: targetId,
      data: markdown,
      dataType: "markdown",
    });
    return {
      content: ctx.args.dryRun ? `dry-run: 将追加到 [${targetType}] ${targetId}` : `已追加到 [${targetType}] ${targetId}`,
      details: { parentID: targetId, result: res },
    };
  },
};
