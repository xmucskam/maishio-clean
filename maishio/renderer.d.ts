export {};

declare global {
  interface Window {
    api: {
      invoke: (channel: string, data?: any) => Promise<any>;
      on?: (channel: string, listener: (...args: any[]) => void) => void;
      // ping?: (msg: string) => Promise<string>; // if you want
    };
  }
}

