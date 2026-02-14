import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

let cachedFreeModels = [];
let lastFetch = 0;
const CACHE_DURATION = 3600000; // 1 hour

// Fetch available free models from OpenRouter
async function getFreeModels() {
  try {
    // Return cached models if still valid
    if (cachedFreeModels.length > 0 && Date.now() - lastFetch < CACHE_DURATION) {
      return cachedFreeModels;
    }

    console.log("Fetching available models from OpenRouter...");
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Filter for free models (where both prompt and completion costs are "0")
    const freeModels = data.data
      .filter(m => {
        const promptPrice = parseFloat(m.pricing?.prompt || "1");
        const completionPrice = parseFloat(m.pricing?.completion || "1");
        return promptPrice === 0 && completionPrice === 0;
      })
      .map(m => m.id)
      .slice(0, 10); // Limit to first 10 free models

    if (freeModels.length === 0) {
      console.warn("No free models found, using fallback list");
      return [
        "meta-llama/llama-3.2-3b-instruct:free",
        "google/gemma-2-9b-it:free"
      ];
    }

    cachedFreeModels = freeModels;
    lastFetch = Date.now();
    
    console.log(`Found ${freeModels.length} free models:`, freeModels);
    return freeModels;

  } catch (err) {
    console.error("Error fetching models:", err.message);
    // Fallback models if API call fails
    return [
      "meta-llama/llama-3.2-3b-instruct:free",
      "google/gemma-2-9b-it:free",
      "microsoft/phi-3-mini-128k-instruct:free"
    ];
  }
}

async function callOpenRouter(prompt, model, timeout = 20000) {
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
  res.send("OpenRouter API with dynamic model discovery running.");
});

// Endpoint to check available free models
app.get("/models", async (req, res) => {
  try {
    const models = await getFreeModels();
    res.json({ 
      free_models: models,
      count: models.length,
      cached: Date.now() - lastFetch < CACHE_DURATION
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/chat", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    // Get list of free models dynamically
    const freeModels = await getFreeModels();
    
    if (freeModels.length === 0) {
      return res.status(503).json({ 
        error: "No free models available at this time" 
      });
    }

    let lastError = null;
    const attemptedModels = [];
    
    // Try each model in sequence
    for (const model of freeModels) {
      try {
        console.log(`Attempting: ${model}`);
        attemptedModels.push(model);
        
        const response = await callOpenRouter(prompt, model);
        const data = await response.json();

        // Log full response for debugging
        console.log(`Response status: ${response.status}`);
        if (!response.ok) {
          console.log(`Error response:`, JSON.stringify(data, null, 2));
        }

        // Success case
        if (response.ok && data.choices?.[0]?.message?.content) {
          console.log(`✓ Success with: ${model}`);
          return res.json({ 
            reply: data.choices[0].message.content,
            model_used: model
          });
        }

        // Error handling
        if (data.error) {
          const errorMsg = typeof data.error === 'string' ? data.error : data.error.message;
          console.log(`✗ Failed: ${errorMsg}`);
          lastError = errorMsg;
          
          // Continue to next model on any error
          continue;
        }

      } catch (err) {
        console.log(`✗ Exception: ${err.message}`);
        lastError = err.message;
        continue;
      }
    }

    // If all models failed
    console.error("All models exhausted");
    res.status(503).json({ 
      error: "All models are currently unavailable. Please try again later.",
      attempted_models: attemptedModels,
      last_error: lastError,
      suggestion: "Try GET /models to see available models"
    });

  } catch (err) {
    console.error("Unexpected error:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
