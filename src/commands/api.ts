/**
 * `siyuan api` command — direct kernel API calls.
 * `list` and `describe` are fixed subcommands.
 * Each registered endpoint id (e.g. `query.sql`) is exposed as a dynamic subcommand,
 * so `siyuan api query.sql --help` works with Citty's native help flow.
 */
import { defineCommand } from "citty";
import { registry } from "../core/registry.js";
import { loadConfig, resolveWorkspace } from "../core/config.js";
import { SiyuanClient } from "../core/client.js";
import { createPermissionEngine } from "../core/permission.js";
import { executeEndpoint } from "../core/guard.js";
import { parsePayload } from "../core/argv.js";
import { fatalError, toCliError } from "../utils/errors.js";
import type { RegisteredEndpoint } from "../core/schema.js";

import "../apis/index.js";

function out(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

export function listEndpoints(args: Record<string, unknown>): void {
  const endpoints = registry.list({
    group: args["group"] as string | undefined,
    tag: args["tag"] as string | undefined,
  });
  out(endpoints.map((e) => ({
    id: e.id,
    endpoint: e.schema.endpoint,
    summary: e.schema.summary,
    tags: e.schema.tags ?? [],
  })));
}

export function describeEndpoint(id: string): void {
  const entry = registry.get(id);
  if (!entry) {
    process.stderr.write(
      JSON.stringify({ error: "ENDPOINT_NOT_FOUND", id, message: `Endpoint "${id}" not found. Run \`siyuan api list\` to see all endpoints.` }) + "\n",
    );
    process.exit(1);
  }
  const { schema } = entry;
  const serializable = {
    ...schema,
    guard: schema.guard
      ? { ...schema.guard, filterResponse: schema.guard.filterResponse ? "[Function]" : undefined }
      : undefined,
  };
  out({ ...entry, schema: serializable });
}

async function callEndpoint(
  entry: RegisteredEndpoint,
  rawArgs: Record<string, unknown>,
  positional?: string,
): Promise<void> {
  const { schema } = entry;

  const payload = parsePayload({
    schema,
    args: rawArgs,
    positional,
  });

  const config = loadConfig(rawArgs["config"] as string | undefined);
  if (rawArgs["dry-run"]) {
    out({ dryRun: true, endpoint: schema.endpoint, payload });
    return;
  }

  const workspace = resolveWorkspace(config, {
    workspace: rawArgs["workspace"] as string | undefined,
    baseUrl: rawArgs["baseUrl"] as string | undefined,
    token: rawArgs["token"] as string | undefined,
  });
  const client = new SiyuanClient(workspace);
  const engine = createPermissionEngine(config, workspace.name);

  const result = await executeEndpoint({
    schema,
    payload,
    client,
    engine,
    dryRun: rawArgs["dry-run"] as boolean | undefined,
    yes: rawArgs["yes"] as boolean | undefined,
    debug: rawArgs["debug"] as boolean | undefined,
  });
  out(result);
}

function buildEndpointSubCommand(entry: RegisteredEndpoint) {
  return defineCommand({
    meta: {
      name: entry.id,
      description: entry.schema.summary,
    },
    args: {
      workspace: { type: "string", description: "Workspace to use", alias: "w" },
      "dry-run": { type: "boolean", description: "Preview request without sending", default: false },
      yes: { type: "boolean", description: "Confirm write operations", default: false, alias: "y" },
      debug: { type: "boolean", description: "Show debug info (curl equivalent)", default: false },
      json: { type: "string", description: "Pass JSON payload inline", alias: "j" },
      file: { type: "string", description: "Load JSON payload from file (- = stdin)", alias: "f" },
      primary: {
        type: "positional",
        description: entry.schema.cli?.primary ? `Primary value for ${entry.schema.cli.primary}` : "Primary value",
        required: false,
      },
      ...Object.fromEntries(
        Object.entries(entry.schema.payload.properties).map(([field, prop]) => [
          field,
          {
            type: "string",
            description: prop.description ?? field,
          },
        ]),
      ),
    },
    run: async ({ args }) => {
      await callEndpoint(entry, args as Record<string, unknown>, args.primary as string | undefined).catch((e) => {
        fatalError(toCliError(e));
      });
    },
  });
}

const listCommand = defineCommand({
  meta: { name: "list", description: "List all registered API endpoints." },
  args: {
    group: { type: "string", description: "Filter by group (e.g. query, block)" },
    tag: { type: "string", description: "Filter by tag (read, write, mutation, ...)" },
  },
  run: ({ args }) => {
    listEndpoints(args as Record<string, unknown>);
  },
});

const describeCommand = defineCommand({
  meta: { name: "describe", description: "Show full EndpointSchema for an endpoint." },
  args: {
    id: { type: "positional", description: "Endpoint id (e.g. query.sql)", required: true },
  },
  run: ({ args }) => {
    describeEndpoint(args.id);
  },
});

export const endpointSubCommands = Object.fromEntries(
  registry.list().map((entry) => [entry.id, buildEndpointSubCommand(entry)]),
);

export const apiCommand = defineCommand({
  meta: { name: "api", description: "Call SiYuan kernel API endpoints directly." },
  subCommands: {
    list: listCommand,
    describe: describeCommand,
    ...endpointSubCommands,
  },
});
