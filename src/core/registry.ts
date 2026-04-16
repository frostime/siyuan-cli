/**
 * Endpoint registry — collects all EndpointSchema definitions and provides lookup.
 * Schemas are registered from src/apis/index.ts at startup.
 */
import { deriveEndpointId } from "./schema.js";
import type { EndpointSchema, RegisteredEndpoint } from "./schema.js";

export class EndpointRegistry {
  private readonly map = new Map<string, RegisteredEndpoint>();

  register(schema: EndpointSchema): void {
    const { id, group, name } = deriveEndpointId(schema.endpoint);
    if (this.map.has(id)) {
      throw new Error(`Endpoint "${id}" is already registered.`);
    }
    this.map.set(id, { schema, id, group, name });
  }

  get(id: string): RegisteredEndpoint | undefined {
    return this.map.get(id);
  }

  list(filter?: { group?: string; tag?: string }): RegisteredEndpoint[] {
    let entries = [...this.map.values()];
    if (filter?.group) {
      const g = filter.group;
      entries = entries.filter((e) => e.group === g);
    }
    if (filter?.tag) {
      const t = filter.tag;
      entries = entries.filter((e) => e.schema.tags?.includes(t as never));
    }
    return entries.sort((a, b) => a.id.localeCompare(b.id));
  }
}

/** Global singleton — populated by src/apis/index.ts */
export const registry = new EndpointRegistry();
