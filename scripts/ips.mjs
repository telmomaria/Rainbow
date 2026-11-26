// npm run ips — vai buscar as visitas guardadas na Vercel (Blob, visitas/) e junta-as ao ip.txt local
// (sem repetir linhas, por ordem de data). Precisa de BLOB_READ_WRITE_TOKEN no .env.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { get, list } from '@vercel/blob';

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('Falta BLOB_READ_WRITE_TOKEN no .env (Vercel → Storage → o Blob store → .env.local).');
  process.exit(1);
}

const IP_FILE = fileURLToPath(new URL('../ip.txt', import.meta.url));
const lines = new Set(existsSync(IP_FILE) ? readFileSync(IP_FILE, 'utf8').split('\n').filter(Boolean) : []);
const before = lines.size;

let cursor;
do {
  const page = await list({ prefix: 'visitas/', cursor, limit: 1000 });
  for (const b of page.blobs) {
    const r = await get(b.pathname, { access: 'private' });
    if (!r?.stream) continue;
    const text = await new Response(r.stream).text();
    for (const l of text.split('\n')) if (l.trim()) lines.add(l);
  }
  cursor = page.hasMore ? page.cursor : undefined;
} while (cursor);

writeFileSync(IP_FILE, [...lines].sort().join('\n') + '\n');
console.log(`ip.txt: ${lines.size} linhas (${lines.size - before} novas).`);
