import { defineConfig } from 'tsdown';

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
    }
});
