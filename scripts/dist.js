const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const inputDirectory = path.join(root, 'dist');
const outputDirectory = path.join(root, 'publish');
const manifest = JSON.parse(fs.readFileSync(path.join(inputDirectory, 'manifest.json'), 'utf8'));
const outputFile = path.join(outputDirectory, `${manifest.id}.jpl`);
const manifestOutputFile = path.join(outputDirectory, `${manifest.id}.json`);
const inputFiles = ['index.js', 'manifest.json', 'webview.js', 'webview.css'];

function writeString(header, offset, length, value) {
  header.write(value, offset, Math.min(length, Buffer.byteLength(value)), 'utf8');
}

function writeOctal(header, offset, length, value) {
  const octal = value.toString(8).padStart(length - 1, '0');
  writeString(header, offset, length, `${octal}\0`);
}

function createHeader(name, size) {
  const header = Buffer.alloc(512);
  writeString(header, 0, 100, name);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, Math.floor(Date.now() / 1000));
  header.fill(0x20, 148, 156);
  header[156] = '0'.charCodeAt(0);
  writeString(header, 257, 6, 'ustar\0');
  writeString(header, 263, 2, '00');

  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  const checksumText = checksum.toString(8).padStart(6, '0');
  writeString(header, 148, 8, `${checksumText}\0 `);
  return header;
}

function createTar(files) {
  const parts = [];
  for (const file of files) {
    parts.push(createHeader(file.name, file.contents.length), file.contents);
    const padding = (512 - (file.contents.length % 512)) % 512;
    if (padding) parts.push(Buffer.alloc(padding));
  }
  parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}

const files = inputFiles.map(name => ({
  name,
  contents: fs.readFileSync(path.join(inputDirectory, name)),
}));

fs.rmSync(outputDirectory, { recursive: true, force: true });
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(outputFile, createTar(files));
fs.copyFileSync(path.join(inputDirectory, 'manifest.json'), manifestOutputFile);
console.log(`Created ${path.relative(root, outputFile)}`);
console.log(`Created ${path.relative(root, manifestOutputFile)}`);
