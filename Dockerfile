# ---------- Stage 1: Ollama + Model ----------
FROM ollama/ollama:latest AS model_stage
RUN ollama pull phi

# ---------- Stage 2: Node.js API ----------
FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
