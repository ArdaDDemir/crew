import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { CrewEvent, EventStore, ThreadRef } from "@crew/core";

function fileName(thread: ThreadRef): string {
  return thread.kind === "channel"
    ? `channel-${thread.id}.jsonl`
    : `dm-${thread.id}.jsonl`;
}

export class JsonlEventStore implements EventStore {
  constructor(private readonly dir: string) {}

  append(event: CrewEvent): void {
    mkdirSync(this.dir, { recursive: true });
    const path = join(this.dir, fileName(event.thread));
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(event)}\n`, "utf8");
  }

  read(thread: ThreadRef): CrewEvent[] {
    const path = join(this.dir, fileName(thread));
    if (!existsSync(path)) return [];
    const body = readFileSync(path, "utf8");
    return body
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as CrewEvent);
  }

  listThreads(): ThreadRef[] {
    if (!existsSync(this.dir)) return [];
    const out: ThreadRef[] = [];
    for (const name of readdirSync(this.dir)) {
      if (name.startsWith("channel-") && name.endsWith(".jsonl")) {
        out.push({ kind: "channel", id: name.slice("channel-".length, -".jsonl".length) });
      } else if (name.startsWith("dm-") && name.endsWith(".jsonl")) {
        out.push({ kind: "dm", id: name.slice("dm-".length, -".jsonl".length) });
      }
    }
    return out;
  }
}
