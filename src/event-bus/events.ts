export type EventType = "slack_message";

export interface BaseEvent {
  type: EventType;
  source: string;
  timestamp: Date;
  id: string;
}

export interface SlackMessageEvent extends BaseEvent {
  type: "slack_message";
  data: {
    channel: string;
    userId: string;
    message: string;
    isDirectMessage: boolean;
    isOwner: boolean;
    ts: string;
    thread_ts?: string;
  };
}

export type Event = SlackMessageEvent;
export type EventHandler = (event: Event) => Promise<void>;
export type EventFilter = (event: Event) => boolean;
