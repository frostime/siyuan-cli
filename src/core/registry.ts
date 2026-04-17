/**
 * Endpoint registry — collects all EndpointSchema definitions and provides lookup.
 * Schemas are registered from src/apis/index.ts at startup.
 */
import {
  deriveEndpointId,
  type EndpointClassification,
  type EndpointSchema,
  type RegisteredEndpoint,
  type RiskLabel,
} from "./schema.js";

function deriveClassificationFromLegacyTags(schema: EndpointSchema, group: string, name: string): EndpointClassification {
  const tags = schema.tags ?? [];
  const isQuery = tags.includes("query");
  const isWrite = tags.includes("write") || tags.includes("mutation") || tags.includes("upload");
  const mode = isWrite ? "write" : "read";

  let surface: EndpointClassification["surface"] = "content";
  if (group === "file") surface = "workspace";
  else if (group === "asset") surface = "asset";
  else if (group === "network") surface = "network";
  else if (group === "notification") surface = "runtime";
  else if (group === "system") {
    if (["exit", "logoutAuth"].includes(name)) surface = "runtime";
    else surface = "meta";
  }

  let scope: EndpointClassification["scope"] = "single";
  if (isQuery || group === "search" || name === "lsNotebooks") scope = "global";
  else if (/(moveDocs|removeDocs|listDocs|searchDocs)/.test(name)) scope = "batch";

  let operation: EndpointClassification["operation"] | undefined;
  if (isQuery) operation = "query";
  else if (group === "search") operation = "search";
  else if (tags.includes("upload")) operation = "upload";
  else if (/^get|^ls|^read|^export/.test(name)) operation = "inspect";
  else if (/create|append|prepend|insert/.test(name)) operation = "create";
  else if (/delete|remove/.test(name)) operation = "delete";
  else if (/move|rename|transfer/.test(name)) operation = "move";
  else if (/update|set|flush|open|close|exit|logout|push/.test(name)) operation = surface === "runtime" || surface === "network" ? "control" : "update";

  return { mode, surface, scope, ...(operation ? { operation } : {}) };
}

function deriveRisk(classification: EndpointClassification): RiskLabel {
  if (classification.riskOverride) return classification.riskOverride;
  const { mode, surface, scope } = classification;
  if (mode === "read" && surface === "meta") return "safe";
  if (mode === "read" && (surface === "content" || surface === "asset")) return "sensitive";
  if (mode === "read" && (surface === "workspace" || surface === "network")) return "elevated";
  if (mode === "write" && (surface === "content" || surface === "asset")) {
    return scope === "single" ? "elevated" : "destructive";
  }
  if (mode === "write" && surface === "workspace") return "critical";
  if (mode === "invoke" && surface === "runtime") return "destructive";
  if (mode === "invoke" && surface === "network") return "critical";
  return "elevated";
}

function deriveMeta(schema: EndpointSchema, group: string, name: string): RegisteredEndpoint["meta"] {
  const classification = schema.classification ?? deriveClassificationFromLegacyTags(schema, group, name);
  const risk = deriveRisk(classification);
  const tags = [
    `mode:${classification.mode}`,
    `surface:${classification.surface}`,
    `scope:${classification.scope}`,
    ...(classification.operation ? [`operation:${classification.operation}`] : []),
    `risk:${risk}`,
  ];
  return {
    classification,
    risk,
    tags,
    requiresConfirmation: risk === "destructive" || risk === "critical",
  };
}

function validateSchema(schema: EndpointSchema, entry: RegisteredEndpoint): void {
  if (!schema.classification && !schema.tags?.length) {
    throw new Error(`Endpoint "${entry.id}" must declare classification or legacy tags during transition.`);
  }

  const c = entry.meta.classification;
  if (c.mode === "read" && c.scope === "global") {
    if (!schema.guard?.response && !schema.guard?.filterResponse) {
      throw new Error(`Endpoint "${entry.id}" is global read and must declare guard.response or guard.filterResponse.`);
    }
  }

  for (const target of schema.guard?.payloadTargets ?? []) {
    if (!(target.field in schema.payload.properties)) {
      throw new Error(`Endpoint "${entry.id}" payloadTargets field "${target.field}" is not declared in payload.properties.`);
    }
  }
}

export class EndpointRegistry {
  private readonly map = new Map<string, RegisteredEndpoint>();

  register(schema: EndpointSchema): void {
    const { id, group, name } = deriveEndpointId(schema.endpoint);
    if (this.map.has(id)) {
      throw new Error(`Endpoint "${id}" is already registered.`);
    }
    const entry: RegisteredEndpoint = { schema, id, group, name, meta: deriveMeta(schema, group, name) };
    validateSchema(schema, entry);
    this.map.set(id, entry);
  }

  get(id: string): RegisteredEndpoint | undefined {
    return this.map.get(id);
  }

  list(filter?: { group?: string; tag?: string }): RegisteredEndpoint[] {
    let entries = [...this.map.values()];
    if (filter?.group) {
      entries = entries.filter((e) => e.group === filter.group);
    }
    if (filter?.tag) {
      entries = entries.filter((e) => e.meta.tags.includes(filter.tag!));
    }
    return entries.sort((a, b) => a.id.localeCompare(b.id));
  }
}

/** Global singleton — populated by src/apis/index.ts */
export const registry = new EndpointRegistry();
