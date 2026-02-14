import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// List of free models to try in order
const FREE_MODELS = [
  "meta-llama/llama-3.2-3b-instruct:free",
  "google/gemma-2-9b-it:free",
  "microsoft/phi-3-mini-128k-instruct:free",
  "meta-llama/llama-3.2-1b-instruct:free",
  "qwen/qwen-2-7b-instruct:free",
  "huggingfaceh4/zephyr-7b-beta:free"
];

async function callOpenRouter(prompt, model) {
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
    })
  });

  return response;
}

app.get("/", (req, res) => {
  res.send("OpenRouter API with auto-fallback running on Vercel.");
});

app.post("/chat", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    let lastError = null;
    
    // Try each model in sequence
    for (const model of FREE_MODELS) {
      try {
        console.log(`Trying model: ${model}`);
        
        const response = await callOpenRouter(prompt, model);
        const data = await response.json();

        // Check if request was successful
        if (response.ok && data.choices && data.choices[0]) {
          return res.json({ 
            reply: data.choices[0].message.content,
            model_used: model
          });
        }

        // Check for specific errors
        if (data.error) {
          console.log(`Model ${model} failed:`, data.error.message);
          lastError = data.error.message;
          
          // If it's a rate limit or overload, try next model
          if (
            data.error.code === 429 || 
            data.error.message?.includes("overloaded") ||
            data.error.message?.includes("rate limit")
          ) {
            continue; // Try next model
          }
        }
      } catch (err) {
        console.log(`Model ${model} error:`, err.message);
        lastError = err.message;
        continue; // Try next model
      }
    }

    // If all models failed
    res.status(503).json({ 
      error: "All models are currently unavailable",
      last_error: lastError 
    });

  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
