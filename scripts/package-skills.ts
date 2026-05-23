/**
 * Pack skills/ into brain-landing/public/skills.tar.gz so the
 * lending serves it at https://brain.inite.ai/skills.tar.gz and
 * install.sh can curl it down.
 *
 * Layout inside the tarball:
 *   skills/VERSION
 *   skills/CHANGELOG.md
 *   skills/<skill-name>/SKILL.md
 *
 * Run:
 *   pnpm skills:pack
 */

import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SKILLS_DIR = join(ROOT, 'skills');
const OUT_DIR = join(ROOT, 'brain-landing/public');
const OUT_PATH = join(OUT_DIR, 'skills.tar.gz');
const INSTALL_SRC = join(SKILLS_DIR, 'install.sh');
const INSTALL_DST = join(OUT_DIR, 'install.sh');

function main(): void {
  if (!existsSync(SKILLS_DIR)) {
    console.error(`! skills/ not found at ${SKILLS_DIR}`);
    process.exit(1);
  }
  const version = readFileSync(join(SKILLS_DIR, 'VERSION'), 'utf8').trim();
  mkdirSync(OUT_DIR, { recursive: true });

  // tar -czf out skills/ (relative to ROOT so the archive top-level is `skills/`)
  execSync(`tar -czf "${OUT_PATH}" skills`, { cwd: ROOT, stdio: 'inherit' });

  // Mirror install.sh to the lending so `curl brain.inite.ai/install.sh | sh` works.
  copyFileSync(INSTALL_SRC, INSTALL_DST);

  const size = statSync(OUT_PATH).size;
  const kb = (size / 1024).toFixed(1);
  // eslint-disable-next-line no-console
  console.log(`packed skills v${version} → ${OUT_PATH} (${kb} KB)`);
  // eslint-disable-next-line no-console
  console.log(`copied install.sh → ${INSTALL_DST}`);
}

main();
