// Supabase REST(PostgREST) 최소 래퍼. 서버 전용(service role 키).
// 환경변수가 없으면 enabled=false → 데모 모드로 동작.
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const enabled = Boolean(URL && KEY);

async function rest(path, { method = "GET", body, prefer } = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: KEY,
      authorization: `Bearer ${KEY}`,
      "content-type": "application/json",
      ...(prefer ? { prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function getStudent(code) {
  if (!enabled) return { id: null, code, display_name: null, allowed_tones: null, active: true };
  const rows = await rest(`students?code=eq.${encodeURIComponent(code)}&select=*`);
  return rows?.[0] || null;
}

export async function getMemories(studentId) {
  if (!enabled || !studentId) return [];
  return (
    (await rest(
      `memories?student_id=eq.${studentId}&select=id,category,fact&order=created_at.desc&limit=40`
    )) || []
  );
}

export async function addMemories(studentId, items) {
  if (!enabled || !studentId || !items.length) return;
  await rest("memories", {
    method: "POST",
    body: items.map((m) => ({ student_id: studentId, category: m.category, fact: m.fact })),
    prefer: "return=minimal",
  });
}

export async function logMessages(studentId, rows) {
  if (!enabled || !studentId) return;
  await rest("messages", {
    method: "POST",
    body: rows.map((r) => ({ student_id: studentId, ...r })),
    prefer: "return=minimal",
  });
}

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
