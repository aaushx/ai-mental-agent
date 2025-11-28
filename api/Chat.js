// api/chat.js  (CommonJS) - Put this file at ai-mental-agent/api/chat.js
// Simple, safe proxy to Gemini. DOES NOT send high-risk messages to Gemini.

const fetch = require("node-fetch"); // node-fetch is available on Vercel; locally you may need to npm i node-fetch
const MODEL = process.env.GEMINI_MODEL || "gemini-1.5-mini";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function detectRisk(text){
  if(!text) return "low";
  const t = text.toLowerCase();
  const high = [
    "suicide","kill myself","want to die","end my life","hurt myself",
    "i want to die","i'll kill myself","i will kill myself"
  ];
  const moderate = [
    "hopeless","worthless","can't go on","cant go on","no reason to live",
    "empty","broken","give up","depressed","i can't"
  ];
  if(high.some(k => t.includes(k))) return "high";
  if(moderate.some(k => t.includes(k))) return "moderate";
  return "low";
}

function buildPrompt(userText){
  return `You are a calm, concise, empathetic assistant. You are NOT a doctor or therapist.
Keep answers short (1-3 sentences), supportive, and give one simple coping action (breathing or grounding).
Do NOT provide medical or diagnostic advice. If the user expresses suicidal intent, instruct them to seek immediate help.
User: ${userText}`;
}

module.exports = async function (req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

    const { message } = req.body || {};
    if (!message) return res.status(400).json({ error: "No message provided" });

    const risk = detectRisk(message);

    if (risk === "high") {
      const crisis = `I’m really sorry you’re feeling this way. I’m not a professional. Please contact immediate help now: TeleMANAS (India) 14416 or Emergency 112. If you are in immediate danger, call your local emergency number.`;
      return res.json({ risk, reply: crisis });
    }

    // No API key? fallback to canned reply (safe)
    if (!GEMINI_API_KEY) {
      return res.json({ risk, reply: "I’m here with you. Try a slow breath: inhale 4s, hold 2s, exhale 6s.", note: "no-api-key" });
    }

    const prompt = buildPrompt(message);
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 200, temperature: 0.6, topP: 0.95 }
    };

    const endpoint = `${GEMINI_BASE}/${MODEL}:generateContent`;
    const apiRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY
      },
      body: JSON.stringify(body)
    });

    const data = await apiRes.json();

    // safe extraction of reply text
    let reply = null;
    if (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content[0] && data.candidates[0].content[0].text) {
      reply = data.candidates[0].content[0].text;
    } else if (data && data.outputs && data.outputs[0] && data.outputs[0].content && data.outputs[0].content[0] && data.outputs[0].content[0].text) {
      reply = data.outputs[0].content[0].text;
    } else if (typeof data === "string") {
      reply = data;
    } else {
      reply = JSON.stringify(data).slice(0, 800);
    }

    if (reply && reply.length > 800) reply = reply.slice(0, 800) + "...";
    return res.json({ risk, reply });

  } catch (err) {
    console.error("api/chat error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
