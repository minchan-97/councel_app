-- 상담 컴패니언 스키마
-- 모든 테이블에 RLS를 켜고 공개 정책은 만들지 않는다.
-- → 브라우저(anon 키)로는 아무것도 읽고 쓸 수 없고, Vercel 서버(service role)만 접근.

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,              -- 교사가 나눠 주는 입장 코드 (예: 4-2-07-x9k)
  display_name text,                      -- 앱이 부를 이름(별명 권장)
  allowed_tones text[],                   -- 예: '{teacher,friend}'. 비우면 전체 허용
  active boolean not null default true,
  guardian_consent boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id bigserial primary key,
  student_id uuid references students(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  tone text,
  emotion text,
  flagged boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists memories (
  id bigserial primary key,
  student_id uuid references students(id) on delete cascade,
  category text not null,
  fact text not null,
  created_at timestamptz not null default now()
);

create table if not exists alerts (
  id bigserial primary key,
  student_id uuid references students(id) on delete cascade,
  level text not null check (level in ('crisis','concern')),
  type text,
  message text,
  detected_by text,
  reviewed boolean not null default false,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists audit_log (
  id bigserial primary key,
  student_id uuid references students(id) on delete cascade,
  stage text,
  violations text[],
  output text,
  created_at timestamptz not null default now()
);

create index if not exists messages_student_idx on messages(student_id, created_at desc);
create index if not exists memories_student_idx on memories(student_id, created_at desc);
create index if not exists alerts_open_idx on alerts(reviewed, created_at desc);

alter table students  enable row level security;
alter table messages  enable row level security;
alter table memories  enable row level security;
alter table alerts    enable row level security;
alter table audit_log enable row level security;

-- guardian_consent가 false인 학생은 서버에서 입장을 막는다(api/session.js, api/chat.js).

-- 예시 학생 (테스트용)
insert into students (code, display_name, allowed_tones, guardian_consent)
values ('demo-001', '민준', '{teacher,friend,parent}', true)
on conflict (code) do nothing;
