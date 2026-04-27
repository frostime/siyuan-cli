/**
 * argv → payload parser.
 * Handles: --json/-j, --file/-f, named flags, positional (primary), input sources.
 * See reference/siyuan-cli-design/04-module-api.md §3.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'pathe';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { EndpointSchema, JSONSchema, InputSource } from './schema.js';
import { CliError, ExitCode } from './errors.js';

// ─── AJV setup ────────────────────────────────────────────────────────────────

const ajv = new Ajv({ allErrors: true, coerceTypes: false });
addFormats(ajv);

// ─── Input source resolution ──────────────────────────────────────────────────

let stdinConsumed = false;

function readStdin(): string {
    if (stdinConsumed) {
        throw new CliError(
            ExitCode.GENERAL,
            'STDIN_CONFLICT',
            '@stdin can only be used once per invocation.'
        );
    }
    if (process.stdin.isTTY) {
        throw new CliError(
            ExitCode.GENERAL,
            'STDIN_IS_TTY',
            '@stdin requested but stdin is a terminal (nothing is piped in).',
            'Pipe a value via `command | siyuan ...` or use @file:<path> instead.'
        );
    }
    stdinConsumed = true;
    return readFileSync(process.stdin.fd, 'utf-8');
}

function resolveInputSource(
    field: string,
    value: string,
    allowedSources: InputSource[]
): string {
    // @file:<path>
    if (value.startsWith('@file:') && allowedSources.includes('file')) {
        const filePath = resolve(value.slice('@file:'.length));
        try {
            return readFileSync(filePath, 'utf-8');
        } catch {
            throw new CliError(
                ExitCode.GENERAL,
                'FILE_READ_ERROR',
                `Cannot read file for --${field}: ${filePath}`
            );
        }
    }
    // Escaped: @@file: → @file: literal
    if (value.startsWith('@@')) {
        return value.slice(1);
    }

    // @stdin or "-"
    if (
        (value === '@stdin' || value === '-') &&
        allowedSources.includes('stdin')
    ) {
        return readStdin();
    }

    // @env:<VAR>
    if (value.startsWith('@env:') && allowedSources.includes('env')) {
        const varName = value.slice('@env:'.length);
        const envVal = process.env[varName];
        if (envVal === undefined) {
            throw new CliError(
                ExitCode.GENERAL,
                'ENV_NOT_SET',
                `Environment variable ${varName} is not set (for --${field}).`
            );
        }
        return envVal;
    }

    // Literal (pass through as-is)
    return value;
}

// ─── Payload assembly ─────────────────────────────────────────────────────────

export interface ParsePayloadOptions {
    schema: EndpointSchema;
    /** Raw argv after command name. Already parsed by citty into args object. */
    args: Record<string, unknown>;
    /** Positional argument value (if any). */
    positional?: string;
    /** Validate with ajv before returning. */
    validate?: boolean;
}

export function parsePayload(
    opts: ParsePayloadOptions
): Record<string, unknown> {
    const { schema, args, positional, validate = true } = opts;
    stdinConsumed = false; // reset per invocation

    let base: Record<string, unknown> = {};

    // 1. --json / -j: base payload from inline JSON string
    const jsonArg = (args['json'] ?? args['j']) as string | undefined;
    if (jsonArg) {
        try {
            base = JSON.parse(jsonArg) as Record<string, unknown>;
        } catch {
            throw new CliError(
                ExitCode.GENERAL,
                'INVALID_JSON',
                `Invalid JSON in --json: ${jsonArg}`
            );
        }
    }

    // 2. --file / -f: base payload from JSON file (or stdin via "-")
    const fileArg = (args['file'] ?? args['f']) as string | undefined;
    if (fileArg) {
        let content: string;
        if (fileArg === '-') {
            content = readStdin();
        } else {
            try {
                content = readFileSync(resolve(fileArg), 'utf-8');
            } catch {
                throw new CliError(
                    ExitCode.GENERAL,
                    'FILE_READ_ERROR',
                    `Cannot read payload file: ${fileArg}`
                );
            }
        }
        try {
            base = JSON.parse(content) as Record<string, unknown>;
        } catch {
            throw new CliError(
                ExitCode.GENERAL,
                'INVALID_JSON',
                `Invalid JSON in file ${fileArg}`
            );
        }
    }

    // 3. Positional argument → schema.cli.primary field
    if (positional !== undefined && schema.cli?.primary) {
        const field = schema.cli.primary;
        const allowedSources = schema.cli?.allowSource?.[field] ?? ['literal'];
        base[field] = resolveInputSource(field, positional, allowedSources);
    }

    const props = schema.payload.properties;

    // 4. Named flags: --<field> <value> (override base)
    for (const [field, propSchema] of Object.entries(props)) {
        // Skip payload-mode flags
        if (field === 'json' || field === 'file') continue;

        const rawVal = args[field];
        if (rawVal === undefined) continue;

        const allowedSources = schema.cli?.allowSource?.[field] ?? ['literal'];

        if (Array.isArray(rawVal)) {
            // Array field: multiple --field val
            base[field] = rawVal.map((v) =>
                resolveInputSource(field, String(v), allowedSources)
            );
        } else if (typeof rawVal === 'string') {
            const resolved = resolveInputSource(field, rawVal, allowedSources);
            // Auto-parse based on declared type
            if (propSchema.type === 'object' || propSchema.type === 'array') {
                try {
                    base[field] = JSON.parse(resolved);
                } catch {
                    base[field] = resolved;
                }
            } else if (propSchema.type === 'integer') {
                base[field] = Number.parseInt(resolved, 10);
            } else if (propSchema.type === 'number') {
                base[field] = Number(resolved);
            } else if (propSchema.type === 'boolean') {
                base[field] = resolved === 'true';
            } else {
                base[field] = resolved;
            }
        } else {
            base[field] = rawVal;
        }
    }

    // 5. Apply defaults from schema
    for (const [field, propSchema] of Object.entries(props)) {
        if (base[field] === undefined && propSchema.default !== undefined) {
            base[field] = propSchema.default;
        }
    }

    // 6. AJV validation
    if (validate) {
        const valid = ajv.validate(schema.payload as object, base);
        if (!valid) {
            const errors = ajv
                .errors!.map(
                    (e) => `${e.instancePath || 'payload'} ${e.message}`
                )
                .join('; ');
            throw new CliError(
                ExitCode.GENERAL,
                'PAYLOAD_INVALID',
                `Payload validation failed: ${errors}`
            );
        }
    }

    return base;
}

// ─── Help text generation ─────────────────────────────────────────────────────

export function buildEndpointHelp(endpoint: {
    id: string;
    schema: EndpointSchema;
    meta?: { tags?: string[] };
}): string {
    const { id, schema, meta } = endpoint;
    const lines: string[] = [];

    lines.push(schema.summary);
    lines.push('');
    lines.push('USAGE');

    if (schema.cli?.primary) {
        lines.push(`  siyuan api ${id} <${schema.cli.primary}>`);
    }
    lines.push(`  siyuan api ${id} [--<field> <value>...]`);
    lines.push(`  siyuan api ${id} -j '<json>'`);
    lines.push(`  siyuan api ${id} -f <file>`);
    lines.push('');

    lines.push('ENDPOINT');
    lines.push(`  POST ${schema.endpoint}`);
    const tags = meta?.tags;
    if (tags?.length) {
        lines.push(`  Tags: ${tags.join(', ')}`);
    }
    lines.push('');

    lines.push('PARAMETERS');
    const props = schema.payload.properties;
    const required = new Set(schema.payload.required ?? []);
    for (const [field, propSchema] of Object.entries(props)) {
        const req = required.has(field) ? 'required' : 'optional';
        const primary = schema.cli?.primary === field ? ' ← primary' : '';
        const defaultStr =
            propSchema.default !== undefined
                ? ` (default: ${JSON.stringify(propSchema.default)})`
                : '';
        lines.push(
            `  --${field}  <${propSchema.type ?? 'string'}>  ${req}${primary}${defaultStr}`
        );
        if (propSchema.description) {
            lines.push(`        ${propSchema.description}`);
        }
        if (propSchema.enum) {
            lines.push(`        Allowed: ${propSchema.enum.join(' | ')}`);
        }
    }
    lines.push('');

    // Input sources
    const allowSource = schema.cli?.allowSource;
    if (allowSource && Object.keys(allowSource).length > 0) {
        lines.push('INPUT SOURCES');
        for (const [field, sources] of Object.entries(allowSource)) {
            lines.push(`  ${field}: ${sources.join(' | ')}`);
        }
        lines.push('');
    }

    lines.push('PAYLOAD MODES');
    lines.push('  -j, --json <json>   Pass JSON payload inline');
    lines.push('  -f, --file <path>   Load JSON payload from file (- = stdin)');
    lines.push('');

    lines.push('OUTPUT');
    lines.push('  default: --print compact → stdout prints endpoint compact text or JSON fallback');
    lines.push('  --print json: stdout prints raw result JSON');
    lines.push('');

    if (schema.cli?.examples?.length) {
        lines.push('EXAMPLES');
        for (const ex of schema.cli.examples) {
            lines.push(`  ${ex.command}`);
            if (ex.description) lines.push(`      ${ex.description}`);
        }
        lines.push('');
    }

    if (schema.description) {
        lines.push('DESCRIPTION');
        for (const line of schema.description.split('\n')) {
            lines.push(`  ${line}`);
        }
    }

    return lines.join('\n');
}
