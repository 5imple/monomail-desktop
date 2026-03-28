/// <reference types="vite/client" />
interface ElectronBridge {
  sendMessage: (channel: string, ...args: any[]) => void;
  onMessage: (channel: string, callback: (...args: any[]) => void) => void;
}

declare global {
  interface Window {
    electronBridge: ElectronBridge;
  }
}
