FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN node scripts/build-pages.js
ENV NODE_ENV=production PORT=3000 DATABASE_PATH=/data/sokoni.sqlite
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "server.js"]
