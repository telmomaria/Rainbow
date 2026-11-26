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

const sorted = [...lines].sort();
writeFileSync(IP_FILE, sorted.join('\n') + '\n');

// Mostra as visitas no terminal: hora de Lisboa · IP · sítio · aparelho.
const device = (ua) =>
  /curl/i.test(ua) ? 'curl (teste)' :
  /Headless|bot|crawler|spider/i.test(ua) ? 'robô' :
  /iPad/.test(ua) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' :
  /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : ua.slice(0, 30);
const fmt = new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', dateStyle: 'short', timeStyle: 'short' });
for (const l of sorted) {
  const p = l.split('\t');
  const local = p[1] && /^[\d:.a-f]+$/i.test(p[1]) && (p[1].startsWith('127.') || p[1] === '::1' || p[1].startsWith('192.168.'));
  const when = Number.isNaN(Date.parse(p[0])) ? p[0] : fmt.format(new Date(p[0]));
  // Linhas do servidor local (vite.config.js): data · IP · página · browser. Da Vercel: data · IP · país · cidade · browser.
  const place = p.length >= 5 ? [p[3], p[2]].filter(Boolean).join(', ') : local ? 'rede local' : '(local)';
  console.log(`${when.padEnd(17)}  ${(p[1] ?? '').padEnd(39)}  ${place.padEnd(24)}  ${device(p.at(-1) ?? '')}`);
}
console.log(`\n${sorted.length} visitas (${lines.size - before} novas) — tudo em ip.txt.`);
