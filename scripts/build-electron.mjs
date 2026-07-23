import { build, context } from 'esbuild';
import { rmSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outdir = resolve(root, 'dist/electron');

const watch = process.argv.includes('--watch');

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

// Copy runtime icon assets next to main.js so main-process code (tray,
// BrowserWindow icon, Notification icon) can load them via a stable
// __dirname-relative path in both dev and packaged builds.
for (const name of ['tray-icon.png', 'icon.png']) {
  const src = resolve(root, 'build', name);
  if (existsSync(src)) copyFileSync(src, resolve(outdir, name));
}

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  logLevel: 'info',
  external: ['electron', 'electron-store', 'electron-updater', 'better-sqlite3', 'usb'],
  define: {
    'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production'),
  },
};

const entries = [
  { entryPoints: [resolve(root, 'electron/main.ts')], outfile: resolve(outdir, 'main.js') },
  { entryPoints: [resolve(root, 'electron/preload.ts')], outfile: resolve(outdir, 'preload.js') },
];

if (watch) {
  const { spawn } = await import('node:child_process');
  const contexts = await Promise.all(entries.map((e) => context({ ...shared, ...e })));
  await Promise.all(contexts.map((c) => c.watch()));
  // Initial build then launch electron
  await new Promise((r) => setTimeout(r, 200));
  const electronBin = resolve(root, 'node_modules/.bin/electron');
  const proc = spawn(electronBin, ['dist/electron/main.js', '--enable-logging'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' },
  });
  proc.on('exit', () => process.exit(0));
  process.on('SIGINT', () => proc.kill('SIGINT'));
} else {
  await Promise.all(entries.map((e) => build({ ...shared, ...e })));
}
