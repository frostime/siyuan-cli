import { defineCommand, runMain } from "citty";
import { workspaceCommand } from "./commands/workspace.js";

const main = defineCommand({
  meta: {
    name: "siyuan",
    version: "0.1.0",
    description: "Agent-first CLI for SiYuan Note",
  },
  subCommands: {
    workspace: workspaceCommand,
  },
});

runMain(main);
