// 학생 코드로 입장. 교사가 Supabase students 테이블에 미리 등록한 코드만 허용.
import { getStudent, enabled } from "../lib/db.js";
import { IDENTITY, TONES, DEFAULT_TONE, PERSONALITIES, DEFAULT_PERSONALITY, TTS, TTS_VOICES, TTS_STYLES } from "../lib/config.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const code = String(req.body?.code || "").trim();
  if (!/^[A-Za-z0-9-]{3,20}$/.test(code))
    return res.status(400).json({ error: "코드는 영문·숫자 3~20자예요." });

  try {
    const s = await getStudent(code);
    if (!s || s.active === false)
      return res.status(404).json({ error: "등록되지 않은 코드예요. 선생님께 코드를 확인해 주세요." });
    if (enabled && !s.guardian_consent)
      return res.status(403).json({ error: "보호자 동의가 확인되면 사용할 수 있어요. 선생님께 여쭤봐 주세요." });

    const allowed = (s.allowed_tones?.length ? s.allowed_tones : Object.keys(TONES)).filter(
      (t) => TONES[t] && TONES[t].enabled
    );
    res.json({
      demo: !enabled,
      name: s.display_name || null,
      character: { name: IDENTITY.name, personality: DEFAULT_PERSONALITY },
      personalities: Object.entries(PERSONALITIES).map(([id, p]) => ({ id, label: p.label })),
      tts: {
        available: Boolean(process.env.OPENAI_API_KEY),
        dailyLimit: TTS.dailyLimit,
        voices: Object.entries(TTS_VOICES).map(([id, label]) => ({ id, label })),
        styles: Object.entries(TTS_STYLES).map(([id, s]) => ({ id, label: s.label })),
      },
      tones: allowed.map((id) => ({ id, label: TONES[id].label, hint: TONES[id].hint })),
      defaultTone: allowed.includes(DEFAULT_TONE) ? DEFAULT_TONE : allowed[0],
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "입장 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요." });
  }
}
