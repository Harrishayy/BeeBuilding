import * as path from 'node:path';
import simpleGit, { type SimpleGit } from 'simple-git';
import type { AgentName } from '../shared/types.js';

const WORKTREE_DIR = '.agentflow/worktrees';

export class WorktreeManager {
  private git: SimpleGit;
  private projectRoot: string;
  private branches: Map<AgentName, string> = new Map();

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.git = simpleGit(projectRoot);
  }

  async createWorktree(agentName: AgentName, sessionId: string): Promise<string> {
    const worktreePath = this.getWorktreePath(agentName);
    const branchName = `agentflow/${agentName}/${sessionId}`;

    try {
      await this.git.raw([
        'worktree',
        'add',
        worktreePath,
        '-b',
        branchName,
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('already exists')) {
        await this.removeWorktree(agentName);
        await this.git.raw([
          'worktree',
          'add',
          worktreePath,
          '-b',
          branchName,
        ]);
      } else {
        throw err;
      }
    }

    this.branches.set(agentName, branchName);
    return worktreePath;
  }

  async removeWorktree(agentName: AgentName): Promise<void> {
    const worktreePath = this.getWorktreePath(agentName);

    try {
      await this.git.raw(['worktree', 'remove', worktreePath, '--force']);
    } catch {
      // Worktree may not exist — safe to ignore
    }

    const branchName = this.branches.get(agentName);
    if (branchName) {
      try {
        await this.git.branch(['-D', branchName]);
      } catch {
        // Branch may not exist or may be checked out elsewhere
      }
      this.branches.delete(agentName);
    }
  }

  async getDiff(agentName: AgentName, sessionId: string): Promise<string> {
    const branchName = `agentflow/${agentName}/${sessionId}`;
    try {
      const result = await this.git.diff(['main', branchName]);
      return result;
    } catch {
      try {
        const result = await this.git.diff(['master', branchName]);
        return result;
      } catch (innerErr) {
        const message = innerErr instanceof Error ? innerErr.message : String(innerErr);
        throw new Error(`Failed to get diff for ${agentName}: ${message}`);
      }
    }
  }

  async mergeWorktree(
    agentName: AgentName,
    sessionId: string,
    strategy: 'squash' | 'rebase' | 'merge',
  ): Promise<void> {
    const branchName = `agentflow/${agentName}/${sessionId}`;

    switch (strategy) {
      case 'squash':
        await this.git.merge([branchName, '--squash']);
        await this.git.commit(
          `agentflow: ${agentName} changes (session ${sessionId})`,
        );
        break;
      case 'rebase':
        await this.git.rebase([branchName]);
        break;
      case 'merge':
        await this.git.merge([branchName, '--no-ff', '-m',
          `agentflow: merge ${agentName} (session ${sessionId})`]);
        break;
    }
  }

  async listWorktrees(): Promise<Array<{ path: string; branch: string }>> {
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

    return worktrees;
  }

  getWorktreePath(agentName: AgentName): string {
    return path.join(this.projectRoot, WORKTREE_DIR, agentName);
  }

  async cleanupAll(): Promise<void> {
    const worktrees = await this.listWorktrees();

    for (const wt of worktrees) {
      if (wt.path.includes(WORKTREE_DIR)) {
        try {
          await this.git.raw(['worktree', 'remove', wt.path, '--force']);
        } catch {
          // Best-effort cleanup
        }
      }
    }

    for (const [agent, branchName] of this.branches) {
      try {
        await this.git.branch(['-D', branchName]);
      } catch {
        // Best-effort cleanup
      }
      this.branches.delete(agent);
    }
  }
}
