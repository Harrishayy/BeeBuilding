import * as fs from 'node:fs';
import * as path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

interface ReviewComment {
  file: string;
  line: number;
  comment: string;
  severity: string;
}

export class ToolExecutor {
  private reviewComments: ReviewComment[] = [];

  constructor(private readonly worktreePath: string) {}

  async execute(toolName: string, input: Record<string, unknown>): Promise<string> {
    switch (toolName) {
      case 'read_file':
        return this.readFile(input.path as string);
      case 'write_file':
        return this.writeFile(input.path as string, input.content as string);
      case 'run_command':
        return this.runCommand(input.command as string);
      case 'search_codebase':
        return this.searchCodebase(
          input.query as string,
          input.file_pattern as string | undefined,
        );
      case 'list_files':
        return this.listFiles((input.directory as string | undefined) ?? '.');
      case 'create_review_comment':
        return this.createReviewComment(
          input.file as string,
          input.line as number,
          input.comment as string,
          input.severity as string,
        );
      default:
        throw new Error(`Unknown tool: ${toolName}`);
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
      return `Successfully wrote ${content.length} characters to ${filePath}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to write file "${filePath}": ${message}`);
    }
  }

  private async runCommand(command: string): Promise<string> {
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
      return `[exit code: ${execErr.code ?? 1}]\n${result}`;
    }
  }

  private async searchCodebase(
    query: string,
    filePattern: string | undefined,
  ): Promise<string> {
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
        'find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/.agentflow/*" | sort',
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

    const reviewDir = path.join(this.worktreePath, '.agentflow', 'reviews');
    fs.mkdirSync(reviewDir, { recursive: true });

    const reviewPath = path.join(reviewDir, 'comments.json');
    fs.writeFileSync(reviewPath, JSON.stringify(this.reviewComments, null, 2), 'utf-8');

    return `Review comment added: [${severity}] ${file}:${line} — ${comment}`;
  }
}
