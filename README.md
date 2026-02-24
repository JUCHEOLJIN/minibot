# mini-bot

> 스킬 없이 시작해서, 필요한 것만 쌓아가는 Slack 봇

engli-bot-2 아키텍처를 기반으로, 사용자(또는 봇 자신)가 스킬을 확장해나가는 구조입니다.

---

## 특징

- **내장 스킬 없음** — 가볍게 시작
- **2단계 스킬 로딩** — 내장 스킬 < 사용자 스킬 (우선순위)
- **CLAUDE.md 자동 생성** — 시작 시 스킬 목록 자동 반영
- **봇이 스킬을 직접 생성** — "OO 스킬 만들어줘" 요청 가능
- **스케줄 지원** — `schedule.cron` 설정으로 자동 실행

---

## 설치

```bash
curl -fsSL https://raw.githubusercontent.com/JUCHEOLJIN/minibot/main/install.sh | bash
```

설치 스크립트가 자동으로 처리합니다:
- Node.js / claude CLI 확인
- 봇 다운로드 (`~/.mini-bot/bot/`)
- Slack 토큰 입력 안내
- macOS launchd / Linux pm2 자동 시작 설정 (선택)

### 제거

```bash
curl -fsSL https://raw.githubusercontent.com/JUCHEOLJIN/minibot/main/uninstall.sh | bash
```

### 수동 설치 (개발용)

```bash
git clone https://github.com/JUCHEOLJIN/minibot.git
cd mini-bot
npm install
cp .env.example .env   # 토큰 입력
npm start
```

---

## 스킬 구조

### 사용자 스킬 디렉토리

```
~/.mini-bot/skills/
└── <skill-name>/
    ├── SKILL.md          # 메타데이터 (필수)
    └── <skill-name>.js   # 실행 스크립트 (필수)
```

### SKILL.md 예시

```yaml
---
name: hello
description: 인사말을 Slack으로 전송합니다
triggers:
  - "안녕"
  - "hello"
schedule:
  cron: "0 9 * * 1-5"   # 평일 오전 9시 자동 전송
  enabled: false
  timezone: "Asia/Seoul"
---
```

### 스크립트 예시

```javascript
// hello.js
const { slack, env, log } = require(process.env.MINI_BOT_SDK_PATH);

async function main(args) {
  const channel = args[0] || env.MY_SLACK_USER_ID;
  await slack.send(channel, "안녕하세요! 👋");
  console.log(JSON.stringify({ success: true }));
}

main(process.argv.slice(2)).catch((e) => {
  console.error(JSON.stringify({ success: false, error: e.message }));
  process.exit(1);
});
```

---

## 봇 명령어 (DM 또는 @멘션)

| 명령 | 설명 |
|---|---|
| `초기화` | 대화 기록 초기화 |
| `스킬 목록` | 현재 로드된 스킬 목록 |
| `스킬 새로고침` | 스킬 디렉토리 재스캔 + CLAUDE.md 업데이트 |

---

## 봇이 스킬을 직접 만드는 방법

Slack에서 요청하면 됩니다:

> "날씨를 매일 아침에 알려주는 스킬 만들어줘"
> "GitHub PR 알림 스킬 추가해줘"
> "Jira 이슈 검색 스킬 필요해"

Claude가 `~/.mini-bot/skills/` 에 직접 파일을 생성합니다.
그 후 `스킬 새로고침` 으로 즉시 활성화됩니다.

---

## 프로젝트 구조

```
mini-bot/
├── src/
│   ├── index.ts                      # 엔트리 포인트
│   ├── slack/SlackApp.ts             # Slack Bolt 앱
│   ├── claude/ClaudeSession.ts       # Claude 세션 관리
│   ├── skills/
│   │   ├── types.ts                  # 타입 정의
│   │   ├── SkillLoader.ts            # 2단계 스킬 로더
│   │   ├── SkillExecutor.ts          # 스킬 실행 엔진
│   │   ├── SkillScheduler.ts         # cron 스케줄러
│   │   └── ClaudeMdGenerator.ts      # CLAUDE.md 자동 생성
│   └── event-bus/
│       ├── EventBus.ts
│       ├── events.ts
│       └── handlers/slack-handler.ts
├── sdk/index.js                      # @mini-bot/sdk
├── skills/                           # 내장 스킬 (비어 있음)
├── SOUL.md                           # 봇 페르소나
└── CLAUDE.md                         # 자동 생성됨
```

---

## 스킬 우선순위

```
사용자 스킬 (~/.mini-bot/skills/)
    > 내장 스킬 (<project>/skills/)
```

같은 이름이면 사용자 스킬이 우선합니다.
