import { threadKey, type CrewEvent, type ThreadRef } from "./events";

export interface EventStore {
  append(event: CrewEvent): void;
  read(thread: ThreadRef): CrewEvent[];
  listThreads(): ThreadRef[];
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

  listThreads(): ThreadRef[] {
    return [...this.byThread.keys()].map((key) => {
      const cut = key.indexOf(":");
      const kind = key.slice(0, cut) as ThreadRef["kind"];
      return { kind, id: key.slice(cut + 1) };
    });
  }
}
