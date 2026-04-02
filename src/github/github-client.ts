import simpleGit from 'simple-git';
import { log } from '../util/logger.js';

const TAG = 'GitHubClient';

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  labels: string[];
  state: string;
  createdAt: string;
  author: string;
}

export class GitHubClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  static async detectRepo(projectPath: string): Promise<{ owner: string; repo: string } | null> {
    try {
      const git = simpleGit(projectPath);
      const remotes = await git.getRemotes(true);
      const origin = remotes.find((r) => r.name === 'origin');
      if (!origin?.refs?.fetch) return null;

      const url = origin.refs.fetch;
      const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
      if (!match) return null;

      return { owner: match[1], repo: match[2] };
    } catch {
      return null;
    }
  }

  async listIssues(
    owner: string,
    repo: string,
    opts?: { state?: string; labels?: string; page?: number },
  ): Promise<GitHubIssue[]> {
    const params = new URLSearchParams({
      state: opts?.state ?? 'open',
      per_page: '30',
      page: String(opts?.page ?? 1),
    });
    if (opts?.labels) params.set('labels', opts.labels);

    const url = `https://api.github.com/repos/${owner}/${repo}/issues?${params}`;
    log.debug(TAG, `Fetching issues: ${url}`);

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as Array<{
      number: number;
      title: string;
      body: string | null;
      labels: Array<{ name: string }>;
      state: string;
      created_at: string;
      user: { login: string };
      pull_request?: unknown;
    }>;

    return data
      .filter((issue) => !issue.pull_request)
      .map((issue) => ({
        number: issue.number,
        title: issue.title,
        body: issue.body ?? '',
        labels: issue.labels.map((l) => l.name),
        state: issue.state,
        createdAt: issue.created_at,
        author: issue.user.login,
      }));
  }

  async getIssue(owner: string, repo: string, number: number): Promise<GitHubIssue> {
    const url = `https://api.github.com/repos/${owner}/${repo}/issues/${number}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
    }

    const issue = (await res.json()) as {
      number: number;
      title: string;
      body: string | null;
      labels: Array<{ name: string }>;
      state: string;
      created_at: string;
      user: { login: string };
    };

    return {
      number: issue.number,
      title: issue.title,
      body: issue.body ?? '',
      labels: issue.labels.map((l) => l.name),
      state: issue.state,
      createdAt: issue.created_at,
      author: issue.user.login,
    };
  }
}
