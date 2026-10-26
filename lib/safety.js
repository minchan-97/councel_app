// safety_guard (서버 전용)
// 1단계: 규칙 기반. 확실한 위기 표현은 LLM을 거치지 않고 바로 위기 처리.
// 2단계: 애매한 표현만 LLM 분류기로 확인. 분류 실패 시 '우려'로 처리(안전한 쪽으로).
// 위기 판정이면 응답은 항상 config의 고정 문구. LLM이 위기 응답을 생성하지 않는다.
import { complete, parseJSON } from "./llm.js";

// 공백·반복 문자 정리 후 검사 (예: "죽 고 싶 어" → "죽고싶어")
const normalize = (s) => s.replace(/\s+/g, "").replace(/(.)\1{2,}/g, "$1$1");

// 1단계 - 확실한 위기 (즉시 위기 처리)
const HIGH = [
  { type: "self_harm", re: /(죽고싶|자살|자해|살기싫|사라지고싶|없어지고싶|뛰어내리|목숨을끊)/ },
  { type: "abuse", re: /(학대당|성추행|나를만져|몸을만져)/ },
];

// 1단계 - 애매한 신호 (2단계로 보냄)
const MEDIUM = [
  /(맞았|때렸|때려서|때리면|발로찼)/,
  /(괴롭혀|괴롭힘|왕따|따돌림)/,
  /(무서워|무서웠|겁나)/,
  /(아무도없|혼자야|나는없어|태어나지말)/,
  /(집에가기싫|집이싫|도망가고싶)/,
  /(다치게하고싶|복수할)/,
];

export function stage1(text) {
  const t = normalize(text);
  for (const h of HIGH) if (h.re.test(t)) return { level: "crisis", type: h.type, by: "rule" };
  if (MEDIUM.some((re) => re.test(t))) return { level: "check", by: "rule" };
  return { level: "none", by: "rule" };
}

const CLASSIFIER_SYSTEM = `너는 초등학생 상담 앱의 안전 분류기다. 학생의 메시지와 최근 대화를 보고 위험 수준을 판단한다.
- crisis: 자해·자살 생각, 학대·폭력 피해, 다른 사람을 해치려는 계획 등 즉시 어른의 도움이 필요한 경우
- concern: 걱정되지만 즉각적 위험은 아닌 경우(친구 갈등, 속상함, 외로움 등)
- none: 일상 대화, 게임·만화 속 이야기, 비유적 표현
type은 self_harm | abuse | general 중 하나.
반드시 JSON만 출력: {"level":"crisis|concern|none","type":"self_harm|abuse|general","reason":"짧은 이유"}`;

export async function stage2(text, recent = []) {
  const context = recent
    .slice(-4)
    .map((m) => `${m.role === "user" ? "학생" : "앱"}: ${m.content}`)
    .join("\n");
  try {
    const out = await complete({
      system: CLASSIFIER_SYSTEM,
      messages: [{ role: "user", content: `최근 대화:\n${context || "(없음)"}\n\n학생 메시지: ${text}` }],
      maxTokens: 150,
      temperature: 0,
    });
    const j = parseJSON(out);
    if (!j || !["crisis", "concern", "none"].includes(j.level)) throw new Error("bad classifier output");
    return { level: j.level, type: j.type || "general", reason: j.reason || "", by: "llm" };
  } catch (e) {
    // 분류 실패 → 안전한 쪽(우려 + 교사 알림)
    return { level: "concern", type: "general", reason: `classifier_failed: ${e.message}`, by: "fallback" };
  }
}

export async function checkSafety(text, recent) {
  const s1 = stage1(text);
  if (s1.level !== "check") return s1;
  return stage2(text, recent);
}
