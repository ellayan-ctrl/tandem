# Stage 1: build the front end
FROM node:22-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js jsconfig.json ./
COPY src ./src
COPY shared ./shared
RUN npm run build

# Stage 2: the Python server, serving the API, the expiry worker and the built front end
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend ./backend
COPY shared ./shared
COPY --from=web /app/dist ./dist
RUN mkdir -p /data
ENV PORT=3000 DB_PATH=/data/twoway.db
EXPOSE 3000
CMD ["python", "-m", "backend"]
