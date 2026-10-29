-- AI 목소리 사용 기록 (하루 사용량 제한용). 한 번 실행
create table if not exists tts_log (
  id bigserial primary key,
  student_id uuid references students(id) on delete cascade,
  chars int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists tts_log_student_idx on tts_log(student_id, created_at desc);
alter table tts_log enable row level security;
