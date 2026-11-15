FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
ENV DATABASE_FILES_DIR=/app/database
COPY backend/package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY backend/src ./src
COPY database ./database
USER node
EXPOSE 3000
CMD ["npm","start"]
