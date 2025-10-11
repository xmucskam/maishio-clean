export {}

declare global {
  interface Window {
    api: {
      invoke<T = any>(channel: string, payload?: any): Promise<T>;
    };
  }
}
