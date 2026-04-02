interface VSCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare global {
  function acquireVsCodeApi(): VSCodeApi;
}

let _api: VSCodeApi | undefined;

export function useVSCode(): VSCodeApi {
  if (!_api) {
    try {
      _api = acquireVsCodeApi();
      console.debug('[BeeBuilder] VS Code API acquired');
    } catch (err) {
      console.error('[BeeBuilder] Failed to acquire VS Code API:', err);
      _api = {
        postMessage: (msg) => console.warn('[BeeBuilder] postMessage (no-op):', msg),
        getState: () => null,
        setState: () => {},
      };
    }
  }
  return _api;
}
