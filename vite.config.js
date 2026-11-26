import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Regista em ip.txt quem abre o jogo (data, IP, browser), no servidor de dev e no preview.
// Só as aberturas da página, não cada ficheiro. Não vai para a versão publicada (estática).
const IP_FILE = fileURLToPath(new URL('./ip.txt', import.meta.url));

function logIp(req, _res, next) {
  const isPage = req.method === 'GET' && (req.headers.accept ?? '').includes('text/html');
  if (isPage) {
    const ip = (req.socket.remoteAddress ?? '?').replace(/^::ffff:/, '');
    const ua = (req.headers['user-agent'] ?? '').replace(/\s+/g, ' ');
    try {
      appendFileSync(IP_FILE, `${new Date().toISOString()}\t${ip}\t${req.url}\t${ua}\n`);
    } catch {
      /* nunca deixar o registo partir o jogo */
    }
  }
  next();
}

export default defineConfig({
  plugins: [
    {
      name: 'rainbow-ip-log',
      configureServer(server) {
        server.middlewares.use(logIp);
      },
      configurePreviewServer(server) {
        server.middlewares.use(logIp);
      },
    },
  ],
});
