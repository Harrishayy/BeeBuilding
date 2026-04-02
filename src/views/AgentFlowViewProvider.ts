import * as vscode from 'vscode';
import type { ExtensionMessage, WebviewMessage } from '../shared/messages.js';

function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'index.js'),
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'index.css'),
  );

  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com;
                 font-src ${webview.cspSource} https://fonts.gstatic.com;
                 connect-src ${webview.cspSource};
                 script-src 'nonce-${nonce}';
                 img-src ${webview.cspSource} data:;">
  <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${styleUri}">
  <title>AgentFlow Mission Control</title>
</head>
<body style="margin: 0; padding: 0; background: #1a1a2e;">
  <div id="root"><p style="color:#ffd54f;padding:20px;font-family:monospace;font-size:12px;">Loading AgentFlow...</p></div>
  <script nonce="${nonce}">
    window.onerror = function(msg, src, line, col, err) {
      var el = document.getElementById('root') || document.body;
      el.innerHTML = '<pre style="color:#ef5350;background:#0a0a14;padding:20px;margin:10px;font-size:11px;white-space:pre-wrap;word-break:break-word;font-family:monospace;border:2px solid #ef5350;">[AgentFlow Error]\\n' + (err ? err.message + '\\n\\n' + err.stack : msg) + '</pre>';
    };
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// ─── Sidebar view (WebviewViewProvider) ──────────────────────────────

export class AgentFlowSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'agentflow.missionControl';

  private _view?: vscode.WebviewView;
  private _onMessage: (message: WebviewMessage) => void;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    onMessage: (message: WebviewMessage) => void,
  ) {
    this._onMessage = onMessage;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview'),
        vscode.Uri.joinPath(this._extensionUri, 'resources'),
      ],
    };

    webviewView.webview.html = getWebviewHtml(webviewView.webview, this._extensionUri);

    webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => {
      this._onMessage(message);
    });
  }

  public postMessage(message: ExtensionMessage): void {
    this._view?.webview.postMessage(message);
  }

  public get isVisible(): boolean {
    return this._view?.visible ?? false;
  }
}

// ─── Editor panel (WebviewPanel) ────────────────────────────────────

export class AgentFlowPanel {
  public static readonly viewType = 'agentflow.panel';

  private static _instance: AgentFlowPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _onMessage: (message: WebviewMessage) => void;
  private _disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    onMessage: (message: WebviewMessage) => void,
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._onMessage = onMessage;

    this._panel.webview.html = getWebviewHtml(this._panel.webview, this._extensionUri);

    this._panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this._onMessage(message),
      null,
      this._disposables,
    );

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    onMessage: (message: WebviewMessage) => void,
  ): AgentFlowPanel {
    if (AgentFlowPanel._instance) {
      AgentFlowPanel._instance._panel.reveal(vscode.ViewColumn.One);
      return AgentFlowPanel._instance;
    }

    const panel = vscode.window.createWebviewPanel(
      AgentFlowPanel.viewType,
      'AgentFlow — Mission Control',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist', 'webview'),
          vscode.Uri.joinPath(extensionUri, 'resources'),
        ],
      },
    );

    panel.iconPath = vscode.Uri.joinPath(extensionUri, 'resources', 'icon.svg');

    AgentFlowPanel._instance = new AgentFlowPanel(panel, extensionUri, onMessage);
    return AgentFlowPanel._instance;
  }

  public static getInstance(): AgentFlowPanel | undefined {
    return AgentFlowPanel._instance;
  }

  public postMessage(message: ExtensionMessage): void {
    this._panel.webview.postMessage(message);
  }

  public get isVisible(): boolean {
    return this._panel.visible;
  }

  public dispose(): void {
    AgentFlowPanel._instance = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      d?.dispose();
    }
  }
}
