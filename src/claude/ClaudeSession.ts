import { spawn } from "child_process";

// 채널별 세션 ID 저장소
const sessions = new Map<string, string>();

export function clearConversation(conversationId: string): void {
  sessions.delete(conversationId);
}

interface ClaudeMessage {
  type: string;
  session_id?: string;
  result?: string;
  subtype?: string;
  content?: Array<{ type: string; text?: string; [key: string]: any }>;
  [key: string]: any;
}

export type ProgressCallback = (status: string) => void;

export class ClaudeSession {
  private conversationId: string;
  private onProgress?: ProgressCallback;
  private workingDir: string;

  constructor(
    conversationId: string,
    onProgress?: ProgressCallback,
    workingDir?: string
  ) {
    this.conversationId = conversationId;
    this.onProgress = onProgress;
    this.workingDir = workingDir || process.cwd();
  }

  async sendMessage(
    userMessage: string
  ): Promise<{ sessionId: string; result: string }> {
    const existingSessionId = sessions.get(this.conversationId);

    return new Promise((resolve, reject) => {
      const args = [
        "--print",
        "--verbose",
        "--output-format",
        "stream-json",
        "--permission-mode",
        "bypassPermissions",
      ];

      if (existingSessionId) {
        args.push("--resume", existingSessionId);
      }

      args.push(userMessage);

      const claudePath = process.env.CLAUDE_PATH || "claude";

      // 중첩 세션 방지를 위해 Claude 관련 환경변수 제거
      const cleanEnv = { ...process.env };
      delete cleanEnv.CLAUDECODE;
      delete cleanEnv.CLAUDE_CODE_ENTRYPOINT;

      const claude = spawn(claudePath, args, {
        env: cleanEnv,
        stdio: ["inherit", "pipe", "pipe"],
        cwd: this.workingDir,
      });

      let result = "";
      let newSessionId: string | undefined;
      let buffer = "";
      let stderrOutput = "";

      claude.stderr.on("data", (data: Buffer) => {
        stderrOutput += data.toString();
      });

      claude.stdout.on("data", (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const message: ClaudeMessage = JSON.parse(line);
            this.handleProgress(message);

            if (message.type === "system" && message.session_id) {
              newSessionId = message.session_id;
            }

            if (message.type === "result" && message.result) {
              result = message.result;
            }

            if (message.type === "assistant" && message.content) {
              for (const block of message.content) {
                if (block.type === "text" && block.text) {
                  result = block.text;
                }
              }
            }
          } catch {
            // JSON 파싱 실패 무시
          }
        }
      });

      claude.on("close", (code) => {
        if (newSessionId) {
          sessions.set(this.conversationId, newSessionId);
        }

        if (code === 0) {
          resolve({
            sessionId: newSessionId || existingSessionId || "",
            result: result || "완료했습니다.",
          });
        } else {
          const errorMsg = stderrOutput.trim() || `exit code ${code}`;

          // 세션 ID로 resume 실패한 경우 세션 초기화
          if (existingSessionId) {
            sessions.delete(this.conversationId);
          }

          reject(new Error(`Claude 오류: ${errorMsg}`));
        }
      });

      claude.on("error", (err) => {
        reject(new Error(`Claude 실행 실패: ${err.message}`));
      });
    });
  }

  private handleProgress(message: ClaudeMessage): void {
    if (!this.onProgress) return;

    switch (message.type) {
      case "system":
        if (message.subtype === "init") this.onProgress("🔄 세션 시작...");
        break;
      case "assistant":
        if (message.content) {
          for (const block of message.content) {
            if (block.type === "tool_use") {
              this.onProgress(`🔧 ${block.name || "도구"} 실행 중...`);
              break;
            }
          }
        }
        break;
      case "result":
        this.onProgress("✨ 완료!");
        break;
    }
  }
}
