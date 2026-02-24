import * as dotenv from "dotenv";
import { SlackApp } from "./slack/SlackApp";
import { EventBus } from "./event-bus/EventBus";
import { SkillLoader } from "./skills/SkillLoader";
import { SkillScheduler } from "./skills/SkillScheduler";
import { ClaudeMdGenerator } from "./skills/ClaudeMdGenerator";
import { createSlackHandler } from "./event-bus/handlers/slack-handler";

dotenv.config();

const {
  SLACK_BOT_TOKEN,
  SLACK_SIGNING_SECRET,
  SLACK_APP_TOKEN,
  MY_SLACK_USER_ID,
  TARGET_CHANNEL,
} = process.env;

if (!SLACK_BOT_TOKEN || !SLACK_SIGNING_SECRET || !SLACK_APP_TOKEN) {
  console.error("❌ Slack 환경변수 누락: SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_APP_TOKEN");
  process.exit(1);
}

if (!MY_SLACK_USER_ID) {
  console.error("❌ MY_SLACK_USER_ID 누락: Slack 프로필 > 멤버 ID 확인");
  process.exit(1);
}

async function main() {
  console.log("🤖 mini-bot 시작 중...\n");

  // 1. 스킬 로딩
  const skillLoader = new SkillLoader();
  await skillLoader.loadAllSkills();

  // 2. CLAUDE.md 자동 생성
  const claudeMdGenerator = new ClaudeMdGenerator(skillLoader);
  await claudeMdGenerator.generate();

  // 3. EventBus 초기화
  const eventBus = new EventBus();

  // 4. Slack 앱 초기화
  const slackApp = new SlackApp({
    botToken: SLACK_BOT_TOKEN!,
    signingSecret: SLACK_SIGNING_SECRET!,
    appToken: SLACK_APP_TOKEN!,
    myUserId: MY_SLACK_USER_ID!,
    eventBus,
  });

  // 5. 스케줄러 초기화
  const targetChannel = TARGET_CHANNEL || MY_SLACK_USER_ID!;
  const skillScheduler = new SkillScheduler(
    skillLoader,
    slackApp.getApp(),
    targetChannel
  );
  await skillScheduler.registerAllSchedules();

  // 6. Slack 메시지 핸들러 등록
  const slackHandler = createSlackHandler({
    slackApp: slackApp.getApp(),
    skillLoader,
    claudeMdGenerator,
    skillScheduler,
    defaultWorkingDir: process.cwd(),
  });
  eventBus.on("slack_message", slackHandler);

  // 7. Slack 앱 시작
  await slackApp.start();

  // 종료 처리
  const shutdown = () => {
    console.log("\n🛑 mini-bot 종료 중...");
    skillScheduler.stopAllSchedules();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  const skillCount = skillLoader.getAllSkills().length;
  const scheduleCount = skillScheduler.getScheduledNames().length;

  console.log("\n✅ 준비 완료!");
  console.log(`   스킬: ${skillCount}개 (스케줄: ${scheduleCount}개)`);
  console.log(`   알림 채널: ${targetChannel}`);
  console.log(`   사용자 스킬 디렉토리: ${skillLoader.getUserDir()}`);
  console.log('\n   "스킬 새로고침" — 스킬 추가 후 재스캔');
  console.log('   "스킬 목록" — 현재 스킬 확인\n');
}

main().catch((error) => {
  console.error("❌ 시작 실패:", error);
  process.exit(1);
});
