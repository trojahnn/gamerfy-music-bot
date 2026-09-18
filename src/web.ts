// A tiny landing page (and a /health endpoint for the container platform).
// The page tells people what the bot does and links them to add it to a Gamerfy
// server. No dependencies: Node's own http.
import { createServer, type Server } from 'node:http';

export interface WebContext {
  /** The bot's username, once it is connected (`null` before). */
  botName(): string | null;
  /** The Gamerfy install link (`${site}/bot/<clientId>`), or `null`. */
  installUrl: string | null;
  /** The command prefix, shown in the examples. */
  prefix: string;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

export function renderLanding(context: { botName: string | null; installUrl: string | null; prefix: string }): string {
  const name = escapeHtml(context.botName ?? 'Bot de música');
  const p = escapeHtml(context.prefix);
  const button =
    context.installUrl === null
      ? ''
      : `<a class="cta" href="${escapeHtml(context.installUrl)}">Adicionar ao Gamerfy</a>`;
  const commands: [string, string][] = [
    [`${p}play &lt;busca ou URL&gt;`, 'Toca do YouTube na sua sala de voz; se já toca, entra na fila.'],
    [`${p}skip`, 'Pula a faixa atual.'],
    [`${p}stop`, 'Para tudo e sai da sala.'],
    [`${p}queue`, 'Mostra a fila.'],
    [`${p}nowplaying`, 'Mostra a faixa atual.'],
  ];
  const rows = commands.map(([cmd, what]) => `<tr><td><code>${cmd}</code></td><td>${what}</td></tr>`).join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name} — Bot de música do Gamerfy</title>
<style>
  :root { color-scheme: light dark; --bg: #0f0f14; --card: #17171f; --fg: #f2f2f7; --muted: #a1a1b3; --accent: #8b5cf6; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
    font: 16px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: var(--bg); color: var(--fg); }
  main { width: 100%; max-width: 640px; background: var(--card); border: 1px solid #26263300; border-radius: 16px; padding: 32px; }
  h1 { margin: 0 0 8px; font-size: 28px; }
  p.lead { color: var(--muted); margin: 0 0 24px; }
  .cta { display: inline-block; background: var(--accent); color: #fff; text-decoration: none; font-weight: 600;
    padding: 12px 22px; border-radius: 10px; margin-bottom: 28px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 8px 0; border-top: 1px solid #2a2a38; vertical-align: top; }
  td:first-child { white-space: nowrap; padding-right: 16px; }
  code { background: #00000030; padding: 2px 6px; border-radius: 6px; font-size: 14px; }
  footer { margin-top: 24px; color: var(--muted); font-size: 13px; }
  a { color: var(--accent); }
</style>
</head>
<body>
<main>
  <h1>${name}</h1>
  <p class="lead">Toque músicas do YouTube na sua sala de voz do Gamerfy. Escreva <code>${p}play</code> e o nome da música.</p>
  ${button}
  <table>${rows}</table>
  <footer>Um bot da comunidade para o <a href="https://gamerfy.gg">Gamerfy</a>. Precisa de Ver canais, Ler mensagens, Enviar mensagens, Conectar e Falar.</footer>
</main>
</body>
</html>`;
}

export function createWebServer(context: WebContext): Server {
  return createServer((request, response) => {
    const path = (request.url ?? '/').split('?')[0] ?? '/';
    if (request.method === 'GET' && path === '/health') {
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('ok');
      return;
    }
    if (request.method === 'GET' && (path === '/' || path === '/index.html')) {
      const html = renderLanding({ botName: context.botName(), installUrl: context.installUrl, prefix: context.prefix });
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(html);
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('não encontrado');
  });
}
