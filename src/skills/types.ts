export interface SkillSchedule {
  cron: string;
  enabled: boolean;
  timezone?: string;
}

export interface SkillMetadata {
  name: string;
  description: string;
  argumentHint?: string;
  allowedTools?: string;
  scriptName?: string;
  schedule?: SkillSchedule;
  triggers?: string[];
  dependencies?: string[];
  disableModelInvocation?: boolean;
  access?: "public" | "owner-only";
  requiresThread?: boolean;
  requiresJiraUrl?: boolean;
}

export interface Skill {
  name: string;
  path: string;
  scriptPath: string;
  metadata: SkillMetadata;
  /** "builtin" | "user" */
  source: "builtin" | "user";
}

export interface SkillExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  [key: string]: any;
}
