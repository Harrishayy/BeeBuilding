import * as fs from 'node:fs';
import * as path from 'node:path';
import { log } from '../util/logger.js';
import type { AgentName, TimelineEvent, TimelineEventType } from '../shared/types.js';

const TAG = 'TimelineLog';

export interface TimelineFilter {
  agentName?: AgentName;
  type?: TimelineEventType;
  after?: number;
}

export class TimelineLog {
  constructor(private readonly filePath: string) {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      log.debug(TAG, `Timeline log initialized: ${filePath}`);
    } catch (err) {
      log.error(TAG, `Failed to create timeline log directory: ${filePath}`, err);
      throw err;
    }
  }

  append(event: TimelineEvent): void {
    try {
      const line = JSON.stringify(event) + '\n';
      fs.appendFileSync(this.filePath, line, 'utf-8');
    } catch (err) {
      log.error(TAG, `Failed to append event (type=${event.type})`, err);
    }
  }

  read(filter?: TimelineFilter): TimelineEvent[] {
    if (!fs.existsSync(this.filePath)) {
      log.debug(TAG, 'Timeline file does not exist yet');
      return [];
    }

    try {
      const content = fs.readFileSync(this.filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      let events: TimelineEvent[] = [];
      for (const line of lines) {
        try {
          events.push(JSON.parse(line) as TimelineEvent);
        } catch (parseErr) {
          log.warn(TAG, `Skipping malformed timeline line: ${line.substring(0, 80)}...`);
        }
      }

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

      log.debug(TAG, `Read ${events.length} events (filter: ${JSON.stringify(filter ?? 'none')})`);
      return events;
    } catch (err) {
      log.error(TAG, 'Failed to read timeline', err);
      return [];
    }
  }

  clear(): void {
    try {
      fs.writeFileSync(this.filePath, '', 'utf-8');
      log.debug(TAG, 'Timeline cleared');
    } catch (err) {
      log.error(TAG, 'Failed to clear timeline', err);
    }
  }
}
