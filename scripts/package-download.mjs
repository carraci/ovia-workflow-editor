import fs from 'node:fs';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';

// Generate the portable download from tracked source and pre-generated exports.
// This runs on any Node.js build host and does not need Python or OVIA credentials.
const root = process.cwd();
const target = path.join(root, 'public/exports/ovia-deliverables.zip');
const walk = directory => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
const directories = ['app', 'components', 'lib', 'scripts', 'data', 'public/exports'];
const files = directories.flatMap(directory => fs.existsSync(path.join(root, directory)) ? walk(path.join(root, directory)) : [])
  .filter(file => !file.endsWith('.zip'));
for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'next.config.ts', 'postcss.config.mjs', 'next-env.d.ts', '.gitignore', '.gitattributes', 'README.md', 'start-editor.ps1']) {
  const file = path.join(root, name);
  if (fs.existsSync(file)) files.push(file);
}
const table = Array.from({ length: 256 }, (_, i) => {
  let value = i;
  for (let j = 0; j < 8; j++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = table[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
const parts = [], entries = [];
let offset = 0;
for (const file of files.sort()) {
  const name = Buffer.from('ovia-workflow-editor/' + path.relative(root, file).replaceAll('\\', '/'));
  const raw = fs.readFileSync(file), compressed = deflateRawSync(raw, { level: 6 }), crc = crc32(raw);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(8, 8); header.writeUInt16LE(0x0021, 12);
  header.writeUInt32LE(crc, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(raw.length, 22);
  header.writeUInt16LE(name.length, 26);
  parts.push(header, name, compressed);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10); central.writeUInt16LE(0x0021, 14);
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
  entries.push(central, name);
  offset += header.length + name.length + compressed.length;
}
const index = Buffer.concat(entries), end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(index.length, 12); end.writeUInt32LE(offset, 16);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, Buffer.concat([...parts, index, end]));
console.log(`Generated portable ZIP download (${files.length} files).`);
