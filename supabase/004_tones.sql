-- 말투 노출 방식 변경: "보여줄 것" 목록(allowed_tones) → "숨길 것" 목록(hidden_tones)
-- 이전 방식에서는 목록에 없는 새 말투(할머니)가 자동으로 숨겨졌다. 한 번 실행.
alter table students add column if not exists hidden_tones text[] not null default '{}';

-- 기존 학생: 예전 목록에서 일부러 뺐던 말투(친구·선생님·부모님 중)만 숨김으로 옮긴다.
-- 할머니는 예전 목록이 생기기 전에 없던 말투라 숨기지 않는다.
update students
set hidden_tones = coalesce(
  (select array_agg(t) from unnest(array['friend','teacher','parent']) as t where not (t = any(allowed_tones))),
  '{}')
where allowed_tones is not null and array_length(allowed_tones, 1) > 0;

-- 예전 칸은 더 이상 쓰지 않는다 (남겨 둬도 무방)
-- alter table students drop column allowed_tones;
