# One Railway service. Node 22 runs the API and the built editor.
# FFmpeg is installed for probe, analysis, and preview files.
# Do not copy a database or uploads into this image. Those live on a volume.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/src ./src
ENV NODE_ENV=production
EXPOSE 8787
# Railway sets PORT. The process binds 0.0.0.0 when that variable is present.
# Local `npm run server` without PORT stays on 127.0.0.1.
CMD ["npm", "run", "server"]
