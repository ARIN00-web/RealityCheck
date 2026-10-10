import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dashboardPort = 3000;
const nextBin = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));

await assertPortAvailable(dashboardPort);

const next = spawn(process.execPath, [nextBin, 'dev', '--port', String(dashboardPort)], {
  stdio: 'inherit',
});

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    stopping = true;
    next.kill(signal);
  });
}

next.once('exit', (code, signal) => {
  process.exit(code ?? (stopping || signal ? 0 : 1));
});

function assertPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        reject(
          new Error(
            `Dashboard port ${port} is already in use. Stop the process using port ${port} before running pnpm dev.`,
          ),
        );
        return;
      }
      reject(error);
    });
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}
