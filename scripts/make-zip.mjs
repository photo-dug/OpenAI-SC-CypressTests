import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';

const out = fs.createWriteStream('soundcredit-e2e.zip');
const archive = archiver('zip', { zlib: { level: 9 } });

out.on('close', () => console.log(`ZIP created: ${archive.pointer()} bytes`));
archive.on('warning', (err) => { if (err.code !== 'ENOENT') throw err; });
archive.on('error', (err) => { throw err; });
archive.pipe(out);

const ROOT = process.cwd();

function addDir(dir, base = '') {
  archive.directory(path.join(ROOT, dir), path.join(base, dir), (entry) => {
    const p = entry.name;
    if (p.includes('node_modules') || p.includes('.git') || p.includes('cypress/reports') || p.includes('cypress/videos') || p.includes('cypress/screenshots')) {
      return false;
    }
    return entry;
  });
}

['package.json', 'cypress.config.mjs', 'README.md'].forEach((f) => {
  if (fs.existsSync(f)) archive.file(f, { name: f });
});

addDir('cypress');
addDir('tasks');
addDir('scripts');

await archive.finalize();
