# The whole game in one container: the API, the world database, and the built
# site. One process, one port.
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# With DATABASE_URL set the world lives in that hosted database and this
# directory is unused. Without it the game runs its own Postgres in-process
# against this folder, so mount a volume or the map resets on redeploy.
ENV CLANS_DB_DIR=/data/pg
VOLUME /data

ENV PORT=8787
EXPOSE 8787
CMD ["node", "server/index.js"]
