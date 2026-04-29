import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'pathe';
import { fileURLToPath } from 'node:url';

export interface InitExtensionResult {
    root: string;
    created: string[];
}

export function detectPackageRoot(): string {
    const thisFile = fileURLToPath(import.meta.url);
    return resolve(dirname(thisFile), '..');
}

function toPortablePath(path: string): string {
    return path.replace(/\\/g, '/');
}

function writeFileIfMissing(
    path: string,
    content: string,
    created: string[]
): void {
    if (existsSync(path)) return;
    writeFileSync(path, content, 'utf-8');
    created.push(path);
}

function buildTsconfig(packageRoot: string): string {
    const portableRoot = toPortablePath(packageRoot);
    return `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "noEmit": true,
    "types": ["node"],
    "paths": {
      // [auto-detected] Points to global siyuan-cli install.
      // Works without npm install.
      "@frostime/siyuan-cli": ["${portableRoot}"],
      "@frostime/siyuan-cli/*": ["${portableRoot}/*"],
      // Subpath export for schema types — TS paths cannot infer this from the wildcard above.
      "@frostime/siyuan-cli/schema": ["${portableRoot}/shared/schema.d.mts"]
      // [alternative] If you prefer local node_modules:
      //   npm install --save-dev @frostime/siyuan-cli
      //   Then remove the paths above.
    }
  },
  "include": ["apis/**/*.ts", "tools/**/*.ts"]
}
`;
}

export function scaffoldExtensionDir(root: string): InitExtensionResult {
    const created: string[] = [];
    const apisDir = join(root, 'apis');
    const toolsDir = join(root, 'tools');

    mkdirSync(apisDir, { recursive: true });
    mkdirSync(toolsDir, { recursive: true });

    writeFileIfMissing(join(root, '.gitignore'), 'node_modules/\n*.schema.json\n', created);
    writeFileIfMissing(join(root, 'tsconfig.json'), buildTsconfig(detectPackageRoot()), created);
    writeFileIfMissing(join(apisDir, '.gitkeep'), '', created);
    writeFileIfMissing(join(toolsDir, '.gitkeep'), '', created);

    return { root, created };
}
