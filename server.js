import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Phi model running on Render.");
});

app.post("/chat", async (req, res) => {
  try {
    const { prompt } = req.body;

    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      body: JSON.stringify({ model: "phi", prompt, stream: false }),
      headers: { "Content-Type": "application/json" }
    });

    const data = await response.json();
    res.json({ reply: data.response });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Model error" });
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));
