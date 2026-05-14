/**
 * Endpoint registry — collects all EndpointSchema definitions and provides lookup.
 * Schemas are registered from src/api/endpoints/index.ts at startup.
 */
import {
    deriveEndpointId,
    isTerminalFilterCompatiblePointerPath,
    pointerPathRoot,
    type AuthoredEndpointClassification,
    type EndpointClassification,
    type EndpointConcern,
    type EndpointSchema,
    type RegisteredEndpoint,
    type SeverityLabel
} from '../shared/schema.js';

function hasNewClassification(
    classification: AuthoredEndpointClassification
): classification is EndpointClassification {
    return 'action' in classification && 'domain' in classification;
}

function normalizeLegacyClassification(
    schema: EndpointSchema,
    id: string
): EndpointClassification {
    const legacy = schema.classification;
    if (hasNewClassification(legacy)) return legacy;

    let domain: EndpointClassification['domain'];
    if (legacy.surface === 'asset' || legacy.surface === 'workspace') {
        domain = 'storage';
    } else {
        domain = legacy.surface;
    }

    const concerns: EndpointConcern[] = [];
    if (id === 'system.getConf') domain = 'config';
    if (id === 'notification.pushMsg' || id === 'notification.pushErrMsg') {
        domain = 'ui';
        concerns.push('notify');
    }
    if (id === 'system.exit') concerns.push('process-exit');
    if (id === 'network.forwardProxy') concerns.push('network-request');
    if (id === 'sqlite.flushTransaction') concerns.push('high-load');
    if (id === 'block.transferBlockRef') {
        concerns.push('reindex', 'high-load');
    }
    if (
        id === 'file.putFile' ||
        id === 'file.removeFile' ||
        id === 'file.renameFile'
    ) {
        concerns.push('filesystem');
    }

    return {
        action: legacy.mode,
        domain,
        ...(concerns.length ? { concerns } : {}),
        cardinality: legacy.scope
    };
}

function deriveSeverity(classification: EndpointClassification): SeverityLabel {
    const concerns = classification.concerns ?? [];
    if (
        concerns.some((concern) =>
            [
                'process-exit',
                'filesystem',
                'network-request',
                'reindex',
                'id-regeneration',
                'unbounded-read'
            ].includes(concern)
        )
    ) {
        return 'high';
    }
    if (classification.action === 'read' && classification.domain === 'meta') {
        return 'low';
    }
    if (
        classification.action === 'invoke' &&
        classification.domain === 'ui' &&
        concerns.includes('notify')
    ) {
        return 'low';
    }
    if (classification.action === 'write' && classification.domain === 'storage') {
        return 'high';
    }
    if (
        classification.action !== 'read' &&
        (classification.domain === 'runtime' || classification.domain === 'network')
    ) {
        return 'high';
    }
    return 'medium';
}

function deriveMeta(schema: EndpointSchema, id: string): RegisteredEndpoint['meta'] {
    const classification = normalizeLegacyClassification(schema, id);
    const severity = deriveSeverity(classification);
    const tags = [
        `action:${classification.action}`,
        `domain:${classification.domain}`,
        ...(classification.concerns ?? []).map((concern) => `concern:${concern}`),
        ...(classification.cardinality
            ? [`cardinality:${classification.cardinality}`]
            : []),
        `severity:${severity}`
    ];
    return {
        classification,
        severity,
        tags
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
    if (c.action === 'read' && c.cardinality === 'global') {
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
    private readonly extensionIds = new Set<string>();

    register(schema: EndpointSchema<any>): void {
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
            meta: deriveMeta(schema, id)
        };
        validateSchema(schema, entry);
        this.map.set(id, entry);
    }

    registerExtension(schema: EndpointSchema<any>): boolean {
        const label =
            typeof schema.endpoint === 'string' && schema.endpoint
                ? schema.endpoint
                : '(unknown endpoint)';
        try {
            const { id, group, name } = deriveEndpointId(schema.endpoint);
            const existing = this.map.get(id);
            if (existing && !this.extensionIds.has(id)) {
                console.warn(
                    `[ext] Skipping extension "${id}": conflicts with builtin`
                );
                return false;
            }
            if (!schema.classification) {
                console.warn(
                    `[ext] Skipping extension "${id}": must declare classification.`
                );
                return false;
            }
            const entry: RegisteredEndpoint = {
                schema,
                id,
                group,
                name,
                meta: deriveMeta(schema, id)
            };
            validateSchema(schema, entry);
            this.map.set(id, entry);
            this.extensionIds.add(id);
            return true;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(
                `[ext] Skipping extension "${label}": ${message}`
            );
            return false;
        }
    }

    get(id: string): RegisteredEndpoint | undefined {
        return this.map.get(id);
    }

    isExtension(id: string): boolean {
        return this.extensionIds.has(id);
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

/** Global singleton — populated by src/api/endpoints/index.ts */
export const registry = new EndpointRegistry();
