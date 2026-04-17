import { defineCommand, runMain, showUsage } from "citty";
import { workspaceCommand } from "./commands/workspace.js";
import { apiCommand } from "./commands/api.js";
import { toolCommand } from "./commands/tool.js";
import { skillCommand } from "./commands/skill.js";
import { buildEndpointHelp } from "./core/argv.js";
import { registry } from "./core/registry.js";
import { buildToolHelp, toolRegistry } from "./core/tools.js";
import "./tools/index.js";

const main = defineCommand({
  meta: {
    name: "siyuan",
    version: "0.1.0",
    description: "Agent-first CLI for SiYuan Note",
  },
  subCommands: {
    workspace: workspaceCommand,
    api: apiCommand,
    tool: toolCommand,
    skill: skillCommand,
  },
});

async function customShowUsage<T extends Record<string, unknown>>(cmd: any, parent?: any): Promise<void> {
  const meta = typeof cmd.meta === "function" ? await cmd.meta() : await cmd.meta;
  const parentMeta = parent ? (typeof parent.meta === "function" ? await parent.meta() : await parent.meta) : undefined;

  // Detect `siyuan api <endpoint-id> --help`
  if (parentMeta?.name === "api" && meta?.name) {
    const entry = registry.get(meta.name);
    if (entry) {
      process.stdout.write(buildEndpointHelp(entry) + "\n");
      return;
    }
  }

  // Detect `siyuan tool <tool-id> --help`
  if (parentMeta?.name === "tool" && meta?.name) {
    const tool = toolRegistry.get(meta.name);
    if (tool) {
      process.stdout.write(buildToolHelp(tool) + "\n");
      return;
    }
  }

  await showUsage(cmd, parent);
}

runMain(main, { showUsage: customShowUsage });
