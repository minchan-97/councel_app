// AI 목소리: 캐릭터의 말을 OpenAI 음성으로 만든다 (mp3).
// 걱정·위기 상황에서는 고른 스타일과 상관없이 차분한 목소리.
//
// 진단: 브라우저에서 /api/tts 를 그냥 열면(GET) 무엇이 문제인지 JSON으로 보여 준다.
// 다른 파일을 불러오는 것도 함수 안에서 하므로, 불러오기에 실패해도 함수가 죽지 않고 원인을 알려 준다.

async function load() {
  const db = await import("../lib/db.js");
  const cfg = await import("../lib/config.js");
  return { db, cfg };
}

const clean = (t, max) =>
  String(t || "")
    .replace(/https?:\S+/g, "")
    .replace(/[ㅋㅎ]{2,}/g, " ")
    .replace(/[ㅠㅜ]+/g, " ")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

async function diagnose(res) {
  const out = { node: process.version, steps: {} };
  let mods;
  try {
    mods = await load();
    out.steps.import = "ok";
  } catch (e) {
    out.steps.import = `실패: ${e.message}`;
    return res.status(200).json(out);
  }
  const { db, cfg } = mods;
  const need = {
    db: ["getStudent", "countTtsToday", "logTts", "enabled"],
    config: ["TTS", "TTS_VOICES", "TTS_STYLES", "TTS_PERSONALITY", "TTS_CALM", "PERSONALITIES"],
  };
  out.steps.missing_db_exports = need.db.filter((k) => !(k in db));
  out.steps.missing_config_exports = need.config.filter((k) => !(k in cfg));
  out.steps.openai_key = process.env.OPENAI_API_KEY ? "있음" : "없음";
  out.steps.supabase = db.enabled ? "연결 설정 있음" : "데모 모드";

  if (db.enabled && db.countTtsToday) {
    try {
      await db.countTtsToday("00000000-0000-0000-0000-000000000000");
      out.steps.tts_log_table = "ok";
    } catch (e) {
      out.steps.tts_log_table = `실패: ${e.message}`;
    }
  }
  if (process.env.OPENAI_API_KEY) {
    try {
      const r = await fetch("https://api.openai.com/v1/models/gpt-4o-mini-tts", {
        headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      });
      out.steps.openai_model = r.ok ? "ok" : `실패 ${r.status}: ${(await r.text()).slice(0, 200)}`;
    } catch (e) {
      out.steps.openai_model = `실패: ${e.message}`;
    }
  }
  res.status(200).json(out);
}

export default async function handler(req, res) {
  if (req.method === "GET") return diagnose(res);
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { db, cfg } = await load();
    const { TTS, TTS_VOICES, TTS_STYLES, TTS_PERSONALITY, TTS_CALM, PERSONALITIES } = cfg;
    const { code, text, voice, style, personality, calm } = req.body || {};
    const input = clean(text, TTS?.maxChars || 300);
    if (!input) return res.status(400).json({ error: "읽을 말이 없어요." });
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "AI 목소리가 아직 설정되지 않았어요." });

    const s = await db.getStudent(String(code || "").trim());
    if (!s || s.active === false || (db.enabled && !s.guardian_consent))
      return res.status(403).json({ error: "입장 코드를 다시 확인해 주세요." });

    // 사용량 확인이 실패해도(테이블 없음 등) 목소리는 만들되, 원인은 로그에 남긴다
    let used = 0;
    try {
      used = db.countTtsToday ? await db.countTtsToday(s.id) : 0;
    } catch (e) {
      console.error("tts count failed:", e.message);
    }
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
    if (!r.ok) throw new Error(`openai tts ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const audio = Buffer.from(await r.arrayBuffer());

    if (db.logTts) await db.logTts(s.id, input.length).catch((e) => console.error("tts log failed:", e.message));
    res.setHeader("content-type", "audio/mpeg");
    res.setHeader("cache-control", "no-store");
    res.setHeader("content-length", String(audio.length));
    res.statusCode = 200;
    res.end(audio);
  } catch (e) {
    console.error("tts failed:", e.message);
    res.status(500).json({ error: "AI 목소리를 만들지 못했어요. 기기 목소리로 읽을게요.", detail: e.message });
  }
}
