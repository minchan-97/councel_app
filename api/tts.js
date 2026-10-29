// AI 목소리: 캐릭터의 말을 OpenAI 음성으로 만든다 (mp3).
// 걱정·위기 상황에서는 고른 스타일과 상관없이 차분한 목소리.
import { enabled, getStudent, countTtsToday, logTts } from "../lib/db.js";
import { TTS, TTS_VOICES, TTS_STYLES, TTS_PERSONALITY, TTS_CALM, PERSONALITIES } from "../lib/config.js";

const clean = (t) =>
  String(t || "")
    .replace(/https?:\S+/g, "")
    .replace(/[ㅋㅎ]{2,}/g, " ")
    .replace(/[ㅠㅜ]+/g, " ")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TTS.maxChars);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { code, text, voice, style, personality, calm } = req.body || {};
  const input = clean(text);
  if (!input) return res.status(400).json({ error: "읽을 말이 없어요." });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "AI 목소리가 아직 설정되지 않았어요." });

  try {
    const s = await getStudent(String(code || "").trim());
    if (!s || s.active === false || (enabled && !s.guardian_consent))
      return res.status(403).json({ error: "입장 코드를 다시 확인해 주세요." });

    const used = await countTtsToday(s.id);
    if (used >= TTS.dailyLimit)
      return res.status(429).json({ error: "오늘 AI 목소리를 다 썼어요. 내일 다시 쓸 수 있어요. 지금은 기기 목소리로 읽을게요." });

    const v = TTS_VOICES[voice] ? voice : "nova";
    const instructions = [
      "You are voicing a friendly AI character in a chat app for kids and teens. Speak natural, fluent Korean.",
      calm ? TTS_CALM : (TTS_STYLES[style] || TTS_STYLES.cheerful).text,
      calm ? "" : TTS_PERSONALITY[PERSONALITIES[personality] ? personality : "warm"] || "",
    ].filter(Boolean).join(" ");

    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: TTS.model, voice: v, input, instructions, response_format: "mp3" }),
    });
    if (!r.ok) throw new Error(`openai tts ${r.status}: ${await r.text()}`);
    const audio = Buffer.from(await r.arrayBuffer());

    await logTts(s.id, input.length).catch((e) => console.error("tts log failed:", e.message));
    res.setHeader("content-type", "audio/mpeg");
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-tts-remaining", String(Math.max(0, TTS.dailyLimit - used - 1)));
    res.status(200).send(audio);
  } catch (e) {
    console.error("tts failed:", e.message);
    res.status(500).json({ error: "AI 목소리를 만들지 못했어요. 기기 목소리로 읽을게요." });
  }
}
