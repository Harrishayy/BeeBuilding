import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentName, TimelineEvent, TimelineEventType } from '../shared/types.js';

export interface TimelineFilter {
  agentName?: AgentName;
  type?: TimelineEventType;
  after?: number;
}

export class TimelineLog {
  constructor(private readonly filePath: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  append(event: TimelineEvent): void {
    const line = JSON.stringify(event) + '\n';
    fs.appendFileSync(this.filePath, line, 'utf-8');
  }

  read(filter?: TimelineFilter): TimelineEvent[] {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }

    const content = fs.readFileSync(this.filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    let events: TimelineEvent[] = lines.map(
      (line) => JSON.parse(line) as TimelineEvent,
    );

    if (filter) {
      if (filter.agentName) {
        const target = filter.agentName;
        events = events.filter((e) => e.agentName === target);
      }
      if (filter.type) {
        const target = filter.type;
        events = events.filter((e) => e.type === target);
      }
      if (filter.after !== undefined) {
        const threshold = filter.after;
        events = events.filter((e) => e.timestamp > threshold);
      }
    }

    return events;
  }

  clear(): void {
    fs.writeFileSync(this.filePath, '', 'utf-8');
  }
}
