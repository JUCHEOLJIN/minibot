import { execSync } from "child_process";
import * as path from "path";
import { Skill, SkillExecutionResult } from "./types";

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
        return JSON.parse(output.trim()) as SkillExecutionResult;
      } catch {
        return { success: true, data: output.trim() };
      }
    } catch (error: any) {
      console.error(`   ❌ 실행 실패: ${error.message}`);
      return {
        success: false,
        error: error.message,
        stderr: error.stderr?.toString(),
      };
    }
  }
}
