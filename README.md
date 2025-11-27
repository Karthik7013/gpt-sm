# Phi Model API (Render Deployment)

Deploys a lightweight Phi model on Render using Docker + Ollama.

## Local Run
Install Ollama:
https://ollama.com/download

```
ollama pull phi
ollama serve
npm install
node server.js
```

## Render Deployment
Push to GitHub → Render → New Web Service → Docker Runtime.
