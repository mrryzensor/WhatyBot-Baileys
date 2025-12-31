interface Window {
  electronAPI?: {
    profiles?: {
      list: () => Promise<any[]>;
      get: (slug: string) => Promise<any>;
      launch: (slug: string) => Promise<{ pid: number }>;
      terminate: (slug: string) => Promise<{ success: boolean }>;
      onStatusChanged: (callback: (event: any, data: any) => void) => () => void;
    };
    updates?: {
      checkForUpdates: () => Promise<{ success: boolean }>;
      onStatus: (callback: (payload: any) => void) => () => void;
    };
    emergency?: {
      restart: () => Promise<{ success: boolean }>;
    };
    platform: string;
    version: string;
  };
}

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly GEMINI_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
