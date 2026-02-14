import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// Updated list of VERIFIED free models (as of 2024)
const FREE_MODELS = [
  "meta-llama/llama-3.2-3b-instruct:free",
  "meta-llama/llama-3.2-1b-instruct:free",
  "google/gemma-2-9b-it:free",
  "microsoft/phi-3-mini-128k-instruct:free",
  "microsoft/phi-3-medium-128k-instruct:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "qwen/qwen-2-7b-instruct:free"
];

async function callOpenRouter(prompt, model, timeout = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.YOUR_SITE_URL || "https://localhost:3000",
        "X-Title": process.env.YOUR_APP_NAME || "ChatApp"
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: "user", content: prompt }]
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

app.get("/", (req, res) => {
  res.send("OpenRouter API with auto-fallback running.");
});

app.post("/chat", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    let lastError = null;
    const attemptedModels = [];
    
    // Try each model in sequence
    for (const model of FREE_MODELS) {
      try {
        console.log(`Attempting model: ${model}`);
        attemptedModels.push(model);
        
        const response = await callOpenRouter(prompt, model);
        const data = await response.json();

        // Success case
        if (response.ok && data.choices?.[0]?.message?.content) {
          console.log(`✓ Success with model: ${model}`);
          return res.json({ 
            reply: data.choices[0].message.content,
            model_used: model,
            attempted_models: attemptedModels
          });
        }

        // Error handling
        if (data.error) {
          const errorMsg = data.error.message || data.error;
          console.log(`✗ Model ${model} failed: ${errorMsg}`);
          lastError = errorMsg;
          
          // Skip model if it doesn't exist
          if (
            errorMsg.includes("No endpoints found") ||
            errorMsg.includes("not found") ||
            errorMsg.includes("invalid model")
          ) {
            console.log(`  → Skipping unavailable model`);
            continue;
          }
          
          // Retry on overload/rate limit
          if (
            data.error.code === 429 || 
            errorMsg.includes("overloaded") ||
            errorMsg.includes("rate limit") ||
            errorMsg.includes("capacity")
          ) {
            console.log(`  → Model overloaded, trying next...`);
            continue;
          }
        }

      } catch (err) {
        console.log(`✗ Model ${model} error: ${err.message}`);
        lastError = err.message;
        
        // Continue on timeout or network errors
        if (err.name === 'AbortError' || err.message.includes('timeout')) {
          console.log(`  → Timeout, trying next model...`);
          continue;
        }
        continue;
      }
    }

    // If all models failed
    console.error("All models exhausted");
    res.status(503).json({ 
      error: "All models are currently unavailable. Please try again later.",
      attempted_models: attemptedModels,
      last_error: lastError 
    });

  } catch (err) {
    console.error("Unexpected error:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
