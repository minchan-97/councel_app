# 포근이 — 학생 상담 컴패니언 (안드로이드 앱용 PWA)

Vercel 웹앱 + 서버 함수 + Supabase 구조입니다. PWABuilder로 APK를 만들어 안드로이드 폰에 설치합니다.
캐릭터 이름 `포근이`와 구름 그림은 자리표시용이니 바꿔서 쓰면 됩니다.

## 구조

```
api/
  session.js     입장 코드 확인, 허용 말투 목록 반환
  chat.js        대화 파이프라인 (아래 순서)
lib/
  config.js      정체성 코어(읽기 전용), 말투, 기억 허용 목록, 위기 고정 문구  ← 주로 여기를 고침
  safety.js      safety_guard: 1단계 규칙 → 애매하면 2단계 LLM 분류
  companion.js   프롬프트 조립(companion_skin), 정체성 감사, 기억 게이트
  llm.js         Anthropic / OpenAI 선택 호출
  db.js          Supabase REST (없으면 데모 모드)
public/          앱 화면, manifest, 서비스 워커, 아이콘, 표정 이미지
supabase/schema.sql
```

`api/chat.js` 처리 순서:

1. 입장 코드·보호자 동의 확인
2. **safety_guard** — 위기면 LLM을 부르지 않고 고정 문구 + 교사 알림(`alerts`)
3. 정체성 코어 → 규칙 → 말투 → 기억 순서로 프롬프트 조립
4. 생성 후 **정체성 감사** — 사람인 척, 비밀 약속, 진단, 다른 이름이면 1회 재생성, 또 어기면 안전 문구 (`audit_log`에 기록)
5. **기억 게이트** — 허용 범주만, 근거가 학생 말에 실제로 있어야 함(에코 흡수 방지), 민감 내용 제외, 비슷한 기억 중복 제외, 30개 상한. 걱정 상황에서는 저장 안 함
6. 대화 기록 저장

몰랑이와 다른 점: 자율 워커·탐색·먼저 말 걸기 없음. 정체성은 `config.js`에서 고정되고 대화로 바뀌지 않으며, 학생별 기억은 정체성으로 올라가지 않습니다.

## 1. Supabase 준비

1. 새 프로젝트 → SQL Editor에서 `supabase/schema.sql` 실행
2. `students` 테이블에 학생 등록: `code`(입장 코드), `display_name`(별명 권장), `allowed_tones`, `guardian_consent`
   - `guardian_consent = true`인 학생만 입장됩니다
   - `allowed_tones`를 `{teacher,friend}`처럼 넣으면 그 학생에게는 부모님 말투가 안 보입니다
3. Project Settings → API에서 URL과 **service_role** 키 복사 (이 키는 Vercel에만 넣고 절대 앱 코드에 넣지 않기)

## 2. Vercel 배포

1. 이 폴더를 깃허브 저장소로 push
2. Vercel → Add New Project → 저장소 선택 → Framework는 **Other**
3. Environment Variables에 `.env.example` 항목 입력
4. Deploy → 나온 주소로 폰 크롬에서 접속해 테스트
   - Supabase 변수를 비워 두면 데모 모드(아무 코드나 입장, 저장 안 함)

## 3. APK 만들기 (PWABuilder)

1. pwabuilder.com 에 Vercel 주소 입력
2. Package for stores → Android → 다운로드
3. zip 안의 `assetlinks.json` 내용을 `public/.well-known/assetlinks.json`에 덮어쓰고 다시 push (주소창 숨김용)
4. zip 안의 `.apk`를 폰으로 옮겨 설치 ("출처를 알 수 없는 앱" 허용)
5. **서명 키(signing.keystore)와 비밀번호 파일은 따로 보관** — 잃어버리면 업데이트 불가

화면·말투·규칙을 고쳐서 push하면 앱에도 바로 반영됩니다. APK는 아이콘이나 앱 이름을 바꿀 때만 다시 만듭니다.

## 4. 캐릭터 표정 교체

`public/expressions/`의 7개 파일(`neutral, happy, concern, surprised, thinking, cheer, calm`)을 같은 이름의 이미지로 바꾸면 됩니다.
PNG로 바꾸면 `index.html`과 `sw.js`의 `.svg`를 `.png`로 바꿔 주세요.

1. 기준 캐릭터 시트 1장: 정면 전신, 기본 표정, 색상 코드, 고정 특징(귀·옷·소품)
2. 그 시트를 참고 이미지로 넣고 표정만 바꿔서 생성. 프롬프트 예:
   > 첨부한 캐릭터와 완전히 같은 디자인·색·비율·선 굵기로, 표정만 [걱정스러운 얼굴: 눈썹이 살짝 내려가고 입이 작게 다물린]으로 그려 줘. 정면, 상반신, 투명 배경, 그림자 없음, 정사각형.
3. `calm`은 위기 응답 때만 쓰는 표정 — 웃지 않는 차분하고 부드러운 얼굴로
4. 7장을 나란히 놓고 크기·위치가 맞는지 확인 (표정이 바뀔 때 캐릭터가 튀지 않게)

## 학교에서 쓰기 전에 확인할 것

- `lib/config.js`의 위기 고정 문구와 상담 전화번호를 학교 위기관리 지침에 맞게 검토
- `lib/safety.js`의 규칙 목록은 출발점입니다. 테스트 문장으로 놓치는 표현을 찾아 보강
- `alerts` 테이블을 교사가 확인하는 방법이 아직 없습니다 → 교사 패널(로그인 필수) 또는 ntfy 알림 연결 필요
- 만 14세 미만은 법정대리인 동의 필요. 대화가 해외 LLM API로 전송된다는 점을 동의서에 포함
- 입장 코드는 비밀번호 수준의 보안이 아닙니다. 추측하기 어려운 코드로 발급
