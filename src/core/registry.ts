/**
 * Endpoint registry — collects all EndpointSchema definitions and provides lookup.
 * Schemas are registered from src/apis/index.ts at startup.
 */
import {
    deriveEndpointId,
    isTerminalFilterCompatiblePointerPath,
    pointerPathRoot,
    type EndpointClassification,
    type EndpointSchema,
    type RegisteredEndpoint,
    type RiskLabel
} from './schema.js';

function deriveRisk(classification: EndpointClassification): RiskLabel {
    if (classification.riskOverride) return classification.riskOverride;
    const { mode, surface, scope } = classification;
    if (mode === 'read' && surface === 'meta') return 'safe';
    if (mode === 'read' && (surface === 'content' || surface === 'asset'))
        return 'sensitive';
    if (mode === 'read' && (surface === 'workspace' || surface === 'network'))
        return 'elevated';
    if (mode === 'write' && (surface === 'content' || surface === 'asset')) {
        return scope === 'single' ? 'elevated' : 'destructive';
    }
    if (mode === 'write' && surface === 'workspace') return 'critical';
    if (mode === 'invoke' && surface === 'runtime') return 'destructive';
    if (mode === 'invoke' && surface === 'network') return 'critical';
    return 'elevated';
}

function deriveMeta(schema: EndpointSchema): RegisteredEndpoint['meta'] {
    const classification = schema.classification;
    const risk = deriveRisk(classification);
    const tags = [
        `mode:${classification.mode}`,
        `surface:${classification.surface}`,
        `scope:${classification.scope}`,
        ...(classification.operation
            ? [`operation:${classification.operation}`]
            : []),
        `risk:${risk}`
    ];
    return {
        classification,
        risk,
        tags,
        requiresConfirmation: risk === 'destructive' || risk === 'critical'
    };
}

function validateSchema(
    schema: EndpointSchema,
    entry: RegisteredEndpoint
): void {
    if (!schema.classification) {
        throw new Error(`Endpoint "${entry.id}" must declare classification.`);
    }

    const c = entry.meta.classification;
    if (c.mode === 'read' && c.scope === 'global') {
        if (!schema.guard?.response && !schema.guard?.filterResponse) {
            throw new Error(
                `Endpoint "${entry.id}" is global read and must declare guard.response or guard.filterResponse.`
            );
        }
    }

    if (
        schema.guard?.response &&
        !isTerminalFilterCompatiblePointerPath(schema.guard.response.itemsAt)
    ) {
        throw new Error(
            `Endpoint "${entry.id}" response.itemsAt "${schema.guard.response.itemsAt}" is not compatible with declarative terminal filtering.`
        );
    }

    for (const target of schema.guard?.payloadTargets ?? []) {
        const root = pointerPathRoot(target.path);
        if (!root) {
            throw new Error(
                `Endpoint "${entry.id}" payloadTargets path "${target.path}" must start with a payload property.`
            );
        }
        if (!(root in schema.payload.properties)) {
            throw new Error(
                `Endpoint "${entry.id}" payloadTargets path root "${target.path}" is not declared in payload.properties.`
            );
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
        if (!schema.classification) {
            throw new Error(`Endpoint "${id}" must declare classification.`);
        }
        const entry: RegisteredEndpoint = {
            schema,
            id,
            group,
            name,
            meta: deriveMeta(schema)
        };
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
