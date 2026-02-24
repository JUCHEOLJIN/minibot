import * as fs from "fs/promises";
import * as path from "path";
import { SkillLoader } from "./SkillLoader";
import { Skill } from "./types";

/**
 * 현재 로드된 스킬 목록을 반영하여 CLAUDE.md를 자동 생성합니다.
 *
 * Claude는 이 파일을 읽어 스킬 목록을 파악하고,
 * 필요시 새 스킬을 직접 파일로 생성할 수 있습니다.
 */
export class ClaudeMdGenerator {
  private readonly outputPath: string;
  private skillLoader: SkillLoader;

  constructor(skillLoader: SkillLoader) {
    this.skillLoader = skillLoader;
    this.outputPath = path.join(process.cwd(), "CLAUDE.md");
  }

  async generate(): Promise<void> {
    const skills = this.skillLoader.getAllSkills();
    const content = this.buildContent(skills);
    await fs.writeFile(this.outputPath, content, "utf-8");
    console.log(`📄 CLAUDE.md 생성 완료 (${skills.length}개 스킬 반영)`);
  }

  private buildContent(skills: Skill[]): string {
    const userDir = this.skillLoader.getUserDir();
    const now = new Date().toLocaleString("ko-KR");

    const skillSection =
      skills.length === 0
        ? "_아직 등록된 스킬이 없습니다._\n\n스킬을 추가하면 여기에 자동으로 표시됩니다."
        : skills
            .map((s) => this.renderSkill(s))
            .join("\n\n---\n\n");

    return `# mini-bot

> 자동 생성됨: ${now}
> 스킬 추가 후 "스킬 새로고침" 명령으로 업데이트됩니다.

---

## 현재 스킬 목록 (${skills.length}개)

${skillSection}

---

## 봇 명령어

| 명령 | 설명 |
|---|---|
| \`초기화\` | 현재 채널의 대화 기록을 초기화합니다 |
| \`스킬 목록\` | 현재 로드된 스킬 목록을 보여줍니다 |
| \`스킬 새로고침\` | 스킬 디렉토리를 재스캔하고 CLAUDE.md를 업데이트합니다 |

---

## 스킬 추가 방법

사용자가 직접 파일을 만들거나, **Claude(나)가 직접 파일을 생성**할 수 있습니다.

### 사용자 스킬 디렉토리

\`\`\`
${userDir}/
└── <skill-name>/
    ├── SKILL.md          # 스킬 메타데이터 (필수)
    └── <skill-name>.js   # 실행 스크립트 (필수)
\`\`\`

### SKILL.md 형식

\`\`\`yaml
---
name: my-skill
description: 스킬 설명 (Claude가 언제 이 스킬을 써야 하는지 명확하게)
triggers:
  - "트리거 키워드 1"
  - "trigger keyword 2"
schedule:             # 자동 실행 (선택)
  cron: "0 9 * * *"  # 매일 오전 9시
  enabled: false
  timezone: "Asia/Seoul"
---

## 스킬 설명

이 스킬이 하는 일을 상세하게 적어두세요.
\`\`\`

### 스킬 스크립트 형식

\`\`\`javascript
// <skill-name>.js
const { slack, env, log } = require(process.env.MINI_BOT_SDK_PATH);

async function main(args) {
  // 스킬 로직 작성
  const channel = args[0] || env.TARGET_CHANNEL;

  await slack.send(channel, "안녕하세요!");

  // 항상 JSON으로 결과를 출력합니다
  console.log(JSON.stringify({ success: true, message: "완료" }));
}

main(process.argv.slice(2)).catch((e) => {
  console.error(JSON.stringify({ success: false, error: e.message }));
  process.exit(1);
});
\`\`\`

---

## Claude가 직접 스킬을 만드는 방법

사용자가 새 기능을 요청하면 Claude는 직접 스킬 파일을 생성할 수 있습니다.

**예시 요청:** "매일 아침 날씨를 알려주는 스킬 만들어줘"

**Claude의 행동:**
1. \`${userDir}/weather/SKILL.md\` 생성
2. \`${userDir}/weather/weather.js\` 생성
3. 사용자에게 "스킬 새로고침" 안내

**규칙:**
- 스킬 이름은 영문 소문자와 하이픈만 사용 (예: \`daily-report\`)
- 스크립트는 항상 JSON을 stdout으로 출력 (\`{ success: true }\`)
- 외부 API 키는 \`.env\` 에서 \`process.env\`로 읽음
- 에러 시 \`process.exit(1)\` 호출

---

## SDK 레퍼런스 (\`MINI_BOT_SDK_PATH\`)

\`\`\`javascript
const { slack, env, log } = require(process.env.MINI_BOT_SDK_PATH);

// Slack 메시지 전송
await slack.send(channel, "텍스트 메시지");
await slack.sendBlocks(channel, blocks);   // Block Kit

// 환경변수 접근
env.SLACK_BOT_TOKEN
env.TARGET_CHANNEL
env.MY_SLACK_USER_ID

// 구조화된 로깅
log.info("메시지");
log.error("에러");
\`\`\`

---

## 스킬 우선순위

\`\`\`
사용자 스킬 (${userDir}/)
    > 내장 스킬 (<project>/skills/)
\`\`\`

같은 이름의 스킬이 있으면 사용자 스킬이 우선합니다.
`;
  }

  private renderSkill(skill: Skill): string {
    const m = skill.metadata;
    const lines: string[] = [
      `### \`${skill.name}\` [${skill.source}]`,
      "",
      m.description || "_설명 없음_",
    ];

    if (m.triggers && m.triggers.length > 0) {
      lines.push(`- **트리거:** ${m.triggers.map((t) => `\`${t}\``).join(", ")}`);
    }

    if (m.schedule?.enabled) {
      lines.push(
        `- **스케줄:** \`${m.schedule.cron}\` (${m.schedule.timezone || "Asia/Seoul"})`
      );
    }

    if (m.argumentHint) {
      lines.push(`- **인자:** \`${m.argumentHint}\``);
    }

    return lines.join("\n");
  }
}
