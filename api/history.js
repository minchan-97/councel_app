// 학생의 지난 대화를 서버에서 불러온다. 데모 모드면 messages: null
import { enabled, getStudent, getMessages } from "../lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const code = String(req.body?.code || "").trim();
  try {
    const s = await getStudent(code);
    if (!s || s.active === false || (enabled && !s.guardian_consent))
      return res.status(403).json({ error: "입장 코드를 다시 확인해 주세요." });
    res.json({ messages: await getMessages(s.id) });
  } catch (e) {
    console.error("history failed:", e.message);
    res.status(500).json({ error: "지난 대화를 불러오지 못했어요." });
  }
}
