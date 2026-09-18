# Imagem para o Bunny Magic Containers (só linux/amd64): Node 22 + ffmpeg + yt-dlp
# + o bot buildado. O bot conecta de saída ao backend público do Gamerfy; num
# datacenter há UDP de saída, então a voz entra por `direct` (não depende do relay
# TURN/TLS). Ele também serve uma landing page na porta 80.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ARG TARGETARCH
# ffmpeg: o resolvedor transcodifica o áudio para Ogg Opus com ele.
# yt-dlp: binário standalone (sem python), escolhido pela arquitetura do build.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
 && case "${TARGETARCH:-amd64}" in \
      amd64) YTDLP=yt-dlp_linux ;; \
      arm64) YTDLP=yt-dlp_linux_aarch64 ;; \
      *) echo "arquitetura ${TARGETARCH} não tem yt-dlp standalone" >&2; exit 1 ;; \
    esac \
 && curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YTDLP}" -o /usr/local/bin/yt-dlp \
 && chmod +x /usr/local/bin/yt-dlp \
 && /usr/local/bin/yt-dlp --version \
 && apt-get purge -y curl \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# A landing page / health; o GAMERFY_BOT_TOKEN é env do container, nunca do build.
EXPOSE 80
CMD ["node", "dist/index.js"]
