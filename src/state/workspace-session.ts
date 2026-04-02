import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { log } from '../util/logger.js';
import type {
  AppPhase,
  PlanDocument,
  AgentArchitecture,
  PlanningMessage,
  TaskDefinition,
} from '../shared/types.js';

const TAG = 'WorkspaceSession';
const DIR_NAME = '.beebuilder';
const STATE_FILE = 'session.json';

export interface PersistedSession {
  version: 1;
  updatedAt: number;
  phase: AppPhase;
  task: TaskDefinition | null;
  planningMessages: PlanningMessage[];
  plan: PlanDocument | null;
  architecture: AgentArchitecture | null;
}

function emptySession(): PersistedSession {
  return {
    version: 1,
    updatedAt: Date.now(),
    phase: 'task',
    task: null,
    planningMessages: [],
    plan: null,
    architecture: null,
  };
}

function getDir(): string | null {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return null;
  return path.join(folders[0].uri.fsPath, DIR_NAME);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    log.debug(TAG, `Created ${DIR_NAME}/ directory`);
  }
}

function filePath(dir: string): string {
  return path.join(dir, STATE_FILE);
}

export function loadSession(): PersistedSession | null {
  const dir = getDir();
  if (!dir) return null;

  const fp = filePath(dir);
  if (!fs.existsSync(fp)) return null;

  try {
    const raw = fs.readFileSync(fp, 'utf-8');
    const parsed = JSON.parse(raw) as PersistedSession;
    if (parsed.version !== 1) return null;
    log.info(TAG, `Loaded session (phase=${parsed.phase}, msgs=${parsed.planningMessages.length})`);
    return parsed;
  } catch (err) {
    log.warn(TAG, 'Failed to read session file, starting fresh', err);
    return null;
  }
}

export function saveSession(session: PersistedSession): void {
  const dir = getDir();
  if (!dir) return;

  ensureDir(dir);
  session.updatedAt = Date.now();

  try {
    fs.writeFileSync(filePath(dir), JSON.stringify(session, null, 2), 'utf-8');
    log.debug(TAG, `Saved session (phase=${session.phase})`);
  } catch (err) {
    log.error(TAG, 'Failed to write session file', err);
  }
}

export function clearSession(): void {
  const dir = getDir();
  if (!dir) return;

  const fp = filePath(dir);
  if (fs.existsSync(fp)) {
    fs.unlinkSync(fp);
    log.info(TAG, 'Cleared session file');
  }
}

export function patchSession(update: Partial<Omit<PersistedSession, 'version'>>): void {
  const existing = loadSession() ?? emptySession();
  saveSession({ ...existing, ...update, version: 1 });
}
