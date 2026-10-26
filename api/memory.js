// 포근이가 기억하는 것: 보기 / 하나 지우기 / 모두 지우기
// action: "list" | "delete" (kind: "fact" | "episode", id) | "clear"
import {
  enabled, getStudent, getMemories, getEpisodes, deleteMemories, forgetEpisodes, clearAllMemory,
} from "../lib/db.js";
import { MEMORY_ALLOW } from "../lib/config.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { code, action, kind, id } = req.body || {};
  try {
    const s = await getStudent(String(code || "").trim());
    if (!s || s.active === false || (enabled && !s.guardian_consent))
      return res.status(403).json({ error: "입장 코드를 다시 확인해 주세요." });
    if (!enabled) return res.json({ demo: true, facts: [], episodes: [] });
    const sid = s.id;

    if (action === "delete") {
      if (kind === "fact") await deleteMemories(sid, [id]);
      else if (kind === "episode") await forgetEpisodes(sid, [id]);
      else return res.status(400).json({ error: "지울 종류를 알 수 없어요." });
      return res.json({ ok: true });
    }
    if (action === "clear") {
      await clearAllMemory(sid);
      return res.json({ ok: true });
    }

    const [facts, episodes] = await Promise.all([getMemories(sid), getEpisodes(sid, 50)]);
    res.json({
      demo: false,
      facts: facts.map((m) => ({ id: m.id, category: m.category, label: MEMORY_ALLOW[m.category]?.split("(")[0] || m.category, fact: m.fact })),
      episodes: episodes.map((e) => ({ id: e.id, summary: e.summary, at: e.until_at })),
    });
  } catch (e) {
    console.error("memory failed:", e.message);
    res.status(500).json({ error: "기억을 불러오지 못했어요." });
  }
}
