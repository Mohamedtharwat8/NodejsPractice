FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY packages/contracts packages/contracts
COPY src/modules/ai src/modules/ai
COPY services/ai-service services/ai-service
EXPOSE 4010
CMD ["node", "services/ai-service/index.js"]
