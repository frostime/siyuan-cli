// scripts/capture-approval.mjs
// Trigger approval, extract URL, screenshot via Edge headless
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT = 'H:/SrcCode/playground/siyuan-cli';
const ASSETS = join(PROJECT, 'assets');
mkdirSync(ASSETS, { recursive: true });

const OUT = join(ASSETS, 'approval-center.png');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

console.log('[1/3] Triggering approval...');
const child = spawn('node', [join(PROJECT, 'bin', 'siyuan.mjs'), 'api', 'system.currentTime'], {
    cwd: PROJECT,
    env: { ...process.env, SIYUAN_CLI_WORKSPACE: 'local', NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
});

let stderr = '';
let url = null;

child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
    // Look for APPROVAL_PENDING and extract URL
    const m = stderr.match(/"url"\s*:\s*"(http:\/\/[^"]+)"/);
    if (m && !url) {
        url = m[1];
        console.log('   URL:', url);

        console.log('[2/3] Screenshotting via Edge headless...');
        try {
            execSync(`"${EDGE}" --headless=new --disable-gpu --screenshot="${OUT}" --window-size=1200,900 "${url}"`, {
                timeout: 15000,
                stdio: 'pipe'
            });
            console.log('   Saved:', OUT);
        } catch (e) {
            console.error('   Edge screenshot failed:', e.message);
        }

        console.log('[3/3] Cleaning up...');
        child.kill('SIGTERM');
        setTimeout(() => { child.kill('SIGKILL'); process.exit(0); }, 1000);
    }
});

child.on('close', (code) => {
    if (!url) {
        console.error('ERROR: No approval URL captured. stderr:', stderr);
        process.exit(1);
    }
});

// Timeout in case approval never arrives
setTimeout(() => {
    if (!url) {
        console.error('ERROR: Timeout waiting for approval. stderr:', stderr);
        child.kill();
        process.exit(1);
    }
}, 30000);
