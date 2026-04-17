import { defineCommand } from "citty";
import { parsePayload } from "../core/argv.js";
import { buildToolHelp, createToolContext, renderToolResult, toolRegistry } from "../core/tools.js";
import { fatalError, toCliError } from "../utils/errors.js";
import type { ToolSchema } from "../core/schema.js";

import "../tools/index.js";

function describeTool(id: string): void {
  const tool = toolRegistry.get(id);
  if (!tool) {
    process.stderr.write(JSON.stringify({ error: "TOOL_NOT_FOUND", id }) + "\n");
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(tool, null, 2) + "\n");
}

async function runTool(tool: ToolSchema, args: Record<string, unknown>, positional?: string): Promise<void> {
  const input = parsePayload({
    schema: { endpoint: "/tool", summary: tool.summary, payload: tool.input, cli: tool.cli } as any,
    args,
    positional,
  });
  const ctx = await createToolContext(args as any, tool.id);
  const result = await tool.run(ctx, input);
  renderToolResult(result, args as any);
}

function buildToolSubCommand(tool: ToolSchema) {
  return defineCommand({
    meta: { name: tool.id, description: tool.summary },
    args: {
      workspace: { type: "string", description: "Workspace to use", alias: "w" },
      debug: { type: "boolean", description: "Debug output", default: false },
      "dry-run": { type: "boolean", description: "Preview without sending write request", default: false },
      yes: { type: "boolean", description: "Confirm write operations", default: false, alias: "y" },
      details: { type: "boolean", description: "Print { content, details }", default: false },
      only: { type: "string", description: "Output only content or details" },
      json: { type: "string", description: "Pass JSON input inline", alias: "j" },
      file: { type: "string", description: "Load JSON input from file (- = stdin)", alias: "f" },
      primary: { type: "positional", description: tool.cli?.primary ?? "Primary value", required: false },
      ...Object.fromEntries(Object.entries(tool.input.properties).map(([field, prop]) => [field, { type: "string", description: prop.description ?? field }])),
    },
    run: async ({ args }) => {
      await runTool(tool, args as Record<string, unknown>, args.primary as string | undefined).catch((e) => fatalError(toCliError(e)));
    },
  });
}

const listCommand = defineCommand({
  meta: { name: "list", description: "List registered tools." },
  args: { tag: { type: "string", description: "Filter by tag" } },
  run: ({ args }) => {
    const list = toolRegistry.list({ tag: args.tag as string | undefined }).map((t) => ({ id: t.id, summary: t.summary, tags: t.tags ?? [] }));
    process.stdout.write(JSON.stringify(list, null, 2) + "\n");
  },
});

const describeCommand = defineCommand({
  meta: { name: "describe", description: "Show full ToolSchema." },
  args: { id: { type: "positional", description: "Tool id", required: true } },
  run: ({ args }) => describeTool(args.id),
});

export const toolSubCommands = Object.fromEntries(toolRegistry.list().map((tool) => [tool.id, buildToolSubCommand(tool)]));

export const toolCommand = defineCommand({
  meta: { name: "tool", description: "Run built-in workflow tools." },
  subCommands: {
    list: listCommand,
    describe: describeCommand,
    ...toolSubCommands,
  },
});

export { buildToolHelp };
