// Download state enum
export enum DownloadStatus {
  QUEUED = 'queued',
  DOWNLOADING = 'downloading',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  ERROR = 'error',
}

// Interface for a download item
export interface DownloadItem {
  id: string;
  url: string;
  filename: string;
  status: DownloadStatus;
  progress: number;
  speed: number;
  size: number;
  downloaded: number;
  eta: number;
  createdAt: Date | string;
  segments: DownloadSegment[];
  error?: string;
  downloadFolder?: string;
  options?: DownloadOptions;
}

// Interface for a download segment
export interface DownloadSegment {
  id: number;
  start: number;
  end: number;
  downloaded: number;
  progress: number;
  status: DownloadStatus;
}

// Interface for the application state
export interface AppState {
  downloads: DownloadItem[];
  activeDownloads: number;
  maxConcurrent: number;
  totalSpeed: number;
}

// Interface for application settings (e.g., saved in electron-store)
export interface AppSettings {
    defaultDownloadPath: string;
    maxConcurrentDownloads: number;
    language?: string;
    // Add other settings as needed
}

// Interface for the electronAPI exposed to the renderer
export interface ElectronAPI {
  addDownload: (url: string, options?: DownloadOptions) => Promise<{ id: string, url: string, filename?: string, fileSize?: number, existsOnDisk?: boolean }>;
  createNewDownload: (url: string, options?: DownloadOptions) => Promise<{ id: string, url: string, filename?: string, originalFilename?: string }>;
  pauseDownload: (id: string) => Promise<void>;
  resumeDownload: (id: string) => Promise<void>;
  cancelDownload: (id: string) => Promise<void>;
  removeDownload: (id: string) => Promise<void>;
  onDownloadProgress: (callback: (progress: any) => void) => () => void;
  onDownloadsLoaded: (callback: (downloads: DownloadItem[]) => void) => () => void;
  onDownloadRemoved: (callback: (id: string) => void) => () => void;
  onExtensionFileExists: (callback: (result: any) => void) => () => void;
  offExtensionFileExists: (callback: (result: any) => void) => void;
  onExtensionDuplicateUrl: (callback: (result: any) => void) => () => void;
  offExtensionDuplicateUrl: (callback: (result: any) => void) => void;
  onExtensionDownload: (callback: (request: { url: string, filename?: string, fileSize?: number }) => void) => () => void;
  offExtensionDownload: (callback: (request: { url: string, filename?: string, fileSize?: number }) => void) => void;
  selectFolder: () => Promise<{ canceled: boolean, filePaths: string[] }>;
  openFile: (id: string) => Promise<boolean>;
  showInFolder: (id: string) => Promise<boolean>;
  rendererReady: () => void;
  getCategories: () => Promise<string[]>;
  addCategory: (category: string) => Promise<void>;
  getDefaultPathForCategory: (category: string) => Promise<string>;
  savePathForCategory: (category: string, path: string) => Promise<void>;
}

// Download options interface
export interface DownloadOptions {
  connections?: number;
  segmentSize?: number;
  maxRetries?: number;
  dynamicConnections?: boolean;
  forceNewDownload?: boolean;
  resumeExisting?: boolean;
  downloadFolder?: string;
  startPaused?: boolean;
  customFilename?: string;
  category?: string;
  description?: string;
  savePath?: string;
} 