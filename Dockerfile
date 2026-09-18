# Imagem para o Bunny Magic Containers: Node 22 + ffmpeg + yt-dlp + o bot buildado.
# O bot conecta de saída ao backend público do Gamerfy; num datacenter há UDP de
# saída, então a voz entra por `direct` (não depende do relay TURN/TLS).

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runtime
# ffmpeg: o SDK transcodifica o áudio para Opus com ele.
# yt-dlp: binário standalone (não precisa de python). Em ARM troque por yt-dlp_linux_aarch64.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
 && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp \
 && chmod +x /usr/local/bin/yt-dlp \
 && /usr/local/bin/yt-dlp --version \
 && apt-get purge -y curl \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# GAMERFY_BOT_TOKEN é obrigatório (variável de ambiente do container, nunca no build).
CMD ["node", "dist/index.js"]
