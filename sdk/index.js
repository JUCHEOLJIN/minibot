/**
 * @mini-bot/sdk
 *
 * 스킬 스크립트에서 사용하는 공통 유틸리티입니다.
 *
 * 사용법:
 *   const { slack, env, log } = require(process.env.MINI_BOT_SDK_PATH);
 */

"use strict";

const { WebClient } = require("@slack/web-api");

// 환경변수 래퍼
const env = new Proxy(process.env, {
  get(target, key) {
    return target[key];
  },
});

// Slack 클라이언트 (지연 초기화)
let _slack = null;
function getSlackClient() {
  if (!_slack) {
    if (!process.env.SLACK_BOT_TOKEN) {
      throw new Error("SLACK_BOT_TOKEN 환경변수가 설정되지 않았습니다.");
    }
    _slack = new WebClient(process.env.SLACK_BOT_TOKEN);
  }
  return _slack;
}

// Slack 헬퍼
const slack = {
  /**
   * 텍스트 메시지 전송
   * @param {string} channel  채널 ID 또는 사용자 ID
   * @param {string} text     메시지 텍스트
   */
  async send(channel, text) {
    return getSlackClient().chat.postMessage({ channel, text });
  },

  /**
   * Block Kit 메시지 전송
   * @param {string} channel
   * @param {Array}  blocks   Block Kit 블록 배열
   * @param {string} [text]   fallback 텍스트
   */
  async sendBlocks(channel, blocks, text = "") {
    return getSlackClient().chat.postMessage({ channel, blocks, text });
  },

  /**
   * 파일 업로드
   * @param {string} channel
   * @param {string} content  파일 내용
   * @param {string} filename
   * @param {string} [title]
   */
  async uploadFile(channel, content, filename, title = "") {
    return getSlackClient().files.uploadV2({
      channels: channel,
      content,
      filename,
      title,
    });
  },
};

// 구조화 로깅 (stderr → 봇 로그, stdout → 결과값)
const log = {
  info(...args) {
    process.stderr.write(`[INFO] ${args.join(" ")}\n`);
  },
  warn(...args) {
    process.stderr.write(`[WARN] ${args.join(" ")}\n`);
  },
  error(...args) {
    process.stderr.write(`[ERROR] ${args.join(" ")}\n`);
  },
};

module.exports = { slack, env, log };
