import * as fs from 'node:fs';
import * as path from 'node:path';
import { log } from '../util/logger.js';
import type { AgentName, PipelineStage, SessionConfig } from '../shared/types.js';

const TAG = 'SessionManager';

interface StoredSession {
  id: string;
  projectPath: string;
  config: SessionConfig;
  createdAt: number;
}

interface StoredPipelineState {
  sessionId: string;
  stage: PipelineStage;
  snapshot: string;
  updatedAt: number;
}

interface StoredAgentOutput {
  sessionId: string;
  agentName: AgentName;
  output: string;
  createdAt: number;
}

interface StoreData {
  sessions: StoredSession[];
  pipelineStates: Record<string, StoredPipelineState>;
  agentOutputs: StoredAgentOutput[];
}

export class SessionManager {
  private storePath: string;
  private data: StoreData;

  constructor(dbPath: string) {
    this.storePath = dbPath.replace(/\.db$/, '.json');
    log.debug(TAG, `Store path: ${this.storePath}`);

    try {
      fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
    } catch (err) {
      log.error(TAG, 'Failed to create storage directory', err);
      throw err;
    }

    this.data = this.loadStore();
    log.info(TAG, `Loaded ${this.data.sessions.length} sessions from store`);
  }

  private loadStore(): StoreData {
    try {
      if (fs.existsSync(this.storePath)) {
        const raw = fs.readFileSync(this.storePath, 'utf-8');
        const parsed = JSON.parse(raw) as StoreData;
        log.debug(TAG, 'Store loaded from disk');
        return parsed;
      }
    } catch (err) {
      log.warn(TAG, 'Failed to load store (corrupted?), starting fresh', err);
    }
    return { sessions: [], pipelineStates: {}, agentOutputs: [] };
  }

  private persist(): void {
    try {
      fs.writeFileSync(this.storePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      log.error(TAG, 'Failed to persist store to disk', err);
    }
  }

  createSession(config: SessionConfig): string {
    log.info(TAG, `Creating session: ${config.id} (project=${config.projectPath})`);
    this.data.sessions.push({
      id: config.id,
      projectPath: config.projectPath,
      config,
      createdAt: config.createdAt,
    });
    this.persist();
    return config.id;
  }

  loadSession(id: string): SessionConfig | null {
    const session = this.data.sessions.find((s) => s.id === id);
    if (!session) {
      log.debug(TAG, `Session not found: ${id}`);
      return null;
    }
    log.debug(TAG, `Session loaded: ${id}`);
    return session.config;
  }

  updatePipelineState(sessionId: string, stage: PipelineStage, snapshot: string): void {
    this.data.pipelineStates[sessionId] = {
      sessionId,
      stage,
      snapshot,
      updatedAt: Date.now(),
    };
    this.persist();
  }

  storeAgentOutput(sessionId: string, agentName: AgentName, output: string): void {
    log.debug(TAG, `Storing output for ${agentName} (session=${sessionId}, ${output.length} chars)`);
    this.data.agentOutputs.push({
      sessionId,
      agentName,
      output,
      createdAt: Date.now(),
    });
    this.persist();
  }

  getSessionHistory(): Array<{
    id: string;
    projectPath: string;
    createdAt: number;
    stage: string | null;
  }> {
    return this.data.sessions
      .map((s) => ({
        id: s.id,
        projectPath: s.projectPath,
        createdAt: s.createdAt,
        stage: this.data.pipelineStates[s.id]?.stage ?? null,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  close(): void {
    log.debug(TAG, 'Closing session manager');
    this.persist();
  }
}
