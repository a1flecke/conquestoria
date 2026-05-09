import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const appPath = join(root, 'src-tauri', 'target', 'release', 'bundle', 'macos', 'Conquestoria.app');

const failures = [];

if (!existsSync(appPath)) {
  failures.push(`Missing app bundle: ${appPath}`);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Found app bundle: ${appPath}`);
