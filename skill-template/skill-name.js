/**
 * skill-name.js — 스킬 스크립트 템플릿
 *
 * 이 파일을 복사해서 시작하세요.
 *
 * 실행 방식: node skill-name.js [channel]
 * 환경변수:  process.env.MINI_BOT_SDK_PATH (봇이 자동 설정)
 */

"use strict";

const { slack, env, log } = require(process.env.MINI_BOT_SDK_PATH);

async function main(args) {
  // 첫 번째 인자는 Slack 채널 ID (봇이 자동으로 전달)
  const channel = args[0] || env.MY_SLACK_USER_ID;

  log.info("스킬 실행 시작");

  // ---- 여기에 스킬 로직을 작성하세요 ----

  await slack.send(channel, "안녕하세요! 스킬이 실행되었습니다.");

  // ---- 항상 JSON으로 결과를 출력합니다 ----
  console.log(JSON.stringify({
    success: true,
    message: "스킬 실행 완료",
  }));
}

main(process.argv.slice(2)).catch((e) => {
  log.error("스킬 실행 실패:", e.message);
  console.log(JSON.stringify({ success: false, error: e.message }));
  process.exit(1);
});
