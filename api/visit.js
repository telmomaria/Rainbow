import { put } from '@vercel/blob';

// Função da Vercel: o jogo chama-a ao abrir. Guarda uma linha por visita (data, IP, país, cidade, browser)
// como blob privado em visitas/. `npm run ips` junta-as no ip.txt local. Precisa de BLOB_READ_WRITE_TOKEN
// (criado pela Vercel ao ligar um Blob store ao projeto); sem ele não guarda nada e o jogo segue igual.
export default async function handler(req, res) {
  const h = req.headers;
  const ip = String(h['x-forwarded-for'] ?? '').split(',')[0].trim() || String(h['x-real-ip'] ?? '?');
  const country = String(h['x-vercel-ip-country'] ?? '');
  let city = String(h['x-vercel-ip-city'] ?? '');
  try { city = decodeURIComponent(city); } catch { /* fica como veio */ }
  const ua = String(h['user-agent'] ?? '').replace(/\s+/g, ' ');
  const when = new Date().toISOString();
  const line = [when, ip, country, city, ua].join('\t') + '\n';
  try {
    await put(`visitas/${when.replace(/[:.]/g, '-')}.txt`, line, {
      access: 'private',
      addRandomSuffix: true,
      contentType: 'text/plain; charset=utf-8',
    });
  } catch (err) {
    console.error('visit: não gravou', err);
  }
  res.status(204).end();
}
