// 지난 이야기 요약기
// - 학생이 한 말만 근거로 요약 (포근이가 한 말을 사실로 흡수하지 않음 — 에코 오염 방지)
// - 위기로 판정된 대화는 요약 입력에서 제외
// - 결과는 EPISODE_DENY로 한 번 더 거른다
import { complete, parseJSON } from "./llm.js";
import { EPISODE, EPISODE_DENY } from "./config.js";
import { getLastEpisodeMarker, getUnsummarized, addEpisode, trimEpisodes } from "./db.js";

const SUMMARY_SYSTEM = `너는 대화 기록을 짧은 기억 메모로 바꾸는 요약기다.
규칙:
- 학생이 한 말만 근거로 쓴다. 상대(앱)가 한 말은 사실로 옮기지 않는다.
- 무슨 일이 있었는지, 학생이 어떤 기분이었는지를 1~2문장, 60자 안팎으로 쓴다.
- 사람은 학생이 부른 호칭 그대로 쓴다(예: "친구 지우", "짝꿍"). 새 이름을 만들지 않는다.
- 진단, 추측, 평가를 넣지 않는다. 주소·전화번호는 쓰지 않는다.
- 인사나 잡담뿐이라 다음에 이어 갈 이야기가 없으면 skip을 true로.
반드시 JSON만 출력: {"skip":false,"summary":"..."}`;

async function summarize(rows) {
  const lines = rows
    .filter((r) => r.safety !== "crisis")
    .map((r) => `${r.role === "user" ? "학생" : "앱"}: ${String(r.content).slice(0, 300)}`);
  if (lines.filter((l) => l.startsWith("학생")).length < EPISODE.minUserMessages) return null;

  const out = parseJSON(
    await complete({
      system: SUMMARY_SYSTEM,
      messages: [{ role: "user", content: lines.join("\n") }],
      maxTokens: 200,
      temperature: 0.2,
    })
  );
  const summary = String(out?.summary || "").trim().slice(0, 120);
  if (!out || out.skip || !summary) return null;
  if (EPISODE_DENY.some((re) => re.test(summary))) return null;
  return summary;
}

// mode: "gap"  → 대화 시작 전. 마지막 대화가 오래전이면 지난 대화를 먼저 요약
//       "count"→ 대화 후. 요약 안 된 학생 메시지가 충분히 쌓였으면 요약
export async function maybeSummarize(studentId, mode) {
  if (!studentId) return false;
  const last = await getLastEpisodeMarker(studentId);
  const rows = await getUnsummarized(studentId, last?.until_at);
  if (!rows.length) return false;

  const userCount = rows.filter((r) => r.role === "user").length;
  const newest = Date.parse(rows[rows.length - 1].created_at);
  const due =
    mode === "gap"
      ? Date.now() - newest > EPISODE.sessionGapMs && userCount >= EPISODE.minUserMessages
      : userCount >= EPISODE.everyUserMessages;
  if (!due) return false;

  const untilAt = rows[rows.length - 1].created_at;
  const summary = await summarize(rows);
  // 요약할 게 없던 구간도 '건너뜀' 표시를 남긴다. 그래야 같은 구간을 매번 다시 요약하지 않는다.
  await addEpisode(studentId, summary || "", untilAt, !summary);
  await trimEpisodes(studentId, EPISODE.keep);
  return Boolean(summary);
}
