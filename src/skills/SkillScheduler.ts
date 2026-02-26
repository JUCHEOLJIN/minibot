import * as cron from "node-cron";
import { App } from "@slack/bolt";
import { SkillLoader } from "./SkillLoader";
import { SkillExecutor } from "./SkillExecutor";
import { Skill } from "./types";

export class SkillScheduler {
  private skillLoader: SkillLoader;
  private skillExecutor: SkillExecutor;
  private slackApp: App;
  private targetChannel: string;
  private scheduledTasks: Map<string, cron.ScheduledTask> = new Map();

  constructor(skillLoader: SkillLoader, slackApp: App, targetChannel: string) {
    this.skillLoader = skillLoader;
    this.skillExecutor = new SkillExecutor();
    this.slackApp = slackApp;
    this.targetChannel = targetChannel;
  }

  async registerAllSchedules(): Promise<void> {
    const scheduledSkills = this.skillLoader.getScheduledSkills();
    if (scheduledSkills.length === 0) {
      console.log("⏰ 등록할 스케줄 없음\n");
      return;
    }

    console.log(`⏰ 스케줄 등록 (${scheduledSkills.length}개):`);
    for (const skill of scheduledSkills) {
      try {
        this.registerOne(skill);
      } catch (error: any) {
        console.error(`   ❌ ${skill.name} 등록 실패:`, error.message);
      }
    }
    console.log(`   총 ${this.scheduledTasks.size}개 등록 완료\n`);
  }

  private registerOne(skill: Skill): void {
    const schedule = skill.metadata.schedule;
    if (!schedule?.enabled) return;

    if (!cron.validate(schedule.cron)) {
      throw new Error(`잘못된 cron 표현식: ${schedule.cron}`);
    }

    const task = cron.schedule(
      schedule.cron,
      async () => {
        console.log(
          `\n⏰ 스케줄 실행: ${skill.name} (${new Date().toLocaleString("ko-KR")})`
        );
        try {
          const result = await this.skillExecutor.execute(skill, [], {
            channel: this.targetChannel,
          });
          if (!result.success) throw new Error(result.error || "Unknown error");
        } catch (error: any) {
          console.error(`   ❌ 스케줄 실행 실패:`, error.message);
          await this.slackApp.client.chat.postMessage({
            channel: this.targetChannel,
            text: `❌ 스케줄 오류 (${skill.name}): ${error.message}`,
          });
        }
      },
      {
        scheduled: true,
        timezone: schedule.timezone || "Asia/Seoul",
      }
    );

    this.scheduledTasks.set(skill.name, task);
    console.log(
      `   ✅ ${skill.name}  cron="${schedule.cron}"  tz="${schedule.timezone || "Asia/Seoul"}"`
    );
  }

  stopAllSchedules(): void {
    for (const [name, task] of this.scheduledTasks) {
      task.stop();
      console.log(`⏸️  스케줄 중지: ${name}`);
    }
    this.scheduledTasks.clear();
  }

  getScheduledNames(): string[] {
    return Array.from(this.scheduledTasks.keys());
  }

  async runSkill(skillName: string, args: string[], options: { timeout?: number } = {}): Promise<void> {
    const skill = this.skillLoader.getSkill(skillName);
    if (!skill) {
      console.error(`스킬 없음: ${skillName}`);
      return;
    }
    await this.skillExecutor.execute(skill, args, { timeout: options.timeout });
  }
}
