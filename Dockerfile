# The whole game in one container: the API, the world database, and the built
# site. One process, one port.
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# The world lives here. Mount a volume on it or the map resets on redeploy.
ENV CLANS_DB=/data/clans.db
VOLUME /data

ENV PORT=8787
EXPOSE 8787
CMD ["node", "server/index.js"]
