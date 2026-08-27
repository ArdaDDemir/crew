import { threadKey, type CrewEvent, type ThreadRef } from "./events";

export interface EventStore {
  append(event: CrewEvent): void;
  read(thread: ThreadRef): CrewEvent[];
}

export class MemoryEventStore implements EventStore {
  private readonly byThread = new Map<string, CrewEvent[]>();

  append(event: CrewEvent): void {
    const key = threadKey(event.thread);
    const list = this.byThread.get(key) ?? [];
    list.push(event);
    this.byThread.set(key, list);
  }

  read(thread: ThreadRef): CrewEvent[] {
    return [...(this.byThread.get(threadKey(thread)) ?? [])];
  }
}
