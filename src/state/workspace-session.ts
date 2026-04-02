import { randomUUID } from 'node:crypto';
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
  WorkflowSummary,
} from '../shared/types.js';

const TAG = 'WorkspaceSession';
const DIR_NAME = '.beebuilder';
const INDEX_FILE = 'session.json';
const WORKFLOWS_DIR = 'workflows';

export interface PersistedSession {
  version: 1;
  updatedAt: number;
  phase: AppPhase;
  task: TaskDefinition | null;
  planningMessages: PlanningMessage[];
  plan: PlanDocument | null;
  architecture: AgentArchitecture | null;
}

interface PersistedIndex {
  version: 2;
  activeWorkflowId: string | null;
  workflows: WorkflowSummary[];
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

function emptyIndex(): PersistedIndex {
  return { version: 2, activeWorkflowId: null, workflows: [] };
}

function getDir(): string | null {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return null;
  return path.join(folders[0].uri.fsPath, DIR_NAME);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    log.debug(TAG, `Created directory: ${dir}`);
  }
}

function workflowsDir(baseDir: string): string {
  return path.join(baseDir, WORKFLOWS_DIR);
}

function workflowPath(baseDir: string, id: string): string {
  return path.join(workflowsDir(baseDir), `${id}.json`);
}

// --- Index operations ---

function loadIndex(dir: string): PersistedIndex {
  const fp = path.join(dir, INDEX_FILE);
  if (!fs.existsSync(fp)) {
    // Migrate from v1 single-session format
    return migrateFromV1(dir);
  }
  try {
    const raw = fs.readFileSync(fp, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed.version === 2) return parsed as PersistedIndex;
    if (parsed.version === 1) return migrateFromV1(dir);
    return emptyIndex();
  } catch {
    return emptyIndex();
  }
}

function saveIndex(dir: string, index: PersistedIndex): void {
  ensureDir(dir);
  try {
    fs.writeFileSync(path.join(dir, INDEX_FILE), JSON.stringify(index, null, 2), 'utf-8');
  } catch (err) {
    log.error(TAG, 'Failed to write index', err);
  }
}

function migrateFromV1(dir: string): PersistedIndex {
  const fp = path.join(dir, INDEX_FILE);
  if (!fs.existsSync(fp)) return emptyIndex();

  try {
    const raw = fs.readFileSync(fp, 'utf-8');
    const old = JSON.parse(raw) as PersistedSession;
    if (old.version !== 1) return emptyIndex();

    const id = randomUUID();
    const title = old.plan?.title ?? old.task?.title ?? 'Untitled';
    ensureDir(workflowsDir(dir));
    fs.writeFileSync(workflowPath(dir, id), JSON.stringify(old, null, 2), 'utf-8');

    const index: PersistedIndex = {
      version: 2,
      activeWorkflowId: id,
      workflows: [{ id, title, phase: old.phase, updatedAt: old.updatedAt }],
    };
    saveIndex(dir, index);
    log.info(TAG, `Migrated v1 session to workflow ${id}`);
    return index;
  } catch {
    return emptyIndex();
  }
}

// --- Workflow CRUD ---

export function loadWorkflow(id: string): PersistedSession | null {
  const dir = getDir();
  if (!dir) return null;

  const fp = workflowPath(dir, id);
  if (!fs.existsSync(fp)) return null;

  try {
    const raw = fs.readFileSync(fp, 'utf-8');
    return JSON.parse(raw) as PersistedSession;
  } catch (err) {
    log.warn(TAG, `Failed to load workflow ${id}`, err);
    return null;
  }
}

export function saveWorkflow(id: string, session: PersistedSession): void {
  const dir = getDir();
  if (!dir) return;

  ensureDir(workflowsDir(dir));
  session.updatedAt = Date.now();

  try {
    fs.writeFileSync(workflowPath(dir, id), JSON.stringify(session, null, 2), 'utf-8');
    log.debug(TAG, `Saved workflow ${id} (phase=${session.phase})`);
  } catch (err) {
    log.error(TAG, `Failed to save workflow ${id}`, err);
  }
}

export function getWorkflowList(): WorkflowSummary[] {
  const dir = getDir();
  if (!dir) return [];
  return loadIndex(dir).workflows;
}

export function getActiveWorkflowId(): string | null {
  const dir = getDir();
  if (!dir) return null;
  return loadIndex(dir).activeWorkflowId;
}

export function createNewWorkflow(): string {
  const dir = getDir();
  if (!dir) return '';

  const id = randomUUID();
  const index = loadIndex(dir);

  const summary: WorkflowSummary = {
    id,
    title: 'New Workflow',
    phase: 'task',
    updatedAt: Date.now(),
  };

  index.workflows.unshift(summary);
  index.activeWorkflowId = id;
  saveIndex(dir, index);

  saveWorkflow(id, emptySession());
  log.info(TAG, `Created new workflow: ${id}`);
  return id;
}

export function setActiveWorkflow(id: string): void {
  const dir = getDir();
  if (!dir) return;

  const index = loadIndex(dir);
  if (!index.workflows.some((w) => w.id === id)) return;
  index.activeWorkflowId = id;
  saveIndex(dir, index);
  log.info(TAG, `Active workflow set to: ${id}`);
}

export function updateWorkflowSummary(
  id: string,
  update: Partial<Pick<WorkflowSummary, 'title' | 'phase'>>,
): void {
  const dir = getDir();
  if (!dir) return;

  const index = loadIndex(dir);
  const entry = index.workflows.find((w) => w.id === id);
  if (!entry) return;

  if (update.title !== undefined) entry.title = update.title;
  if (update.phase !== undefined) entry.phase = update.phase;
  entry.updatedAt = Date.now();
  saveIndex(dir, index);
}

// --- Legacy compat wrappers (used by extension.ts) ---

export function loadSession(): PersistedSession | null {
  const dir = getDir();
  if (!dir) return null;

  const index = loadIndex(dir);
  if (!index.activeWorkflowId) return null;
  return loadWorkflow(index.activeWorkflowId);
}

export function patchSession(update: Partial<Omit<PersistedSession, 'version'>>): void {
  const dir = getDir();
  if (!dir) return;

  let index = loadIndex(dir);
  let id = index.activeWorkflowId;

  if (!id) {
    id = createNewWorkflow();
    index = loadIndex(dir);
  }

  const existing = loadWorkflow(id!) ?? emptySession();
  const merged = { ...existing, ...update, version: 1 as const };
  saveWorkflow(id!, merged);

  const title = merged.plan?.title ?? merged.task?.title ?? 'Untitled';
  updateWorkflowSummary(id!, { title, phase: merged.phase });
}

export function clearSession(): void {
  const dir = getDir();
  if (!dir) return;

  const index = loadIndex(dir);
  if (index.activeWorkflowId) {
    saveWorkflow(index.activeWorkflowId, emptySession());
    log.info(TAG, `Cleared active workflow: ${index.activeWorkflowId}`);
  }
}
