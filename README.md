# gamerfy-music-bot

Um bot de música para o [Gamerfy](https://gamerfy.gg): alguém escreve
`/play numb - linkin park` num canal, o bot busca no YouTube, entra na sala de
voz de quem pediu e toca. Fila por servidor, com `/skip`, `/stop`, `/queue` e
`/nowplaying`. Também serve uma landing page com o link para adicionar o bot.

É um consumidor do SDK público [`@gamerfy/bot`](https://www.npmjs.com/package/@gamerfy/bot):
lê mensagens, resolve a busca com o `yt-dlp`, transcodifica com o `ffmpeg` para
Ogg Opus e publica na sala pelo `voice.play()` do SDK.

## Comandos

Por prefixo (padrão `/`, veja `MUSIC_PREFIX`):

| Comando | O que faz |
| --- | --- |
| `/play <busca ou URL>` | Busca no YouTube (ou abre a URL), entra na sala de quem pediu e toca; se já toca, entra na fila. Aliases: `/p`, `/tocar`. |
| `/skip` | Pula a faixa atual. Aliases: `/s`, `/next`, `/pular`. |
| `/stop` | Para tudo, esvazia a fila e sai da sala. Aliases: `/leave`, `/sair`, `/parar`. |
| `/queue` | Mostra a fila. Aliases: `/q`, `/fila`. |
| `/nowplaying` | Mostra a faixa atual. Aliases: `/np`, `/agora`. |

## Permissões do bot

O cargo do bot precisa de: **Ver canais**, **Ler mensagens** (para ler
`/play …`), **Enviar mensagens**, **Conectar** e **Falar**.

## Landing page

O bot sobe um servidor HTTP na `PORT` (padrão 80) com uma página que explica o
bot e traz o botão **Adicionar ao Gamerfy** (aponta para `MUSIC_INSTALL_URL`), e
um `GET /health` que responde `ok` (para o health check do container).

## Variáveis de ambiente

| Variável | Padrão | O que é |
| --- | --- | --- |
| `GAMERFY_BOT_TOKEN` | — (obrigatória) | O token do bot (painel de desenvolvedor, começa com `gfb_`). |
| `GAMERFY_API_URL` | `https://api.gamerfy.gg` | O backend público. |
| `MUSIC_PREFIX` | `/` | O prefixo dos comandos. |
| `MUSIC_MAX_QUEUE` | `100` | Tamanho máximo da fila por servidor. |
| `PORT` | `80` | A porta da landing page / health. |
| `MUSIC_INSTALL_URL` | — | O link `https://gamerfy.gg/bot/<clientId>` (do painel de desenvolvedor). Sem ele, a página não mostra o botão. |
| `YTDLP_EXTRA_ARGS` | — | Args extras do `yt-dlp` (ex.: `--cookies /caminho`, um PO token) para o anti-bot do YouTube. |
| `YTDLP_PATH` | `yt-dlp` | Caminho do `yt-dlp`. |
| `FFMPEG_PATH` | `ffmpeg` | Caminho do `ffmpeg`. |

Veja `.env.example`.

## Rodar localmente

Precisa de Node ≥ 22, `yt-dlp` e `ffmpeg` no PATH.

```sh
npm install
cp .env.example .env   # preencha GAMERFY_BOT_TOKEN
npm run build
GAMERFY_BOT_TOKEN=gfb_... PORT=8080 node dist/index.js
# ou, em desenvolvimento:
GAMERFY_BOT_TOKEN=gfb_... PORT=8080 npm run dev
```

## Deploy no Bunny Magic Containers

O Bunny Magic Containers roda uma **imagem** de um registro (Docker Hub ou GHCR;
públicos direto, privados por integração) e só aceita `linux/amd64`.

1. **Build para amd64 e envie a imagem** para um registro. Ex.: GitHub Container
   Registry (GHCR):

   ```sh
   echo "$GHCR_TOKEN" | docker login ghcr.io -u <seu-usuario> --password-stdin
   docker buildx build --platform linux/amd64 \
     -t ghcr.io/<seu-usuario>/gamerfy-music-bot:latest --push .
   ```

2. **No painel do Bunny** (Magic Containers → **Add App**): escolha a imagem
   `ghcr.io/<seu-usuario>/gamerfy-music-bot:latest` (se o pacote for privado no
   GHCR, conecte o registro com **+ Add Registry**).

3. **Variáveis de ambiente:** em *Environment variables*, adicione
   `GAMERFY_BOT_TOKEN` e, se quiser, `MUSIC_INSTALL_URL`, `MUSIC_PREFIX` etc.
   Nunca coloque o token no `Dockerfile`.

4. **Endpoint:** na aba *Endpoints*, aponte um endpoint para a porta **80** do
   container (é onde a landing page e o `/health` respondem).

5. **Deploy:** *Single region* é o mais previsível para um bot sempre no ar (o
   *Magic* escala por atividade, que um bot que só faz conexões de saída quase
   não gera). Clique em **Deploy**.

Num datacenter há UDP de saída, então o bot entra na voz por `direct` e não
depende do relay TURN/TLS.

## O YouTube na prática

Duas realidades do anti-bot do YouTube, importantes para operar:

- **O `yt-dlp` precisa estar atual.** O YouTube muda e quebra versões antigas com `HTTP 403` no download. A imagem baixa o `yt-dlp` **mais recente** no build; reconstrua a imagem de tempos em tempos.
- **A busca demora.** Resolver uma busca faz um handshake anti-bot e leva ~20-30 s por `/play` (o download em si é rápido depois). Se o IP do datacenter for bloqueado, use `YTDLP_EXTRA_ARGS` para passar `--cookies` ou um PO token.

## Nota sobre o YouTube

Tocar do YouTube com `yt-dlp` vai contra os Termos de Serviço do YouTube — foi o
que derrubou os bots Groovy e Rythm em 2021. Este bot foi feito assim porque é o
pedido; o risco é do operador. O resolvedor de áudio fica atrás da interface
`Resolver` (`src/resolver.ts`), então trocar o YouTube por uma fonte licenciada
depois é escrever uma nova classe, não reescrever o bot.

## Testes

```sh
npm run lint
npm run typecheck
npm test
```
