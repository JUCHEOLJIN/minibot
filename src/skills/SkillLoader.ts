import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import matter from "gray-matter";
import { Skill, SkillMetadata } from "./types";

/**
 * 2단계 스킬 로더
 *
 * 1단계: <project>/skills/       — 내장 스킬 (기본값으로 비어 있음)
 * 2단계: ~/.mini-bot/skills/     — 사용자 정의 스킬
 *
 * 같은 이름이면 사용자 스킬이 우선합니다.
 */
export class SkillLoader {
  private readonly builtinDir: string;
  private readonly userDir: string;
  private skills: Map<string, Skill> = new Map();

  constructor() {
    this.builtinDir = path.join(process.cwd(), "skills");
    this.userDir = path.join(os.homedir(), ".mini-bot", "skills");
  }

  getUserDir(): string {
    return this.userDir;
  }

  async loadAllSkills(): Promise<Map<string, Skill>> {
    this.skills.clear();

    // 사용자 스킬 디렉토리 자동 생성
    await fs.mkdir(this.userDir, { recursive: true });

    console.log("🔍 스킬 로딩...");
    console.log(`   내장: ${this.builtinDir}`);
    console.log(`   사용자: ${this.userDir}`);

    // 1단계: 내장 스킬 로드
    await this.loadFromDir(this.builtinDir, "builtin");

    // 2단계: 사용자 스킬 로드 (같은 이름이면 덮어씀)
    await this.loadFromDir(this.userDir, "user");

    const builtinCount = [...this.skills.values()].filter(
      (s) => s.source === "builtin"
    ).length;
    const userCount = [...this.skills.values()].filter(
      (s) => s.source === "user"
    ).length;

    console.log(
      `\n📦 총 ${this.skills.size}개 스킬 로드 완료 (내장: ${builtinCount}, 사용자: ${userCount})\n`
    );

    return this.skills;
  }

  private async loadFromDir(
    dir: string,
    source: "builtin" | "user"
  ): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillName = entry.name;
        try {
          const skill = await this.loadSkill(dir, skillName, source);
          if (skill) {
            const overriding = this.skills.has(skillName);
            this.skills.set(skillName, skill);
            if (overriding) {
              console.log(
                `  🔄 ${skillName} (사용자 스킬로 덮어씀)`
              );
            } else {
              console.log(`  ✅ ${skillName} [${source}]`);
            }
          }
        } catch (error: any) {
          console.warn(`  ⚠️  ${skillName} 로드 실패:`, error.message);
        }
      }
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        console.warn(`  ⚠️  ${dir} 스캔 실패:`, error.message);
      }
    }
  }

  private async loadSkill(
    dir: string,
    skillName: string,
    source: "builtin" | "user"
  ): Promise<Skill | null> {
    const skillPath = path.join(dir, skillName);
    const skillMdPath = path.join(skillPath, "SKILL.md");

    if (!(await this.fileExists(skillMdPath))) return null;

    const metadata = await this.parseSkillMd(skillMdPath);

    // 스크립트 경로 결정
    let scriptPath = "";

    if (metadata.scriptName) {
      scriptPath = path.join(skillPath, metadata.scriptName);
    } else {
      scriptPath = path.join(skillPath, `${skillName}.js`);
    }

    if (!(await this.fileExists(scriptPath))) {
      const files = await fs.readdir(skillPath);
      const jsFile = files.find((f) => f.endsWith(".js"));
      if (jsFile) {
        scriptPath = path.join(skillPath, jsFile);
      } else {
        return null; // 스크립트 없으면 무시
      }
    }

    return { name: skillName, path: skillPath, scriptPath, metadata, source };
  }

  private async parseSkillMd(filePath: string): Promise<SkillMetadata> {
    const content = await fs.readFile(filePath, "utf-8");
    const { data } = matter(content);

    return {
      name: data.name || "",
      description: data.description || "",
      argumentHint: data["argument-hint"] || data.argumentHint,
      allowedTools: data["allowed-tools"] || data.allowedTools,
      scriptName: data["script-name"] || data.scriptName,
      schedule: data.schedule
        ? {
            cron: data.schedule.cron,
            enabled: data.schedule.enabled ?? false,
            timezone: data.schedule.timezone,
          }
        : undefined,
      triggers: data.triggers || [],
      dependencies: data.dependencies || [],
      disableModelInvocation:
        data["disable-model-invocation"] ||
        data.disableModelInvocation ||
        false,
    };
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  getSkill(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  getScheduledSkills(): Skill[] {
    return this.getAllSkills().filter(
      (skill) => skill.metadata.schedule?.enabled
    );
  }

  findSkillByTrigger(trigger: string): Skill | undefined {
    const lower = trigger.toLowerCase();
    return this.getAllSkills().find((skill) =>
      skill.metadata.triggers?.some(
        (t) =>
          t.toLowerCase().includes(lower) || lower.includes(t.toLowerCase())
      )
    );
  }
}
