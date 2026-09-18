import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createWebServer, renderLanding, type WebContext } from '../web.js';

describe('renderLanding', () => {
  it('shows the name, the commands and the install button', () => {
    const html = renderLanding({ botName: 'DJ Bot', installUrl: 'https://gamerfy.gg/bot/abc123', prefix: '/' });
    expect(html).toContain('DJ Bot');
    expect(html).toContain('Adicionar ao Gamerfy');
    expect(html).toContain('href="https://gamerfy.gg/bot/abc123"');
    expect(html).toContain('/play');
  });

  it('omits the install button when there is no install URL', () => {
    const html = renderLanding({ botName: null, installUrl: null, prefix: '/' });
    expect(html).not.toContain('Adicionar ao Gamerfy');
    expect(html).toContain('Bot de música'); // the fallback name
  });

  it('honours a custom prefix in the examples', () => {
    expect(renderLanding({ botName: null, installUrl: null, prefix: '!' })).toContain('!play');
  });

  it('escapes the bot name', () => {
    const html = renderLanding({ botName: '<script>alert(1)</script>', installUrl: null, prefix: '/' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('createWebServer', () => {
  let close: (() => Promise<void>) | null = null;

  afterEach(async () => {
    if (close !== null) await close();
    close = null;
  });

  async function start(context: WebContext): Promise<string> {
    const server = createWebServer(context);
    const port = await new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
    });
    close = () => new Promise<void>((resolve) => server.close(() => resolve()));
    return `http://127.0.0.1:${String(port)}`;
  }

  it('serves /health, the landing page, and 404s the rest', async () => {
    const base = await start({ botName: () => 'DJ Bot', installUrl: 'https://gamerfy.gg/bot/x', prefix: '/' });

    const health = await fetch(`${base}/health`);
    expect(health.status).toBe(200);
    expect(await health.text()).toBe('ok');

    const page = await fetch(`${base}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(await page.text()).toContain('DJ Bot');

    const missing = await fetch(`${base}/nope`);
    expect(missing.status).toBe(404);
  });
});
