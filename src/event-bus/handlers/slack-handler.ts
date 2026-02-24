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
    const { channel, message } = slackEvent.data;

    console.log(`💬 메시지: "${message}" (채널: ${channel})`);

    // ── 내장 명령어 ────────────────────────────────────────────

    if (message === "초기화" || message === "리셋") {
      clearConversation(channel);
      this.workingDirs.delete(channel); // 작업 디렉토리도 초기화
      await this.post(channel, "🔄 대화 기록과 작업 디렉토리를 초기화했습니다.");
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
      message.match(/^작업 디렉토리\s+(.+)$/) ||
      message.match(/^cd\s+(.+)$/);

    if (dirMatch) {
      await this.handleChangeDir(channel, dirMatch[1].trim());
      return;
    }

    // ── Claude에게 위임 ─────────────────────────────────────────
    await this.handleWithClaude(channel, message);
  }

  // ── 명령어 핸들러 ────────────────────────────────────────────

  private async handleChangeDir(channel: string, inputPath: string): Promise<void> {
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
      `📁 작업 디렉토리 변경됨\n\`${resolved}\`\n\n_대화 기록이 초기화되었습니다 (새 디렉토리로 새 세션 시작)._`
    );
  }

  private async handleSkillList(channel: string): Promise<void> {
    const skills = this.deps.skillLoader.getAllSkills();

    if (skills.length === 0) {
      await this.post(
        channel,
        "📦 *등록된 스킬 없음*\n\nCLAUDE.md의 안내를 참고해서 스킬을 추가하세요."
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

    await this.post(channel, `📦 *현재 스킬 (${skills.length}개)*\n\n${lines.join("\n\n")}`);
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

  private async handleWithClaude(channel: string, message: string): Promise<void> {
    const workingDir = this.getWorkingDir(channel);
    const session = new ClaudeSession(channel, undefined, workingDir);

    const processingMsg = await this.post(channel, `🤔 처리 중...\n\n> ${message}`);
    const msgTs = processingMsg?.ts;

    try {
      const { result } = await session.sendMessage(message);

      if (result.length > 3000) {
        await this.update(channel, msgTs, `✅ 완료 (파일로 전송)\n\n> ${message}`);
        await this.deps.slackApp.client.files.uploadV2({
          channels: channel,
          content: result,
          filename: "response.txt",
          title: "Claude Response",
        });
      } else {
        await this.update(channel, msgTs, result);
      }
    } catch (error: any) {
      console.error("Claude 실행 오류:", error);
      await this.update(channel, msgTs, `❌ 오류: ${error.message}`);
    }
  }

  // ── 유틸 ────────────────────────────────────────────────────

  /** 채널에 설정된 작업 디렉토리. 없으면 기본값. */
  private getWorkingDir(channel: string): string {
    return this.workingDirs.get(channel) ?? this.deps.defaultWorkingDir;
  }

  private async post(channel: string, text: string): Promise<any> {
    try {
      return await this.deps.slackApp.client.chat.postMessage({ channel, text });
    } catch (error) {
      console.error("메시지 전송 실패:", error);
    }
  }

  private async update(channel: string, ts: string | undefined, text: string): Promise<void> {
    if (!ts) {
      await this.post(channel, text);
      return;
    }
    try {
      await this.deps.slackApp.client.chat.update({ channel, ts, text });
    } catch {
      await this.post(channel, text);
    }
  }
}

export function createSlackHandler(deps: SlackHandlerDeps) {
  const handler = new SlackMessageHandler(deps);
  return (event: Event) => handler.handle(event);
}
