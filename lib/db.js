// Supabase REST(PostgREST) 최소 래퍼. 서버 전용(secret / service_role 키).
// 환경변수가 없으면 enabled=false → 데모 모드로 동작.
const env = process.env;
const URL = env.SUPABASE_URL || env.SB_URL || env.supabase_url;
const KEY =
  env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || env.SB_SECRET_KEY || env.supabase_secret_key;
export const enabled = Boolean(URL && KEY);

async function rest(path, { method = "GET", body, prefer } = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: KEY,
      // 새 형식 secret 키(sb_secret_...)는 apikey 헤더만, legacy service_role(eyJ...)는 Bearer도 함께
      ...(KEY.startsWith("eyJ") ? { authorization: `Bearer ${KEY}` } : {}),
      "content-type": "application/json",
      ...(prefer ? { prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const nowIso = () => new Date().toISOString();
const idList = (ids) => `(${ids.map(Number).filter(Number.isFinite).join(",")})`;

// ── 학생 ─────────────────────────────────────────────
export async function getStudent(code) {
  if (!enabled) return { id: null, code, display_name: null, allowed_tones: null, active: true };
  const rows = await rest(`students?code=eq.${encodeURIComponent(code)}&select=*`);
  return rows?.[0] || null;
}

// ── 사실 기억 (memories) ─────────────────────────────
// last_seen: 저장되거나 다시 언급된 시각. 상한을 넘으면 가장 오래 언급 안 된 것부터 지운다.
export async function getMemories(studentId) {
  if (!enabled || !studentId) return [];
  return (
    (await rest(
      `memories?student_id=eq.${studentId}&select=id,category,fact,last_seen,created_at&order=last_seen.desc&limit=100`
    )) || []
  );
}

export async function addMemories(studentId, items) {
  if (!enabled || !studentId || !items.length) return;
  const at = nowIso();
  await rest("memories", {
    method: "POST",
    body: items.map((m) => ({ student_id: studentId, category: m.category, fact: m.fact, last_seen: at })),
    prefer: "return=minimal",
  });
}

export async function touchMemories(studentId, ids) {
  if (!enabled || !studentId || !ids.length) return;
  await rest(`memories?student_id=eq.${studentId}&id=in.${idList(ids)}`, {
    method: "PATCH",
    body: { last_seen: nowIso() },
    prefer: "return=minimal",
  });
}

export async function deleteMemories(studentId, ids) {
  if (!enabled || !studentId || !ids.length) return;
  await rest(`memories?student_id=eq.${studentId}&id=in.${idList(ids)}`, {
    method: "DELETE",
    prefer: "return=minimal",
  });
}

// ── 지난 이야기 (episodes) ───────────────────────────
export async function getEpisodes(studentId, limit = 5) {
  if (!enabled || !studentId) return [];
  return (
    (await rest(
      `episodes?student_id=eq.${studentId}&skipped=eq.false&select=id,summary,until_at,created_at&order=until_at.desc&limit=${limit}`
    )) || []
  );
}

// 요약이 어디까지 진행됐는지 (건너뛴 구간 포함)
export async function getLastEpisodeMarker(studentId) {
  if (!enabled || !studentId) return null;
  const rows = await rest(`episodes?student_id=eq.${studentId}&select=until_at&order=until_at.desc&limit=1`);
  return rows?.[0] || null;
}

export async function addEpisode(studentId, summary, untilAt, skipped = false) {
  if (!enabled || !studentId) return;
  await rest("episodes", {
    method: "POST",
    body: { student_id: studentId, summary, until_at: untilAt, skipped },
    prefer: "return=minimal",
  });
}

// 사용자가 지운 이야기: 행은 남기고 내용만 비운다.
// 행을 지우면 요약 진행 표시가 뒤로 밀려 같은 대화가 다시 요약되기 때문(지운 기억이 되살아남).
export async function forgetEpisodes(studentId, ids) {
  if (!enabled || !studentId || !ids.length) return;
  await rest(`episodes?student_id=eq.${studentId}&id=in.${idList(ids)}`, {
    method: "PATCH",
    body: { summary: "", skipped: true },
    prefer: "return=minimal",
  });
}

async function deleteEpisodes(studentId, ids) {
  if (!enabled || !studentId || !ids.length) return;
  await rest(`episodes?student_id=eq.${studentId}&id=in.${idList(ids)}`, {
    method: "DELETE",
    prefer: "return=minimal",
  });
}

// 오래된 이야기는 개수 상한을 넘으면 지운다
export async function trimEpisodes(studentId, keep) {
  if (!enabled || !studentId) return;
  const rows =
    (await rest(`episodes?student_id=eq.${studentId}&select=id&order=until_at.desc&offset=${keep}&limit=200`)) || [];
  if (rows.length) await deleteEpisodes(studentId, rows.map((r) => r.id));
}

export async function clearAllMemory(studentId) {
  if (!enabled || !studentId) return;
  await Promise.all([
    rest(`memories?student_id=eq.${studentId}`, { method: "DELETE", prefer: "return=minimal" }),
    rest(`episodes?student_id=eq.${studentId}`, {
      method: "PATCH",
      body: { summary: "", skipped: true },
      prefer: "return=minimal",
    }),
  ]);
}

// ── 대화 기록 ─────────────────────────────────────────
export async function logMessages(studentId, rows) {
  if (!enabled || !studentId) return;
  await rest("messages", {
    method: "POST",
    body: rows.map((r) => ({ student_id: studentId, ...r })),
    prefer: "return=minimal",
  });
}

export async function getMessages(studentId, limit = 60) {
  if (!enabled || !studentId) return null;
  const rows =
    (await rest(
      `messages?student_id=eq.${studentId}&select=role,content,emotion,flagged,safety,created_at&order=created_at.desc&limit=${limit}`
    )) || [];
  return rows.reverse().map((r) => ({
    role: r.role,
    content: r.content,
    emotion: r.emotion || undefined,
    crisis: r.role === "assistant" && (r.safety === "crisis" || r.flagged),
    at: Date.parse(r.created_at),
  }));
}

// 마지막 요약 이후, 아직 요약되지 않은 대화 (오래된 순)
export async function getUnsummarized(studentId, sinceIso, limit = 40) {
  if (!enabled || !studentId) return [];
  const since = sinceIso ? `&created_at=gt.${encodeURIComponent(sinceIso)}` : "";
  return (
    (await rest(
      `messages?student_id=eq.${studentId}${since}&select=role,content,safety,created_at&order=created_at.asc&limit=${limit}`
    )) || []
  );
}

// ── AI 목소리 사용량 ─────────────────────────────────
// 오늘(한국 시간) 만든 개수. 데모 모드면 0
export async function countTtsToday(studentId) {
  if (!enabled || !studentId) return 0;
  const kstMidnight = new Date(Math.floor((Date.now() + 9 * 3600e3) / 86400e3) * 86400e3 - 9 * 3600e3).toISOString();
  const res = await fetch(
    `${URL}/rest/v1/tts_log?student_id=eq.${studentId}&created_at=gte.${encodeURIComponent(kstMidnight)}&select=id`,
    {
      method: "HEAD",
      headers: {
        apikey: KEY,
        ...(KEY.startsWith("eyJ") ? { authorization: `Bearer ${KEY}` } : {}),
        prefer: "count=exact",
      },
    }
  );
  if (!res.ok) throw new Error(`supabase ${res.status}`);
  const total = (res.headers.get("content-range") || "").split("/")[1];
  return Number(total) || 0;
}

export async function logTts(studentId, chars) {
  if (!enabled || !studentId) return;
  await rest("tts_log", { method: "POST", body: { student_id: studentId, chars }, prefer: "return=minimal" });
}

// ── 알림·감사 ─────────────────────────────────────────
export async function addAlert(studentId, alert) {
  if (!enabled) return;
  await rest("alerts", {
    method: "POST",
    body: { student_id: studentId, ...alert },
    prefer: "return=minimal",
  });
}

export async function addAudit(studentId, entry) {
  if (!enabled) return;
  await rest("audit_log", {
    method: "POST",
    body: { student_id: studentId, ...entry },
    prefer: "return=minimal",
  });
}
