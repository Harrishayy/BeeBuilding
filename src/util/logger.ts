import * as vscode from 'vscode';

let _channel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
  if (!_channel) {
    _channel = vscode.window.createOutputChannel('BeeBuilder', { log: true });
  }
  return _channel;
}

function ts(): string {
  return new Date().toISOString();
}

function fmt(tag: string, msg: string, data?: unknown): string {
  const base = `[${ts()}] [${tag}] ${msg}`;
  if (data === undefined) return base;
  try {
    const serialized =
      data instanceof Error
        ? `${data.message}\n${data.stack ?? ''}`
        : JSON.stringify(data, null, 2);
    return `${base}\n  ${serialized}`;
  } catch {
    return `${base}\n  [unserializable data]`;
  }
}

export const log = {
  info(tag: string, msg: string, data?: unknown): void {
    getChannel().appendLine(fmt(tag, msg, data));
  },

  warn(tag: string, msg: string, data?: unknown): void {
    getChannel().appendLine(`⚠ ${fmt(tag, msg, data)}`);
  },

  error(tag: string, msg: string, err?: unknown): void {
    const line = fmt(tag, msg, err);
    getChannel().appendLine(`✖ ${line}`);
    console.error(`[BeeBuilder] ${line}`);
  },

  debug(tag: string, msg: string, data?: unknown): void {
    getChannel().appendLine(`· ${fmt(tag, msg, data)}`);
  },

  show(): void {
    getChannel().show(true);
  },

  dispose(): void {
    _channel?.dispose();
    _channel = undefined;
  },
};
