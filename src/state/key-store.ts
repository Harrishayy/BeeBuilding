import type * as vscode from 'vscode';
import { log } from '../util/logger.js';

const TAG = 'KeyStore';
const ANTHROPIC_KEY = 'beebuilder.anthropicApiKey';
const GITHUB_PAT_KEY = 'beebuilder.githubPAT';

export class KeyStore {
  constructor(private secrets: vscode.SecretStorage) {}

  async saveApiKey(apiKey: string): Promise<void> {
    await this.secrets.store(ANTHROPIC_KEY, apiKey);
    log.info(TAG, 'Anthropic API key saved');
  }

  async getApiKey(): Promise<string | undefined> {
    return this.secrets.get(ANTHROPIC_KEY);
  }

  async removeApiKey(): Promise<void> {
    await this.secrets.delete(ANTHROPIC_KEY);
    log.info(TAG, 'Anthropic API key removed');
  }

  async hasApiKey(): Promise<boolean> {
    const key = await this.getApiKey();
    return !!key;
  }

  async saveGitHubPAT(token: string): Promise<void> {
    await this.secrets.store(GITHUB_PAT_KEY, token);
    log.info(TAG, 'GitHub PAT saved');
  }

  async getGitHubPAT(): Promise<string | undefined> {
    return this.secrets.get(GITHUB_PAT_KEY);
  }

  async removeGitHubPAT(): Promise<void> {
    await this.secrets.delete(GITHUB_PAT_KEY);
    log.info(TAG, 'GitHub PAT removed');
  }

  async hasGitHubPAT(): Promise<boolean> {
    const pat = await this.getGitHubPAT();
    return !!pat;
  }
}
