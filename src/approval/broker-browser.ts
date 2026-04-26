/**
 * Browser opening for the Approval Center.
 *
 * Tries platform-specific commands in sequence.
 * Returns true on first successful launch.
 */
import { execFile, spawn } from 'node:child_process';

async function tryOpenCommand(
    command: { cmd: string; args: string[]; useExec?: boolean }
): Promise<boolean> {
    return await new Promise<boolean>((resolve) => {
        try {
            if (command.useExec) {
                execFile(
                    command.cmd,
                    command.args,
                    {
                        windowsHide: true
                    },
                    (error) => {
                        resolve(!error);
                    }
                );
                return;
            }

            const child = spawn(command.cmd, command.args, {
                detached: true,
                stdio: 'ignore',
                ...(process.platform === 'win32'
                    ? { windowsHide: true }
                    : {})
            });
            child.once('error', () => resolve(false));
            child.once('spawn', () => {
                child.unref();
                resolve(true);
            });
        } catch {
            resolve(false);
        }
    });
}

export async function openApprovalBrowser(url: string): Promise<boolean> {
    const commands =
        process.platform === 'win32'
            ? [
                  {
                      cmd: 'powershell.exe',
                      args: ['-NoProfile', '-Command', `Start-Process ${JSON.stringify(url)}`],
                      useExec: true
                  },
                  {
                      cmd: 'cmd.exe',
                      args: ['/c', 'start', '', url],
                      useExec: true
                  },
                  {
                      cmd: 'rundll32.exe',
                      args: ['url.dll,FileProtocolHandler', url],
                      useExec: true
                  },
                  {
                      cmd: 'explorer.exe',
                      args: [url],
                      useExec: true
                  }
              ]
            : process.platform === 'darwin'
              ? [{ cmd: 'open', args: [url] }]
              : [{ cmd: 'xdg-open', args: [url] }];

    for (const command of commands) {
        if (await tryOpenCommand(command)) {
            return true;
        }
    }
    return false;
}
