import { defineConfig } from 'tsdown';
import fs from 'node:fs';

export default defineConfig({
    entry: {
        cli: 'src/cli.ts',
        'shared/schema': 'src/shared/schema.ts'
    },
    format: 'esm',
    outDir: 'dist',
    dts: true,
    unbundle: true,
    alias: {
        '@': './src'
    },
    copy: [
        { from: 'src/approval/approval-center.html', to: 'dist/approval' }
    ],
    hooks: {
        async 'build:done'(ctx) {
            const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
            const outDir = ctx.options.outDir ?? 'dist';
            const skillDir = `${outDir}/skills/siyuan-cli`;
            // Ship the full skill payload (SKILL.md + resources) into dist so
            // the runtime reads a self-contained, version-stamped copy.
            fs.cpSync('skills/siyuan-cli', skillDir, { recursive: true });
            const srcMd = fs.readFileSync('skills/siyuan-cli/SKILL.md', 'utf-8');
            fs.writeFileSync(
                `${skillDir}/SKILL.md`,
                srcMd.replace(/{{VERSION}}/g, pkg.version)
            );
        }
    }
});
