import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentName, PipelineStage, SessionConfig } from '../shared/types.js';

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
    fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
    this.data = this.loadStore();
  }

  private loadStore(): StoreData {
    try {
      if (fs.existsSync(this.storePath)) {
        const raw = fs.readFileSync(this.storePath, 'utf-8');
        return JSON.parse(raw) as StoreData;
      }
    } catch {
      // Corrupted file, start fresh
    }
    return { sessions: [], pipelineStates: {}, agentOutputs: [] };
  }

  private persist(): void {
    fs.writeFileSync(this.storePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  createSession(config: SessionConfig): string {
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
    return session?.config ?? null;
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
    this.persist();
  }
}
