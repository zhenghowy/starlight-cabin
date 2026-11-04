FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/app/data
EXPOSE 8080
VOLUME ["/app/data"]
CMD ["node", "server/index.js"]
