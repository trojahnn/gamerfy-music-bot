# gamerfy-music-bot

Um bot de música para o [Gamerfy](https://gamerfy.gg): alguém escreve
`/play numb - linkin park` num canal, o bot busca no YouTube, entra na sala de
voz de quem pediu e toca. Fila por servidor, com `/skip`, `/stop`, `/queue` e
`/nowplaying`.

É um consumidor do SDK público [`@gamerfy/bot`](https://www.npmjs.com/package/@gamerfy/bot):
lê mensagens, resolve a busca com o `yt-dlp` e publica o áudio na sala pelo
`voice.play()` do SDK (que roda o `ffmpeg` local para transcodificar para Opus).

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

No servidor onde for instalado, o cargo do bot precisa de: **Ver canais**,
**Ler mensagens** (para ler `/play …`), **Enviar mensagens**, **Conectar** e
**Falar**.

## Variáveis de ambiente

| Variável | Padrão | O que é |
| --- | --- | --- |
| `GAMERFY_BOT_TOKEN` | — (obrigatória) | O token do bot (painel de desenvolvedor do Gamerfy, começa com `gfb_`). |
| `GAMERFY_API_URL` | `https://api.gamerfy.gg` | O backend público. |
| `MUSIC_PREFIX` | `/` | O prefixo dos comandos. |
| `MUSIC_MAX_QUEUE` | `100` | Tamanho máximo da fila por servidor. |
| `YTDLP_PATH` | `yt-dlp` | Caminho do `yt-dlp`, se não estiver no PATH. |

Veja `.env.example`. O `ffmpeg` também precisa estar no PATH (o SDK o usa).

## Rodar localmente

Precisa de Node ≥ 22, `yt-dlp` e `ffmpeg` instalados.

```sh
npm install
cp .env.example .env   # preencha GAMERFY_BOT_TOKEN
npm run build
GAMERFY_BOT_TOKEN=gfb_... node dist/index.js
# ou, em desenvolvimento:
GAMERFY_BOT_TOKEN=gfb_... npm run dev
```

## Deploy no Bunny Magic Containers

A imagem já traz `ffmpeg` e `yt-dlp`:

```sh
docker build -t gamerfy-music-bot .
```

Suba essa imagem no Bunny Magic Containers e defina `GAMERFY_BOT_TOKEN` (e as
outras variáveis, se quiser) como variáveis de ambiente do container — nunca no
build. Num datacenter há UDP de saída, então o bot entra na voz por `direct` e
não depende do relay TURN/TLS.

## O SDK, por enquanto, vem de um tarball

Enquanto o `@gamerfy/bot@0.2.0` não está publicado no npm, a dependência aponta
para o tarball em `vendor/gamerfy-bot-0.2.0.tgz` (gerado com `npm pack` no SDK).
Assim que o `0.2.0` estiver no npm, troque em `package.json`:

```json
"@gamerfy/bot": "^0.2.0"
```

e apague `vendor/`.

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
