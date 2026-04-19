/**
 * Structured error model for siyuan-cli.
 * All errors are written to stderr as JSON; exit codes are typed.
 */

export const ExitCode = {
    OK: 0,
    GENERAL: 1,
    CONFIG: 2, // missing workspace, invalid config
    NETWORK: 3, // ECONNREFUSED, timeout
    AUTH: 4, // 401 / token rejected
    PERMISSION: 5 // denied by permission engine
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

export interface CliErrorJson {
    error: string;
    message: string;
    hint?: string;
    details?: unknown;
}

export class CliError extends Error {
    constructor(
        public readonly code: ExitCodeValue,
        public readonly errorType: string,
        message: string,
        public readonly hint?: string,
        public readonly details?: unknown
    ) {
        super(message);
        this.name = 'CliError';
    }

    toJson(): CliErrorJson {
        return {
            error: this.errorType,
            message: this.message,
            ...(this.hint ? { hint: this.hint } : {}),
            ...(this.details !== undefined ? { details: this.details } : {})
        };
    }
}

/** Write error JSON to stderr and exit. */
export function fatalError(err: CliError): never {
    process.stderr.write(JSON.stringify(err.toJson()) + '\n');
    process.exit(err.code);
}

/** Wrap unknown thrown values into a CliError. */
export function toCliError(e: unknown): CliError {
    if (e instanceof CliError) return e;

    const msg = e instanceof Error ? e.message : String(e);

    // Node.js network errors
    if (e instanceof Error) {
        const code = (e as NodeJS.ErrnoException).code;
        if (code === 'ECONNREFUSED' || code === 'ECONNRESET') {
            return new CliError(
                ExitCode.NETWORK,
                'ECONNREFUSED',
                msg,
                'Is SiYuan running?'
            );
        }
        if (code === 'ETIMEDOUT' || msg.includes('timed out')) {
            return new CliError(
                ExitCode.NETWORK,
                'ETIMEDOUT',
                msg,
                'Check your baseUrl or network.'
            );
        }
    }

    return new CliError(ExitCode.GENERAL, 'ERROR', msg);
}
