import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { App } from "@slack/bolt";
import { Event, SlackMessageEvent } from "../events";
import { ClaudeSession, clearConversation } from "../../claude/ClaudeSession";
import { SkillLoader } from "../../skills/SkillLoader";
import { ClaudeMdGenerator } from "../../skills/ClaudeMdGenerator";
import { SkillScheduler } from "../../skills/SkillScheduler";

export interface SlackHandlerDeps {
  slackApp: App;
  skillLoader: SkillLoader;
  claudeMdGenerator: ClaudeMdGenerator;
  skillScheduler: SkillScheduler;
  /** 기본 작업 디렉토리 (봇 설치 경로). 채널별 override가 없으면 이 값 사용. */
  defaultWorkingDir: string;
}

export class SlackMessageHandler {
  private deps: SlackHandlerDeps;
  /**
   * 채널별 작업 디렉토리 (사용자가 "작업 디렉토리 <path>" 로 변경)
   * 없으면 defaultWorkingDir 사용
   */
  private workingDirs: Map<string, string> = new Map();

  constructor(deps: SlackHandlerDeps) {
    this.deps = deps;
  }

  async handle(event: Event): Promise<void> {
    if (event.type !== "slack_message") return;

    const slackEvent = event as SlackMessageEvent;
    const { channel, message, userId, thread_ts, isOwner } = slackEvent.data;

    console.log(`💬 메시지: "${message}" (채널: ${channel})`);

    // ── 비오너: 허용된 스킬만 실행 ──────────────────────────────
    if (!isOwner) {
      await this.handleRestricted(channel, message, userId, thread_ts);
      return;
    }

    // ── 내장 명령어 ────────────────────────────────────────────

    if (message === "초기화" || message === "리셋") {
      clearConversation(channel);
      this.workingDirs.delete(channel); // 작업 디렉토리도 초기화
      await this.post(
        channel,
        "🔄 대화 기록과 작업 디렉토리를 초기화했습니다.",
      );
      return;
    }

    if (message === "스킬 목록") {
      await this.handleSkillList(channel);
      return;
    }

    if (message === "스킬 새로고침") {
      await this.handleSkillReload(channel);
      return;
    }

    if (message === "현재 디렉토리") {
      const cwd = this.getWorkingDir(channel);
      const label = this.workingDirs.has(channel) ? "사용자 설정" : "기본값";
      await this.post(channel, `📁 현재 작업 디렉토리 (${label})\n\`${cwd}\``);
      return;
    }

    // "작업 디렉토리 <path>" 또는 "cd <path>"
    const dirMatch =
      message.match(/^작업 디렉토리\s+(.+)$/) || message.match(/^cd\s+(.+)$/);

    if (dirMatch) {
      await this.handleChangeDir(channel, dirMatch[1].trim());
      return;
    }

    // ── 스레드 요약 직접 실행 ──────────────────────────────────
    const summarizeTriggers = [
      "요약하고 노션에 기록해줘",
      "슬랙 요약",
      "스레드 요약",
      "노션에 정리해줘",
      "노션에 저장해줘",
    ];
    if (thread_ts && summarizeTriggers.some((t) => message.includes(t))) {
      await this.deps.skillScheduler.runSkill(
        "slack-summarize",
        [channel, thread_ts, userId],
        { timeout: 120000 },
      );
      return;
    }

    // ── 스레드 요약 → JIRA description append ─────────────────
    const jiraRecordTriggers = [
      "요약하고 JIRA 카드에 기록해줘",
      "jira에 기록해줘",
      "jira 카드에 추가",
      "JIRA에 정리해줘",
      "jira description에 추가",
    ];
    const jiraUrlMatch = message.match(
      /https?:\/\/[^\s>]+\/browse\/([A-Z]+-\d+)/i,
    );
    if (
      thread_ts &&
      jiraUrlMatch &&
      jiraRecordTriggers.some((t) =>
        message.toLowerCase().includes(t.toLowerCase()),
      )
    ) {
      const jiraKey = jiraUrlMatch[1].toUpperCase();
      await this.deps.skillScheduler.runSkill(
        "slack-to-jira",
        [channel, thread_ts, jiraKey, userId],
        { timeout: 120000 },
      );
      return;
    }

    // ── Claude에게 위임 ─────────────────────────────────────────
    await this.handleWithClaude(channel, message, thread_ts);
  }

  // ── 비오너 restricted 핸들러 ─────────────────────────────────

  private async handleRestricted(
    channel: string,
    message: string,
    userId: string,
    thread_ts?: string,
  ): Promise<void> {
    const summarizeTriggers = [
      "요약하고 노션에 기록해줘",
      "슬랙 요약",
      "스레드 요약",
      "노션에 정리해줘",
      "노션에 저장해줘",
    ];
    const jiraRecordTriggers = [
      "요약하고 jira 카드에 기록해줘",
      "jira에 기록해줘",
      "jira 카드에 추가",
      "jira에 정리해줘",
      "jira description에 추가",
      "지라 카드에 추가",
      "지라에 정리해줘",
      "지라에 저장해줘",
    ];
    const jiraUrlMatch = message.match(
      /https?:\/\/[^\s>]+\/browse\/([A-Z]+-\d+)/i,
    );

    // 1. 스레드 요약 → Notion
    if (thread_ts && summarizeTriggers.some((t) => message.includes(t))) {
      await this.deps.skillScheduler.runSkill(
        "slack-summarize",
        [channel, thread_ts, userId],
        { timeout: 120000 },
      );
      return;
    }

    // 2. 스레드 요약 → Jira
    if (
      thread_ts &&
      jiraUrlMatch &&
      jiraRecordTriggers.some((t) =>
        message.toLowerCase().includes(t.toLowerCase()),
      )
    ) {
      const jiraKey = jiraUrlMatch[1].toUpperCase();
      await this.deps.skillScheduler.runSkill(
        "slack-to-jira",
        [channel, thread_ts, jiraKey, userId],
        { timeout: 120000 },
      );
      return;
    }

    // 3. thread_ts 없이 요약 트리거만 보낸 경우 안내
    if (
      !thread_ts &&
      (summarizeTriggers.some((t) => message.includes(t)) ||
        jiraRecordTriggers.some((t) =>
          message.toLowerCase().includes(t.toLowerCase()),
        ))
    ) {
      await this.post(
        channel,
        `<@${userId}> 스레드 안에서 멘션해주세요. 요약할 스레드가 필요합니다.`,
      );
      return;
    }

    // 4. 허용되지 않은 요청 거절
    await this.post(
      channel,
      `<@${userId}> 저는 이 채널에서 다음 기능만 지원합니다:\n• *스레드 요약 후 노션 저장* — 스레드에서 \`스레드 요약\` 멘션\n• *스레드 요약 후 Jira 기록* — 스레드에서 \`jira에 기록해줘 <Jira URL>\` 멘션`,
      thread_ts,
    );
  }

  // ── 명령어 핸들러 ────────────────────────────────────────────

  private async handleChangeDir(
    channel: string,
    inputPath: string,
  ): Promise<void> {
    // ~ 확장
    const resolved = inputPath.startsWith("~")
      ? path.join(os.homedir(), inputPath.slice(1))
      : path.resolve(inputPath);

    if (!fs.existsSync(resolved)) {
      await this.post(channel, `❌ 경로가 존재하지 않습니다:\n\`${resolved}\``);
      return;
    }

    if (!fs.statSync(resolved).isDirectory()) {
      await this.post(channel, `❌ 디렉토리가 아닙니다:\n\`${resolved}\``);
      return;
    }

    // 작업 디렉토리 변경 + 대화 기록 초기화 (새 cwd로 새 세션 시작)
    this.workingDirs.set(channel, resolved);
    clearConversation(channel);

    await this.post(
      channel,
      `📁 작업 디렉토리 변경됨\n\`${resolved}\`\n\n_대화 기록이 초기화되었습니다 (새 디렉토리로 새 세션 시작)._`,
    );
  }

  private async handleSkillList(channel: string): Promise<void> {
    const skills = this.deps.skillLoader.getAllSkills();

    if (skills.length === 0) {
      await this.post(
        channel,
        "📦 *등록된 스킬 없음*\n\nCLAUDE.md의 안내를 참고해서 스킬을 추가하세요.",
      );
      return;
    }

    const lines = skills.map((s) => {
      const icon = s.source === "user" ? "👤" : "🔧";
      const schedule = s.metadata.schedule?.enabled
        ? ` _(${s.metadata.schedule.cron})_`
        : "";
      return `${icon} \`${s.name}\`${schedule}\n   ${s.metadata.description}`;
    });

    await this.post(
      channel,
      `📦 *현재 스킬 (${skills.length}개)*\n\n${lines.join("\n\n")}`,
    );
  }

  private async handleSkillReload(channel: string): Promise<void> {
    await this.post(channel, "🔄 스킬 재로딩 중...");

    try {
      this.deps.skillScheduler.stopAllSchedules();
      await this.deps.skillLoader.loadAllSkills();
      await this.deps.claudeMdGenerator.generate();
      await this.deps.skillScheduler.registerAllSchedules();

      const count = this.deps.skillLoader.getAllSkills().length;
      await this.post(channel, `✅ 스킬 새로고침 완료! (${count}개 로드됨)`);
    } catch (error: any) {
      await this.post(channel, `❌ 새로고침 실패: ${error.message}`);
    }
  }

  private async fetchThreadContext(
    channel: string,
    threadTs: string,
  ): Promise<string | null> {
    try {
      const res = await this.deps.slackApp.client.conversations.replies({
        channel,
        ts: threadTs,
        limit: 100,
      });

      const messages = res.messages || [];
      if (messages.length <= 1) return null;

      return messages
        .map((msg) => {
          const time = new Date(parseFloat(msg.ts!) * 1000).toLocaleString(
            "ko-KR",
          );
          const user = msg.user
            ? `<@${msg.user}>`
            : (msg as any).username || "bot";
          return `[${time}] ${user}: ${msg.text}`;
        })
        .join("\n");
    } catch (err) {
      console.error("스레드 컨텍스트 조회 실패:", err);
      return null;
    }
  }

  private async handleWithClaude(
    channel: string,
    message: string,
    threadTs?: string,
  ): Promise<void> {
    const workingDir = this.getWorkingDir(channel);
    const session = new ClaudeSession(channel, undefined, workingDir);

    const processingMsg = await this.post(
      channel,
      `🤔 처리 중...\n\n> ${message}`,
      threadTs,
    );
    const msgTs = processingMsg?.ts;

    try {
      let fullMessage = message;

      if (threadTs) {
        const threadContext = await this.fetchThreadContext(channel, threadTs);
        if (threadContext) {
          fullMessage = `[스레드 내용]\n${threadContext}\n\n[사용자 요청]\n${message}`;
        }
      }

      const { result } = await session.sendMessage(fullMessage);

      if (result.length > 3000) {
        await this.update(
          channel,
          msgTs,
          `✅ 완료 (파일로 전송)\n\n> ${message}`,
          threadTs,
        );
        await this.deps.slackApp.client.files.uploadV2({
          channels: channel,
          content: result,
          filename: "response.txt",
          title: "Claude Response",
        });
      } else {
        await this.update(channel, msgTs, result, threadTs);
      }
    } catch (error: any) {
      console.error("Claude 실행 오류:", error);
      await this.update(channel, msgTs, `❌ 오류: ${error.message}`, threadTs);
    }
  }

  // ── 유틸 ────────────────────────────────────────────────────

  /** 채널에 설정된 작업 디렉토리. 없으면 기본값. */
  private getWorkingDir(channel: string): string {
    return this.workingDirs.get(channel) ?? this.deps.defaultWorkingDir;
  }

  private async post(
    channel: string,
    text: string,
    threadTs?: string,
  ): Promise<any> {
    try {
      return await this.deps.slackApp.client.chat.postMessage({
        channel,
        text,
        ...(threadTs && { thread_ts: threadTs }),
      });
    } catch (error) {
      console.error("메시지 전송 실패:", error);
    }
  }

  private async update(
    channel: string,
    ts: string | undefined,
    text: string,
    threadTs?: string,
  ): Promise<void> {
    if (!ts) {
      await this.post(channel, text, threadTs);
      return;
    }
    try {
      await this.deps.slackApp.client.chat.update({ channel, ts, text });
    } catch {
      await this.post(channel, text, threadTs);
    }
  }
}

export function createSlackHandler(deps: SlackHandlerDeps) {
  const handler = new SlackMessageHandler(deps);
  return (event: Event) => handler.handle(event);
}
