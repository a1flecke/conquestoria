import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const appPath = join(root, 'src-tauri', 'target', 'release', 'bundle', 'macos', 'Conquestoria.app');
const dmgDir = join(root, 'src-tauri', 'target', 'release', 'bundle', 'dmg');

const failures = [];

if (!existsSync(appPath)) {
  failures.push(`Missing app bundle: ${appPath}`);
}

let dmgFiles = [];
if (existsSync(dmgDir)) {
  dmgFiles = readdirSync(dmgDir).filter(file => file.endsWith('.dmg'));
}

if (dmgFiles.length === 0) {
  failures.push(`Missing dmg artifact in: ${dmgDir}`);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Found app bundle: ${appPath}`);
console.log(`Found dmg artifact(s): ${dmgFiles.join(', ')}`);
