import * as fs from 'node:fs';
import * as path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { log } from '../util/logger.js';

const execAsync = promisify(exec);
const TAG = 'ToolExecutor';

interface ReviewComment {
  file: string;
  line: number;
  comment: string;
  severity: string;
}

export class ToolExecutor {
  private reviewComments: ReviewComment[] = [];

  constructor(private readonly worktreePath: string) {
    log.debug(TAG, `Initialized with worktree: ${worktreePath}`);
  }

  async execute(toolName: string, input: Record<string, unknown>): Promise<string> {
    log.debug(TAG, `execute: ${toolName}`, input);
    const start = Date.now();

    try {
      let result: string;
      switch (toolName) {
        case 'read_file':
          result = await this.readFile(input.path as string);
          break;
        case 'write_file':
          result = await this.writeFile(input.path as string, input.content as string);
          break;
        case 'run_command':
          result = await this.runCommand(input.command as string);
          break;
        case 'search_codebase':
          result = await this.searchCodebase(
            input.query as string,
            input.file_pattern as string | undefined,
          );
          break;
        case 'list_files':
          result = await this.listFiles((input.directory as string | undefined) ?? '.');
          break;
        case 'create_review_comment':
          result = this.createReviewComment(
            input.file as string,
            input.line as number,
            input.comment as string,
            input.severity as string,
          );
          break;
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }

      const elapsed = Date.now() - start;
      log.debug(TAG, `${toolName} completed in ${elapsed}ms (${result.length} chars)`);
      return result;
    } catch (err) {
      const elapsed = Date.now() - start;
      log.error(TAG, `${toolName} failed after ${elapsed}ms`, err);
      throw err;
    }
  }

  getReviewComments(): ReviewComment[] {
    return [...this.reviewComments];
  }

  private validatePath(relativePath: string): string {
    const normalized = path.normalize(relativePath);
    if (path.isAbsolute(normalized)) {
      throw new Error(`Absolute paths are not allowed: ${relativePath}`);
    }

    const resolved = path.resolve(this.worktreePath, normalized);
    const resolvedWorktree = path.resolve(this.worktreePath);

    if (!resolved.startsWith(resolvedWorktree + path.sep) && resolved !== resolvedWorktree) {
      throw new Error(`Path traversal detected: ${relativePath}`);
    }

    return resolved;
  }

  private async readFile(filePath: string): Promise<string> {
    const resolved = this.validatePath(filePath);

    try {
      const content = await fs.promises.readFile(resolved, 'utf-8');
      log.debug(TAG, `read_file: ${filePath} (${content.length} chars)`);
      return content;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to read file "${filePath}": ${message}`);
    }
  }

  private async writeFile(filePath: string, content: string): Promise<string> {
    const resolved = this.validatePath(filePath);

    try {
      await fs.promises.mkdir(path.dirname(resolved), { recursive: true });
      await fs.promises.writeFile(resolved, content, 'utf-8');
      log.debug(TAG, `write_file: ${filePath} (${content.length} chars written)`);
      return `Successfully wrote ${content.length} characters to ${filePath}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to write file "${filePath}": ${message}`);
    }
  }

  private async runCommand(command: string): Promise<string> {
    log.debug(TAG, `run_command: ${command}`);
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.worktreePath,
        timeout: 60_000,
        maxBuffer: 5 * 1024 * 1024,
        env: { ...process.env, FORCE_COLOR: '0' },
      });
      let result = stdout;
      if (stderr) {
        result += `\n[stderr]:\n${stderr}`;
      }
      return result || '(no output)';
    } catch (err) {
      const execErr = err as {
        stdout?: string;
        stderr?: string;
        message: string;
        code?: number;
      };
      let result = '';
      if (execErr.stdout) result += execErr.stdout;
      if (execErr.stderr) result += `\n[stderr]:\n${execErr.stderr}`;
      if (!result) result = `Command failed: ${execErr.message}`;
      log.warn(TAG, `run_command exited with code ${execErr.code ?? 1}`);
      return `[exit code: ${execErr.code ?? 1}]\n${result}`;
    }
  }

  private async searchCodebase(
    query: string,
    filePattern: string | undefined,
  ): Promise<string> {
    log.debug(TAG, `search_codebase: query="${query}" pattern="${filePattern ?? '*'}"`);
    const args = ['rg', '--no-heading', '--line-number', '--color', 'never'];
    if (filePattern) {
      args.push('-g', filePattern);
    }
    args.push('--', query, '.');

    try {
      const { stdout } = await execAsync(args.join(' '), {
        cwd: this.worktreePath,
        timeout: 30_000,
        maxBuffer: 5 * 1024 * 1024,
      });
      return stdout || 'No matches found.';
    } catch (err) {
      const execErr = err as { code?: number; stdout?: string };
      if (execErr.code === 1) {
        return 'No matches found.';
      }
      log.warn(TAG, 'rg not available, falling back to grep');
      try {
        const grepArgs = ['grep', '-rn', '--include', filePattern ?? '*', query, '.'];
        const { stdout } = await execAsync(grepArgs.join(' '), {
          cwd: this.worktreePath,
          timeout: 30_000,
          maxBuffer: 5 * 1024 * 1024,
        });
        return stdout || 'No matches found.';
      } catch {
        return execErr.stdout || 'No matches found.';
      }
    }
  }

  private async listFiles(directory: string): Promise<string> {
    const resolved = this.validatePath(directory);

    try {
      const { stdout } = await execAsync(
        'find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/.beebuilder/*" | sort',
        {
          cwd: resolved,
          timeout: 15_000,
          maxBuffer: 5 * 1024 * 1024,
        },
      );
      return stdout || '(empty directory)';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to list files in "${directory}": ${message}`);
    }
  }

  private createReviewComment(
    file: string,
    line: number,
    comment: string,
    severity: string,
  ): string {
    const entry: ReviewComment = { file, line, comment, severity };
    this.reviewComments.push(entry);
    log.debug(TAG, `Review comment: [${severity}] ${file}:${line}`);

    try {
      const reviewDir = path.join(this.worktreePath, '.beebuilder', 'reviews');
      fs.mkdirSync(reviewDir, { recursive: true });

      const reviewPath = path.join(reviewDir, 'comments.json');
      fs.writeFileSync(reviewPath, JSON.stringify(this.reviewComments, null, 2), 'utf-8');
    } catch (err) {
      log.error(TAG, 'Failed to persist review comment', err);
    }

    return `Review comment added: [${severity}] ${file}:${line} — ${comment}`;
  }
}
