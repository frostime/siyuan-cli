import { defineCommand, runMain, showUsage, type CommandDef } from "citty";
import { workspaceCommand } from "./commands/workspace.js";
import { apiCommand } from "./commands/api.js";
import { buildEndpointHelp } from "./core/argv.js";
import { registry } from "./core/registry.js";

const main = defineCommand({
  meta: {
    name: "siyuan",
    version: "0.1.0",
    description: "Agent-first CLI for SiYuan Note",
  },
  subCommands: {
    workspace: workspaceCommand,
    api: apiCommand,
  },
});

async function customShowUsage(cmd: CommandDef, parent?: CommandDef): Promise<void> {
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

  await showUsage(cmd, parent);
}

runMain(main, { showUsage: customShowUsage });
