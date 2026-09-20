FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src src
COPY services/notification-service services/notification-service
EXPOSE 4020
CMD ["node", "services/notification-service/index.js"]
