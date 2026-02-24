import { Event, EventType, EventHandler, EventFilter } from "./events";

interface HandlerRegistration {
  handler: EventHandler;
  filter?: EventFilter;
}

export class EventBus {
  private handlers: Map<EventType, HandlerRegistration[]>;
  private globalHandlers: HandlerRegistration[];
  private eventHistory: Event[];
  private maxHistorySize: number;

  constructor(maxHistorySize: number = 100) {
    this.handlers = new Map();
    this.globalHandlers = [];
    this.eventHistory = [];
    this.maxHistorySize = maxHistorySize;
  }

  on(type: EventType, handler: EventHandler, filter?: EventFilter): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push({ handler, filter });
  }

  onAll(handler: EventHandler, filter?: EventFilter): void {
    this.globalHandlers.push({ handler, filter });
  }

  async emit(event: Event): Promise<void> {
    this.addToHistory(event);

    const typeHandlers = this.handlers.get(event.type) || [];
    const allHandlers = [...typeHandlers, ...this.globalHandlers];

    for (const registration of allHandlers) {
      if (registration.filter && !registration.filter(event)) continue;
      try {
        await registration.handler(event);
      } catch (error) {
        console.error(`[EventBus] 핸들러 오류 (${event.type}):`, error);
      }
    }
  }

  private addToHistory(event: Event): void {
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }

  getStats() {
    const eventsByType: Record<string, number> = {};
    for (const event of this.eventHistory) {
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
    }

    let handlerCount = this.globalHandlers.length;
    for (const handlers of this.handlers.values()) {
      handlerCount += handlers.length;
    }

    return {
      totalEvents: this.eventHistory.length,
      eventsByType: eventsByType as Record<EventType, number>,
      handlerCount,
    };
  }
}
