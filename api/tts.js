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

// 음성 모델 순서: 환경변수 TTS_MODEL → gpt-4o-mini-tts → tts-1
// (대화용 모델 gpt-4o-mini와는 별개의 모델이다. 같은 키라도 프로젝트에서 허용돼 있어야 쓸 수 있다)
function modelChain(cfg) {
  return [...new Set([process.env.TTS_MODEL, cfg.TTS?.model || "gpt-4o-mini-tts", "tts-1"].filter(Boolean))];
}
// tts-1은 말투 지시(instructions)를 못 받으므로 빠르기로만 느낌을 낸다
const TTS1_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
const TTS1_SPEED = { cheerful: 1.08, tiny: 1.12, warm: 1.0, sleepy: 0.88, cool: 0.96 };

async function synth(model, { voice, input, instructions, style, calm }) {
  const old = model === "tts-1" || model === "tts-1-hd";
  const body = old
    ? { model, input, voice: TTS1_VOICES.includes(voice) ? voice : "nova", response_format: "mp3",
        speed: calm ? 0.9 : TTS1_SPEED[style] || 1 }
    : { model, input, voice, instructions, response_format: "mp3" };
  const r = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = new Error(`openai tts(${model}) ${r.status}: ${(await r.text()).slice(0, 300)}`);
    err.status = r.status;
    throw err;
  }
  return Buffer.from(await r.arrayBuffer());
}

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
    out.steps.openai_models = {};
    for (const m of modelChain(cfg)) {
      try {
        const r = await fetch(`https://api.openai.com/v1/models/${m}`, {
          headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        });
        out.steps.openai_models[m] = r.ok ? "ok" : `실패 ${r.status}: ${(await r.text()).slice(0, 160)}`;
      } catch (e) {
        out.steps.openai_models[m] = `실패: ${e.message}`;
      }
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

    // 모델을 순서대로 시도: 권한 없음(403)·모델 없음(404)·잘못된 요청(400)이면 다음 모델로
    let audio = null, lastErr = null;
    for (const m of modelChain(cfg)) {
      try {
        audio = await synth(m, { voice: v, input, instructions, style, calm });
        break;
      } catch (e) {
        lastErr = e;
        console.error("tts model failed:", e.message);
        if (![400, 403, 404].includes(e.status)) break; // 키 오류·한도 초과 등은 다른 모델도 같으니 멈춤
      }
    }
    if (!audio) throw lastErr || new Error("tts failed");

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
