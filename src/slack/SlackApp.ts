import { App, LogLevel } from "@slack/bolt";
import { EventBus } from "../event-bus/EventBus";
import { SlackMessageEvent } from "../event-bus/events";
import { v4 as uuidv4 } from "uuid";

export interface SlackConfig {
  botToken: string;
  signingSecret: string;
  appToken: string;
  myUserId: string;
  eventBus: EventBus;
  logLevel?: LogLevel;
}

export class SlackApp {
  private app: App;
  private myUserId: string;
  private eventBus: EventBus;

  constructor(config: SlackConfig) {
    this.myUserId = config.myUserId;
    this.eventBus = config.eventBus;

    this.app = new App({
      token: config.botToken,
      signingSecret: config.signingSecret,
      socketMode: true,
      appToken: config.appToken,
      logLevel: config.logLevel || LogLevel.WARN,
    });

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // @멘션 핸들러
    this.app.event("app_mention", async ({ event }) => {
      if (event.user !== this.myUserId) return;

      const message = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();
      if (!message) return;

      await this.emit(
        event.channel,
        event.user,
        message,
        false,
        event.ts,
        (event as any).thread_ts
      );
    });

    // DM 핸들러
    this.app.event("message", async ({ event }) => {
      if ((event as any).bot_id) return;
      if (event.channel_type !== "im") return;
      if ((event as any).user !== this.myUserId) return;

      const message = (event as any).text?.trim();
      if (!message) return;

      await this.emit(event.channel, (event as any).user, message, true);
    });
  }

  private async emit(
    channel: string,
    userId: string,
    message: string,
    isDirectMessage: boolean,
    ts: string = "",
    threadTs?: string
  ): Promise<void> {
    const slackEvent: SlackMessageEvent = {
      type: "slack_message",
      source: "slack",
      timestamp: new Date(),
      id: uuidv4(),
      data: { channel, userId, message, isDirectMessage, ts, thread_ts: threadTs },
    };

    await this.eventBus.emit(slackEvent);
  }

  async start(): Promise<void> {
    await this.app.start();
    console.log("⚡️  mini-bot 실행됨");
    console.log(`   Slack ID: ${this.myUserId}`);
  }

  getApp(): App {
    return this.app;
  }
}
