import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Skill, SkillExecutionResult } from "./types";

const LOG_DIR = path.join(os.homedir(), ".mini-bot", "logs");

function writeLog(entry: Record<string, unknown>): void {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const logPath = path.join(LOG_DIR, `${date}.jsonl`);
    fs.appendFileSync(logPath, JSON.stringify(entry) + "\n");
  } catch {
    // 로그 실패는 무시
  }
}

export class SkillExecutor {
  private readonly defaultTimeout: number = 30000;
  private readonly sdkPath: string;

  constructor() {
    // SDK 경로를 환경변수로 스킬 프로세스에 전달
    this.sdkPath = path.join(process.cwd(), "sdk", "index.js");
  }

  async execute(
    skill: Skill,
    args: string[] = [],
    options: { timeout?: number; channel?: string } = {}
  ): Promise<SkillExecutionResult> {
    const { timeout = this.defaultTimeout, channel } = options;

    console.log(`🚀 스킬 실행: ${skill.name} [${skill.source}]`);
    if (args.length > 0) console.log(`   인자: ${args.join(" ")}`);

    try {
      const finalArgs = channel ? [...args, channel] : args;
      const startTime = Date.now();

      const output = execSync(
        `node "${skill.scriptPath}" ${finalArgs.map((a) => `"${a}"`).join(" ")}`,
        {
          encoding: "utf-8",
          timeout,
          cwd: process.cwd(),
          env: {
            ...process.env,
            MINI_BOT_SDK_PATH: this.sdkPath,
          },
        }
      );

      const duration = Date.now() - startTime;
      console.log(`   ✅ 실행 완료 (${duration}ms)`);

      try {
        const result = JSON.parse(output.trim()) as SkillExecutionResult;
        writeLog({ ts: new Date().toISOString(), skill: skill.name, source: skill.source, success: true, duration });
        return result;
      } catch {
        writeLog({ ts: new Date().toISOString(), skill: skill.name, source: skill.source, success: true, duration });
        return { success: true, data: output.trim() };
      }
    } catch (error: any) {
      console.error(`   ❌ 실행 실패: ${error.message}`);
      writeLog({ ts: new Date().toISOString(), skill: skill.name, source: skill.source, success: false, error: error.message });
      return {
        success: false,
        error: error.message,
        stderr: error.stderr?.toString(),
      };
    }
  }
}
