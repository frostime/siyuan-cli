const KERNEL_VERSION_PATTERN =
    /^v?(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?(?:\+[0-9A-Za-z][0-9A-Za-z.-]*)?$/;
const AUTHORED_MINIMUM_PATTERN = /^\d+\.\d+\.\d+$/;

type KernelVersionParts = readonly [
    major: number,
    minor: number,
    patch: number
];

function parseKernelVersion(version: string): KernelVersionParts {
    const match = KERNEL_VERSION_PATTERN.exec(version.trim());
    if (!match) {
        throw new Error(
            `Invalid kernel version "${version}"; expected major.minor.patch.`
        );
    }
    return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isAuthoredKernelVersion(value: string): boolean {
    return AUTHORED_MINIMUM_PATTERN.test(value);
}

export function compareKernelVersions(
    current: string,
    required: string
): number {
    const currentParts = parseKernelVersion(current);
    const requiredParts = parseKernelVersion(required);
    for (let index = 0; index < currentParts.length; index++) {
        const difference = currentParts[index]! - requiredParts[index]!;
        if (difference !== 0) return Math.sign(difference);
    }
    return 0;
}

export function extractKernelVersion(responseData: unknown): string {
    if (typeof responseData === 'string') return responseData;
    if (
        responseData !== null &&
        typeof responseData === 'object' &&
        typeof (responseData as { ver?: unknown }).ver === 'string'
    ) {
        return (responseData as { ver: string }).ver;
    }
    throw new Error(
        'Kernel version response does not contain a version string.'
    );
}
