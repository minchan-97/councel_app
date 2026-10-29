// 대화 파이프라인
// 입장 확인 → (지난 대화 요약) → safety_guard → 프롬프트 조립(사실 기억 + 지난 이야기)
// → LLM → 정체성 감사 → 기억 게이트(추가·갱신·교체) → 기록 → (요약)
import {
  enabled, getStudent, getMemories, addMemories, touchMemories, deleteMemories,
  getEpisodes, logMessages, addAlert, addAudit,
} from "../lib/db.js";
import { checkSafety } from "../lib/safety.js";
import { buildSystem, auditReply, gateMemories, normalizePersona, SAFE_FALLBACK } from "../lib/companion.js";
import { maybeSummarize } from "../lib/episodes.js";
import { complete, parseJSON } from "../lib/llm.js";
import { IDENTITY, TONES, CRISIS_RESPONSES, EMOTIONS, CRISIS_EMOTION, EPISODE } from "../lib/config.js";

const MAX_LEN = 500;

// 저장 실패해도 대화는 계속하되, 실패 원인은 로그에 남긴다
const reportSave = (results) =>
  results.forEach((r) => r.status === "rejected" && console.error("save failed:", r.reason?.message || r.reason));

// 요약은 부가 기능 — 실패해도 대화를 막지 않는다
const safeSummarize = (sid, mode) =>
  maybeSummarize(sid, mode).catch((e) => console.error(`summary(${mode}) failed:`, e.message));

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { code, tone, message, history } = req.body || {};
  const persona = normalizePersona(req.body?.persona);
  const text = String(message || "").trim().slice(0, MAX_LEN);
  if (!text) return res.status(400).json({ error: "메시지가 비어 있어요." });

  // 클라이언트가 보낸 최근 대화(문맥용). 역할·길이 정리.
  const recent = (Array.isArray(history) ? history : [])
    .slice(-12)
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_LEN) }));

  try {
    const student = await getStudent(String(code || ""));
    if (!student || student.active === false || (enabled && !student.guardian_consent))
      return res.status(403).json({ error: "입장 코드를 다시 확인해 주세요." });
    const sid = student.id;
    const allowed = (student.allowed_tones?.length ? student.allowed_tones : Object.keys(TONES)).filter(
      (t) => TONES[t]?.enabled
    );
    const useTone = allowed.includes(tone) && TONES[tone] ? tone : allowed[0];

    // 0) 오랜만에 왔으면 지난 대화를 먼저 요약 → 이번 대화에서 이어 갈 수 있게
    if (sid) await safeSummarize(sid, "gap");

    // 1) safety_guard — LLM 응답보다 먼저, 서버에서
    const safety = await checkSafety(text, recent);
    if (safety.level === "crisis") {
      const reply = CRISIS_RESPONSES[safety.type] || CRISIS_RESPONSES.general;
      reportSave(await Promise.allSettled([
        addAlert(sid, { level: "crisis", type: safety.type, message: text, detected_by: safety.by }),
        logMessages(sid, [
          { role: "user", content: text, tone: useTone, flagged: true, safety: "crisis" },
          { role: "assistant", content: reply, tone: useTone, emotion: CRISIS_EMOTION, flagged: true, safety: "crisis" },
        ]),
      ]));
      return res.json({ text: reply, emotion: CRISIS_EMOTION, crisis: true });
    }
    const concern = safety.level === "concern";

    // 2) 프롬프트 조립: 사실 기억 + 지난 이야기
    const [memories, episodes] = await Promise.all([getMemories(sid), getEpisodes(sid, EPISODE.inPrompt)]);
    const system = buildSystem({ tone: useTone, persona, studentName: student.display_name, memories, episodes, concern });
    const messages = [...recent, { role: "user", content: text }];

    // 3) 생성 + 정체성 감사 (위반 시 1회 재생성, 그래도 위반이면 안전 문구)
    let out = parseJSON(await complete({ system, messages }));
    let violations = out?.text ? auditReply(out.text, persona.name) : ["parse_failed"];
    if (violations.length) {
      console.warn("audit:", violations, out?.text ?? "(no text)");
      await addAudit(sid, { stage: "first", violations, output: out?.text || null }).catch(() => {});
      const retrySystem =
        system + `\n\n[교정] 직전 답이 규칙을 어겼다(${violations.join(", ")}). 정체성과 규칙을 지켜 다시 답한다.`;
      out = parseJSON(await complete({ system: retrySystem, messages, temperature: 0.4 }));
      violations = out?.text ? auditReply(out.text, persona.name) : ["parse_failed"];
      if (violations.length) {
        console.warn("audit retry:", violations, out?.text ?? "(no text)");
        await addAudit(sid, { stage: "retry", violations, output: out?.text || null }).catch(() => {});
        out = { text: SAFE_FALLBACK(persona.name), emotion: "thinking", memory: [] };
      }
    }
    const reply = out.text.trim();
    const emotion = EMOTIONS.includes(out.emotion) ? out.emotion : concern ? "concern" : "neutral";

    // 4) 사실 기억 게이트 — 걱정 상황에서는 사실 기억을 건드리지 않음 (지난 이야기 요약에는 포함)
    const gate = concern ? { add: [], touch: [], evict: [] } : gateMemories(out.memory, text, memories);

    // 5) 기록 (실패해도 대화는 계속)
    reportSave(await Promise.allSettled([
      addMemories(sid, gate.add),
      touchMemories(sid, gate.touch),
      deleteMemories(sid, gate.evict),
      logMessages(sid, [
        { role: "user", content: text, tone: useTone, flagged: concern, safety: safety.level === "concern" ? "concern" : "none" },
        { role: "assistant", content: reply, tone: useTone, emotion, safety: "none" },
      ]),
      concern ? addAlert(sid, { level: "concern", type: safety.type || "general", message: text, detected_by: safety.by }) : null,
    ]));

    // 6) 이야기가 충분히 쌓였으면 요약 (기록이 저장된 뒤에)
    if (sid) await safeSummarize(sid, "count");

    res.json({ text: reply, emotion, crisis: false });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "답을 만들지 못했어요. 잠시 뒤 다시 보내 주세요." });
  }
}
