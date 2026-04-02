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
    _api = acquireVsCodeApi();
  }
  return _api;
}
