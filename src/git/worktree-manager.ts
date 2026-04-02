import * as fs from 'node:fs';
import * as path from 'node:path';
import simpleGit, { type SimpleGit } from 'simple-git';
import { log } from '../util/logger.js';
import type { AgentName } from '../shared/types.js';

const TAG = 'WorktreeManager';
const WORKTREE_DIR = '.beebuilding/worktrees';

export class WorktreeManager {
  private git: SimpleGit;
  private projectRoot: string;
  private branches: Map<AgentName, string> = new Map();
  private baseShas: Map<AgentName, string> = new Map();

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.git = simpleGit(projectRoot);
    log.info(TAG, `Initialized for project: ${projectRoot}`);
  }

  getProjectRoot(): string {
    return this.projectRoot;
  }

  async createWorktree(agentName: AgentName, sessionId: string): Promise<string> {
    const worktreePath = this.getWorktreePath(agentName);
    const branchName = `beebuilding/${agentName}/${sessionId}`;
    log.info(TAG, `Creating worktree: ${worktreePath} (branch=${branchName})`);

    const baseSha = await this.git.revparse(['HEAD']);
    this.baseShas.set(agentName, baseSha.trim());

    try {
      await this.git.raw([
        'worktree',
        'add',
        worktreePath,
        '-b',
        branchName,
      ]);
      log.info(TAG, `Worktree created for ${agentName} (base=${baseSha.trim().slice(0, 8)})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('already exists')) {
        log.warn(TAG, `Worktree/branch already exists for ${agentName}, cleaning up stale resources`);
        await this.forceCleanup(agentName, branchName, worktreePath);
        try {
          await this.git.raw([
            'worktree',
            'add',
            worktreePath,
            '-b',
            branchName,
          ]);
          log.info(TAG, `Worktree recreated for ${agentName}`);
        } catch (retryErr) {
          log.error(TAG, `Failed to recreate worktree for ${agentName}`, retryErr);
          throw retryErr;
        }
      } else {
        log.error(TAG, `Failed to create worktree for ${agentName}`, err);
        throw err;
      }
    }

    this.branches.set(agentName, branchName);
    return worktreePath;
  }

  private async forceCleanup(agentName: AgentName, branchName: string, worktreePath: string): Promise<void> {
    try {
      await this.git.raw(['worktree', 'remove', worktreePath, '--force']);
      log.debug(TAG, `Force-removed worktree via git: ${worktreePath}`);
    } catch {
      log.debug(TAG, `git worktree remove failed, will try filesystem cleanup: ${worktreePath}`);
    }

    if (fs.existsSync(worktreePath)) {
      try {
        fs.rmSync(worktreePath, { recursive: true, force: true });
        log.debug(TAG, `Removed stale worktree directory from filesystem: ${worktreePath}`);
      } catch (err) {
        log.warn(TAG, `Failed to remove worktree directory: ${worktreePath}`, err);
      }
    }

    try {
      await this.git.raw(['worktree', 'prune']);
      log.debug(TAG, 'Pruned stale worktree references');
    } catch {
      log.debug(TAG, 'Worktree prune skipped');
    }

    try {
      await this.git.branch(['-D', branchName]);
      log.debug(TAG, `Force-deleted stale branch: ${branchName}`);
    } catch {
      log.debug(TAG, `Branch ${branchName} not found or already deleted`);
    }

    this.branches.delete(agentName);
  }

  async commitWorktreeChanges(agentName: AgentName, sessionId: string): Promise<boolean> {
    const worktreePath = this.getWorktreePath(agentName);
    log.info(TAG, `Committing changes in worktree for ${agentName}: ${worktreePath}`);

    const wtGit = simpleGit(worktreePath);
    try {
      const status = await wtGit.status();
      if (status.isClean()) {
        log.info(TAG, `No changes to commit for ${agentName}`);
        return false;
      }

      await wtGit.add('-A');
      await wtGit.commit(`beebuilding: ${agentName} changes (session ${sessionId})`);
      const commitLog = await wtGit.log({ maxCount: 1 });
      log.info(TAG, `Committed ${status.files.length} file(s) for ${agentName} (${commitLog.latest?.hash?.slice(0, 8) ?? 'unknown'})`);
      return true;
    } catch (err) {
      log.error(TAG, `Failed to commit worktree changes for ${agentName}`, err);
      throw new Error(`Failed to commit changes for ${agentName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async removeWorktree(agentName: AgentName): Promise<void> {
    const worktreePath = this.getWorktreePath(agentName);
    log.debug(TAG, `Removing worktree for ${agentName}: ${worktreePath}`);

    try {
      await this.git.raw(['worktree', 'remove', worktreePath, '--force']);
      log.debug(TAG, `Worktree removed for ${agentName}`);
    } catch (err) {
      log.warn(TAG, `Failed to remove worktree for ${agentName} (may not exist)`, err);
    }

    const branchName = this.branches.get(agentName);
    if (branchName) {
      try {
        await this.git.branch(['-D', branchName]);
        log.debug(TAG, `Branch deleted: ${branchName}`);
      } catch (err) {
        log.warn(TAG, `Failed to delete branch ${branchName}`, err);
      }
      this.branches.delete(agentName);
    }
  }

  async getDiff(agentName: AgentName, sessionId: string): Promise<string> {
    const branchName = `beebuilding/${agentName}/${sessionId}`;
    const baseSha = this.baseShas.get(agentName);
    log.debug(TAG, `Getting diff for ${agentName} (branch=${branchName}, base=${baseSha?.slice(0, 8) ?? 'unknown'})`);

    const base = baseSha ?? 'HEAD';
    try {
      const result = await this.git.diff([base, branchName]);
      log.debug(TAG, `Diff for ${agentName}: ${result.length} chars`);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(TAG, `Failed to get diff for ${agentName}`, err);
      throw new Error(`Failed to get diff for ${agentName}: ${message}`);
    }
  }

  async mergeWorktree(
    agentName: AgentName,
    sessionId: string,
    strategy: 'squash' | 'rebase' | 'merge',
  ): Promise<void> {
    const branchName = `beebuilding/${agentName}/${sessionId}`;
    log.info(TAG, `Merging ${branchName} with strategy: ${strategy}`);

    try {
      switch (strategy) {
        case 'squash':
        case 'rebase':
          if (strategy === 'rebase') {
            log.warn(TAG, `Rebase strategy is unsafe; falling back to squash for ${agentName}`);
          }
          await this.git.merge([branchName, '--squash']);
          await this.git.commit(
            `beebuilding: ${agentName} changes (session ${sessionId})`,
          );
          break;
        case 'merge':
          await this.git.merge([branchName, '--no-ff', '-m',
            `beebuilding: merge ${agentName} (session ${sessionId})`]);
          break;
      }
      log.info(TAG, `Merge completed (strategy=${strategy})`);
    } catch (err) {
      log.error(TAG, `Merge failed (strategy=${strategy})`, err);
      throw err;
    }
  }

  async listWorktrees(): Promise<Array<{ path: string; branch: string }>> {
    try {
      const output = await this.git.raw(['worktree', 'list', '--porcelain']);
      const worktrees: Array<{ path: string; branch: string }> = [];
      const entries = output.split('\n\n').filter(Boolean);

      for (const entry of entries) {
        const lines = entry.trim().split('\n');
        let wtPath = '';
        let branch = '';

        for (const line of lines) {
          if (line.startsWith('worktree ')) {
            wtPath = line.substring('worktree '.length);
          }
          if (line.startsWith('branch ')) {
            branch = line.substring('branch refs/heads/'.length);
          }
        }

        if (wtPath && branch) {
          worktrees.push({ path: wtPath, branch });
        }
      }

      log.debug(TAG, `Listed ${worktrees.length} worktrees`);
      return worktrees;
    } catch (err) {
      log.error(TAG, 'Failed to list worktrees', err);
      return [];
    }
  }

  getWorktreePath(agentName: AgentName): string {
    return path.join(this.projectRoot, WORKTREE_DIR, agentName);
  }

  async cleanupAll(): Promise<void> {
    log.info(TAG, 'Cleaning up all worktrees');
    const worktrees = await this.listWorktrees();

    for (const wt of worktrees) {
      if (wt.path.includes(WORKTREE_DIR)) {
        try {
          await this.git.raw(['worktree', 'remove', wt.path, '--force']);
          log.debug(TAG, `Cleaned up worktree: ${wt.path}`);
        } catch (err) {
          log.warn(TAG, `Failed to clean up worktree: ${wt.path}`, err);
        }
      }
    }

    for (const [agent, branchName] of this.branches) {
      try {
        await this.git.branch(['-D', branchName]);
        log.debug(TAG, `Cleaned up branch: ${branchName}`);
      } catch (err) {
        log.warn(TAG, `Failed to clean up branch: ${branchName}`, err);
      }
      this.branches.delete(agent);
    }

    log.info(TAG, 'Worktree cleanup complete');
  }
}
