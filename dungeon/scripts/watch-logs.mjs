import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logFile = process.env.SEO_DUNGEON_BRIDGE_LOG ||
  path.resolve(__dirname, '..', '.logs', 'bridge.log');
const tailLines = Number.parseInt(process.env.SEO_DUNGEON_LOG_TAIL || '120', 10);

function ensureLogFile() {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  if (!fs.existsSync(logFile)) fs.writeFileSync(logFile, '', 'utf8');
}

function readTail() {
  const text = fs.readFileSync(logFile, 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const tail = lines.slice(-tailLines).join('\n');
  if (tail) process.stdout.write(`${tail}\n`);
  return Buffer.byteLength(text);
}

ensureLogFile();
console.log(`Watching SEO Dungeon bridge log: ${logFile}`);
let offset = readTail();

setInterval(() => {
  try {
    const stat = fs.statSync(logFile);
    if (stat.size < offset) offset = 0;
    if (stat.size === offset) return;

    const stream = fs.createReadStream(logFile, {
      start: offset,
      end: stat.size - 1,
      encoding: 'utf8',
    });
    stream.on('data', (chunk) => process.stdout.write(chunk));
    stream.on('end', () => { offset = stat.size; });
  } catch (err) {
    process.stderr.write(`Log watch error: ${err.message}\n`);
  }
}, 1000);
