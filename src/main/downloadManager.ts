import { BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { app } from 'electron';
import { DownloadItem, DownloadStatus, DownloadSegment, AppSettings } from '../common/types';
import { DownloadEngine } from './downloadEngine';
import { ipcMain } from 'electron';
import ElectronStore from 'electron-store';
import Store from 'electron-store';
import { shell } from 'electron';

// Constants for download settings
const DEFAULT_SEGMENT_SIZE = 5 * 1024 * 1024; // 5MB
const DEFAULT_MAX_CONCURRENT = 3;
const DEFAULT_MAX_RETRIES = 3;

// Replace the current UUID generation
const generateUUID = (): string => {
  // Simple UUID v4 implementation without crypto
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Keep simple StoreSchema definition
interface StoreSchema {
    defaultDownloadPath?: string; 
    maxConcurrentDownloads?: number; 
    categories?: string[];
    categoryPaths?: Record<string, string>;
}

export class DownloadManager {
  private downloads: Map<string, DownloadItem>;
  private activeDownloads: Set<string>;
  private maxConcurrentDownloads: number;
  private mainWindow: BrowserWindow | null;
  private downloadFolder: string;
  private downloadEngine: DownloadEngine;
  private persistencePath: string;
  private isRendererReady: boolean;

  constructor(mainWindow: BrowserWindow) {
    this.downloads = new Map();
    this.activeDownloads = new Set();
    this.maxConcurrentDownloads = DEFAULT_MAX_CONCURRENT;
    this.mainWindow = mainWindow;
    this.isRendererReady = false; // Initialize renderer ready flag
    
    // Set defaults directly
    this.downloadFolder = app.getPath('downloads');
    this.maxConcurrentDownloads = DEFAULT_MAX_CONCURRENT;

    console.log(`[DownloadManager] Initialized. Default folder: ${this.downloadFolder}, Max concurrent: ${this.maxConcurrentDownloads}`);
    
    this.downloadEngine = new DownloadEngine();
    this.persistencePath = path.join(app.getPath('userData'), 'downloads.json');

    // Listen for the renderer ready signal
    ipcMain.on('renderer-ready', () => {
      console.log('Received renderer-ready signal.');
      this.isRendererReady = true;
      // Send downloads now if they have already been loaded
      if (this.downloads.size > 0) { 
        this.sendSavedDownloadsToRenderer();
      }
    });

    // Load saved downloads (but don't send them immediately)
    this.loadDownloads();

    // Set up download engine event listeners
    this.downloadEngine.on('progress', (data) => {
      const { id, ...progress } = data;
      const download = this.downloads.get(id);
      if (download) {
        Object.assign(download, progress);
        this.updateDownloadProgress(download);
      }
    });

    this.downloadEngine.on('complete', ({ id }) => {
      const download = this.downloads.get(id);
      if (download) {
        console.log(`[DownloadManager] Download completed: ${id} (${download.filename})`);
        download.status = DownloadStatus.COMPLETED;
        download.progress = 100;
        download.speed = 0;
        download.eta = 0;

        this.activeDownloads.delete(id);
        this.updateDownloadProgress(download);
        this.processQueue();
      }
    });

    this.downloadEngine.on('error', ({ id, error }) => {
      const download = this.downloads.get(id);
      if (download) {
        console.error(`[DownloadManager] Download error: ${id} (${download.filename}) - ${error}`);
        download.status = DownloadStatus.ERROR;
        download.error = error;

        this.activeDownloads.delete(id);
        this.updateDownloadProgress(download);
        this.processQueue();
      }
    });

    // Periodically save download state
    setInterval(() => this.saveDownloads(), 30000); // Save every 30 seconds
  }

  /**
   * Normalize a URL for comparison (e.g., remove query strings, maybe www)
   */
  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      let essentialPath = parsed.pathname;
      
      // Decode the path for comparison
      try {
          essentialPath = decodeURIComponent(essentialPath);
      } catch (decodeError) {
          console.warn(`[Normalize URL] Could not decode path: ${essentialPath}`, decodeError);
      }
      
      // Remove trailing slash if path is more than just '/'
      if (essentialPath.length > 1 && essentialPath.endsWith('/')) {
        essentialPath = essentialPath.slice(0, -1);
      }

      // Extract the very last part (likely filename) for comparison focus
      const pathSegments = essentialPath.split('/');
      const lastSegment = pathSegments[pathSegments.length - 1] || '';

      // Construct a simplified representation: protocol + origin + last path segment
      // This ignores variable intermediate paths and query strings
      const normalized = `${parsed.protocol}//${parsed.hostname}/${lastSegment}`.toLowerCase();
      
      return normalized;
    } catch (e) {
      console.warn(`[Normalize URL] Failed to parse/normalize URL: ${url}`, e);
      return url.toLowerCase().trim();
    }
  }
  
  /**
   * Check if a URL is already being actively downloaded or queued/paused
   */
  public isUrlBeingDownloaded(url: string): boolean {
    const normalizedUrlToCheck = this.normalizeUrl(url);
    for (const download of this.downloads.values()) {
      const normalizedItemUrl = this.normalizeUrl(download.url);
      if (normalizedItemUrl === normalizedUrlToCheck) {
        if (download.status === DownloadStatus.DOWNLOADING || 
            download.status === DownloadStatus.QUEUED || 
            download.status === DownloadStatus.PAUSED) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Add a download
   */
  public async addDownload(url: string, options?: any): Promise<any> {
    console.warn(`[DownloadManager] Deprecated addDownload called for URL: ${url}`);
    return { warning: 'Deprecated addDownload method used.', duplicate: this.isUrlBeingDownloaded(url) };
  }

  /**
   * Starts a specific download using the DownloadEngine
   */
  private async startIndividualDownload(id: string): Promise<void> {
    const download = this.downloads.get(id);
    if (!download) {
      console.error(`Cannot start download ${id}: Download item not found.`);
      return;
    }

    // Retrieve stored options or use defaults
    const savedOptions = download.options; // Use the options stored on the item
    const downloadFolder = download.downloadFolder || this.downloadFolder;

    const downloadOptions = {
      url: download.url,
      filename: download.filename, // Use the (decoded) filename from the download item
      directory: downloadFolder,
      connections: savedOptions?.connections || DEFAULT_MAX_CONCURRENT,
      segmentSize: savedOptions?.segmentSize || DEFAULT_SEGMENT_SIZE,
      maxRetries: savedOptions?.maxRetries || DEFAULT_MAX_RETRIES,
      dynamicConnections: savedOptions?.dynamicConnections !== undefined ? savedOptions.dynamicConnections : true,
    };
    
    console.log(`[Manager] Starting individual download ${id} with filename '${downloadOptions.filename}' in directory '${downloadOptions.directory}'`);
    if (!downloadOptions.directory) {
        console.error(`[Manager] CRITICAL: Directory is missing for download ${id}!`);
    }

    download.status = DownloadStatus.DOWNLOADING;
    this.updateDownloadProgress(download);

    try {
      await this.downloadEngine.startDownload(id, downloadOptions);
    } catch (error) {
      console.error(`Error starting download ${id} via engine:`, error);
      download.status = DownloadStatus.ERROR;
      download.error = String(error);
      this.updateDownloadProgress(download);
      this.activeDownloads.delete(id); // Remove from active if start failed
      this.processQueue(); // Try next download if this one failed to start
    }
  }

  // Pause a download
  public pauseDownload(id: string) {
    const download = this.downloads.get(id);
    if (!download) {
      console.error(`Download with ID ${id} not found`);
      return;
    }
    
    if (download.status === DownloadStatus.DOWNLOADING) {
      console.log(`Pausing download ${id}`);
      if (this.downloadEngine.pauseDownload(id)) {
        download.status = DownloadStatus.PAUSED;
        this.activeDownloads.delete(id);
        this.updateDownloadProgress(download);
        this.processQueue();
      }
    }
  }

  // Resume a download
  public resumeDownload(id: string) {
    const download = this.downloads.get(id);
    if (!download) {
      console.error(`Download with ID ${id} not found`);
      return;
    }
    
    if (download.status === DownloadStatus.PAUSED) {
      console.log(`Resuming download ${id}`);
      if (this.activeDownloads.size < this.maxConcurrentDownloads) {
        // Try to resume the existing download task
        if (this.downloadEngine.resumeDownload(id)) {
          download.status = DownloadStatus.DOWNLOADING;
          this.activeDownloads.add(id);
          this.updateDownloadProgress(download);
        } else {
          // If resumeDownload failed, try to resume with the saved segment information
          console.log(`Regular resume failed, trying to resume with saved segments for ${id}`);
          try {
            // Create options from the saved download
            const options = {
              url: download.url,
              filename: download.filename,
              directory: this.downloadFolder
            };
            
            // Start the download with saved segment information
            this.downloadEngine.resumeDownloadWithSegments(id, options, download);
            
            // Update status
            download.status = DownloadStatus.DOWNLOADING;
            this.activeDownloads.add(id);
            this.updateDownloadProgress(download);
          } catch (error) {
            // If all else fails, try to restart the download
            console.log(`Resume with segments failed, restarting download ${id}`);
            this.startIndividualDownload(id);
          }
        }
      } else {
        download.status = DownloadStatus.QUEUED;
        this.updateDownloadProgress(download);
      }
    }
  }

  // Cancel a download
  public cancelDownload(id: string, notifyRenderer: boolean = false) {
    const download = this.downloads.get(id);
    if (!download) {
      console.error(`Download with ID ${id} not found`);
      return false;
    }
    
    console.log(`Cancelling download ${id}`);
    if (this.downloadEngine.cancelDownload(id)) {
      download.status = DownloadStatus.ERROR;
      download.error = 'Cancelled by user';
      this.activeDownloads.delete(id);
      this.updateDownloadProgress(download);
      this.processQueue();
      
      if (notifyRenderer && this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('download-removed', id);
      }
      
      return true;
    }
    
    return false;
  }

  // Get the full path to the temporary directory for a download
  private getTempDirectory(id: string): string {
    // Assumption: Temp dir is relative to the *final* save location's parent directory
    // We need the download item to determine the final save location
    const download = this.downloads.get(id);
    
    // Determine base directory: Use download's specific folder or the general default
    let baseDirectory = this.downloadFolder; 
    if(download && download.downloadFolder) {
        baseDirectory = download.downloadFolder;
    } else {
        // If download or its folder isn't found, maybe log a warning or use a fallback
        console.warn(`[getTempDirectory] Could not determine specific download folder for ${id}, using default.`);
    }

    // Construct path: <baseDirectory>/.temp/<downloadId>
    return path.join(baseDirectory, '.temp', id);
  }

  // Remove a download
  public removeDownload(id: string): boolean {
    const download = this.downloads.get(id);
    if (!download) {
      console.error(`[removeDownload] Download with ID ${id} not found for removal.`);
      return false; // Not found
    }
    
    console.log(`[removeDownload] Attempting to remove download ${id} (Status: ${download.status})`);

    // Always try to cancel/cleanup the engine task first
    try {
      console.log(`[removeDownload] Requesting cancellation/cleanup via engine for ${id}`);
      const cancelled = this.downloadEngine.cancelDownload(id); // Assuming cancel also cleans up resources
      console.log(`[removeDownload] Engine cancel/cleanup result for ${id}: ${cancelled}`);
    } catch(engineError) {
        console.error(`[removeDownload] Error during engine cancel/cleanup for ${id}:`, engineError);
        // Continue with removal even if engine cleanup fails
    }

    // Ensure it's removed from the active set
    this.activeDownloads.delete(id);
    
    // Delete associated temporary directory
    const tempDir = this.getTempDirectory(id);
    try {
      if (fs.existsSync(tempDir)) {
        console.log(`[removeDownload] Deleting temporary directory: ${tempDir}`);
        fs.rmSync(tempDir, { recursive: true, force: true });
      } else {
          console.log(`[removeDownload] No temporary directory found to delete at: ${tempDir}`);
      }
    } catch (error) {
      console.error(`[removeDownload] Failed to delete temporary directory ${tempDir}:`, error);
      // Log error but continue removal from map
    }

    // Finally, remove from the internal map
    const deleted = this.downloads.delete(id);
    if (deleted) {
        console.log(`[removeDownload] Successfully removed download ${id} from internal map.`);
        // Notify renderer AFTER successful removal from map
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
             console.log(`[removeDownload] Sending download-removed notification to renderer for ${id}`);
             this.mainWindow.webContents.send('download-removed', id);
        }
        this.saveDownloads(); // Save state after removal
        this.processQueue(); // Check if a new download can start now
        return true; // Indicate success
    } else {
        // This case should ideally not happen if the item was found initially
        console.warn(`[removeDownload] Failed to remove download ${id} from internal map (was it already removed concurrently?)`);
        this.processQueue(); // Still process queue just in case
        return false; // Indicate failure
    }
  }

  // Process queue to start new downloads when slots become available
  private processQueue() {
    if (this.activeDownloads.size >= this.maxConcurrentDownloads) {
      return;
    }
    
    // Find queued downloads
    for (const [id, download] of this.downloads.entries()) {
      if (download.status === DownloadStatus.QUEUED) {
        console.log(`Starting queued download: ${id} (${download.filename})`);
        this.startIndividualDownload(id);
        
        if (this.activeDownloads.size >= this.maxConcurrentDownloads) {
          break;
        }
      }
    }
  }

  // Update download progress in the renderer
  private updateDownloadProgress(download: DownloadItem): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        this.mainWindow.webContents.send('download-progress', {
          ...download,
          id: download.id,
          url: download.url,
          filename: download.filename,
          status: download.status
        });
      } catch (error) {
        console.error('Error sending download progress update:', error);
      }
    }
  }

  // Save downloads to persistent storage
  private saveDownloads(): void {
    try {
      const downloadsArray = Array.from(this.downloads.values()).map(download => {
        // Create a clean copy without circular references
        const cleanDownload = { ...download };
        
        // Convert dates to strings
        if (cleanDownload.createdAt instanceof Date) {
          cleanDownload.createdAt = cleanDownload.createdAt.toISOString();
        }
        
        return cleanDownload;
      });
      
      fs.writeFileSync(this.persistencePath, JSON.stringify(downloadsArray, null, 2), 'utf8');
      console.log(`Saved ${downloadsArray.length} downloads to ${this.persistencePath}`);
    } catch (error) {
      console.error('Error saving downloads:', error);
    }
  }

  // Load downloads from persistent storage
  private loadDownloads(): void {
    console.log(">>> Persistence path:", this.persistencePath);
    try {
      if (fs.existsSync(this.persistencePath)) {
        const data = fs.readFileSync(this.persistencePath, 'utf8');
        const savedDownloads = JSON.parse(data);
        
        // Clear existing downloads before loading
        this.downloads.clear();
        
        let loadedCount = 0;
        for (const item of savedDownloads) {
          // Basic validation
          if (item && item.id && item.url && item.filename && item.status) {
            // Convert createdAt string back to Date object if necessary
            if (typeof item.createdAt === 'string') {
              item.createdAt = new Date(item.createdAt);
            }
            
            // Ensure necessary properties exist
            item.progress = item.progress ?? 0;
            item.speed = item.speed ?? 0;
            item.size = item.size ?? 0;
            item.downloaded = item.downloaded ?? 0;
            item.eta = item.eta ?? 0;
            item.segments = item.segments ?? [];
            item.error = item.error ?? undefined; // Restore error message
            
            // Log the status BEFORE any potential changes
            console.log(`[LoadDownloads] Loading item ${item.id} - Original Status: ${item.status}`);

            // Reset status for incomplete downloads
            if (item.status === DownloadStatus.DOWNLOADING) {
              console.log(`Setting status for previously downloading item ${item.id} to PAUSED.`);
              item.status = DownloadStatus.PAUSED; // Set to PAUSED, not QUEUED
            } else if (item.status === DownloadStatus.PAUSED) {
              console.log(`Keeping status for paused item ${item.id} as PAUSED.`);
              // Keep status as PAUSED
            } else if (item.status === DownloadStatus.QUEUED) {
               console.log(`Keeping status for queued item ${item.id} as QUEUED.`);
               // Keep status as QUEUED
            }
            
            // Restore download options AND downloadFolder if saved
            item.options = item.options ?? {};
            item.downloadFolder = item.downloadFolder ?? this.downloadFolder;
            
            this.downloads.set(item.id, item); // Add item with potentially decoded filename
            loadedCount++;
          } else {
            console.warn('Skipping invalid download item during load:', item);
          }
        }
        console.log(`Loaded ${loadedCount} downloads from ${this.persistencePath}`);
        
        // Send the complete list to the renderer *only if it's ready*
        if (this.isRendererReady) {
            this.sendSavedDownloadsToRenderer();
        }
        
      } else {
        console.log('No saved downloads file found.');
      }
    } catch (error) {
      console.error('Error loading downloads:', error);
      // If loading fails, start with an empty map
      this.downloads.clear();
    }
  }

  // Save downloads before app exit
  public saveAndCleanup(): void {
    console.log('[saveAndCleanup] Starting cleanup and save process...');
    try {
      // Pause all active downloads without trying to update the UI
      for (const id of this.activeDownloads) {
        const download = this.downloads.get(id);
        if (download && download.status === DownloadStatus.DOWNLOADING) {
          // Just update the status in our data structure
          this.downloadEngine.pauseDownload(id, true); // Use silent mode
          download.status = DownloadStatus.PAUSED;
        }
      }
      
      // Save downloads without trying to access potentially destroyed objects
      console.log('[saveAndCleanup] Attempting synchronous save...');
      this.saveDownloadsSync();
      console.log('[saveAndCleanup] Synchronous save completed.');
    } catch (error) {
      console.error('[saveAndCleanup] Error during cleanup and save:', error);
    }
    console.log('[saveAndCleanup] Cleanup and save process finished.');
  }
  
  // Synchronous version of saveDownloads that doesn't try to update the UI
  private saveDownloadsSync(): void {
    try {
      const downloadsArray = Array.from(this.downloads.values()).map(download => {
        // Create a clean copy without circular references
        const cleanDownload = { ...download };
        
        // Convert dates to strings
        if (cleanDownload.createdAt instanceof Date) {
          cleanDownload.createdAt = cleanDownload.createdAt.toISOString();
        }
        
        return cleanDownload;
      });
      
      fs.writeFileSync(this.persistencePath, JSON.stringify(downloadsArray, null, 2), 'utf8');
      console.log(`Saved ${downloadsArray.length} downloads to ${this.persistencePath}`);
    } catch (error) {
      console.error('Error saving downloads:', error);
    }
  }

  /**
   * Sends the current list of downloads to the renderer.
   */
  public sendSavedDownloadsToRenderer(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      const downloadsArray = Array.from(this.downloads.values());
      console.log(`Sending ${downloadsArray.length} loaded downloads to renderer.`);
      this.mainWindow.webContents.send('downloads-loaded', downloadsArray);
    } else {
      console.warn('Cannot send saved downloads to renderer: mainWindow is not available.');
    }
  }

  /**
   * Get the full path to the downloaded file
   */
  public getDownloadPath(id: string): string | null {
    const download = this.downloads.get(id);
    if (!download) {
      return null;
    }
    
    // Use stored custom folder if available
    const downloadFolder = (download as any).downloadFolder || this.downloadFolder;
    return path.join(downloadFolder, download.filename);
  }

  /**
   * Check if the download exists and is completed
   */
  public isDownloadCompleted(id: string): boolean {
    const download = this.downloads.get(id);
    return !!download && download.status === DownloadStatus.COMPLETED;
  }

  /**
   * Creates a fresh new download, deleting any existing ones with the same URL
   */
  public async createNewDownload(url: string, options?: any): Promise<any> {
    console.log(`[DownloadManager] createNewDownload requested for URL: ${url}`, options);
    
    // Declare removedDownloads here to ensure it's in scope for the return
    let removedDownloads: { id: string, filename: string }[] = [];
    
    try {
      // Extract filename from URL
      let filename = '';
      
      // Check if a custom filename was provided in options
      if (options && options.customFilename) {
        filename = options.customFilename;
        console.log(`Using custom filename from options: ${filename}`);
      } else {
        try {
          const urlObj = new URL(url);
          // Get the last part of the path
          const pathParts = urlObj.pathname.split('/');
          filename = pathParts[pathParts.length - 1];
          
          // If filename is empty or doesn't have an extension, use a default name
          if (!filename || filename.indexOf('.') === -1) {
            // Use a more deterministic default name based on the URL
            const hash = crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
            filename = `download-${hash}.bin`;
          }
          
          // Decode URL-encoded characters in the filename
          filename = decodeURIComponent(filename);
        } catch (error) {
          console.error('Error extracting filename from URL:', error);
          const hash = crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
          filename = `download-${hash}.bin`;
        }
      }
      
      console.log(`Final filename: ${filename}`);
      
      // Use custom download folder if provided
      let downloadFolder = this.downloadFolder;
      if (options && options.downloadFolder) {
        downloadFolder = options.downloadFolder;
      }
      
      // Check if URL is already being downloaded
      if (this.isUrlBeingDownloaded(url)) {
        console.log(`Duplicate detected for ${url}. Checking options...`);
        const existingDownload = this.findDownloadByUrl(url); 
        if (options?.forceNewDownload) {
            console.log(`ForceNewDownload=true. Removing existing download ID: ${existingDownload?.id}`);
            this.removeDownload(existingDownload.id);
        } else if (options?.resumeExisting && existingDownload?.status === DownloadStatus.PAUSED) {
            console.log(`Resuming existing download ID: ${existingDownload.id}`);
            this.resumeDownload(existingDownload.id);
            return existingDownload;
        } else {
            console.warn(`Duplicate found for ${url}, but no force/resume option provided. Aborting.`);
            throw new Error('Duplicate download exists. Use overwrite or resume.');
        }
      }
      
      // Check if file exists on disk and create a unique filename if it does (when not resuming)
      const originalFilename = filename;
      let filePath = path.join(downloadFolder, filename);
      let fileExists = false;
      let counter = 1;
      
      try {
        // If forceNewDownload is true but we want to avoid overwriting existing files,
        // we'll create a numbered version
        while (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          fileExists = stats.isFile();
          
          if (fileExists) {
            console.log(`File exists at ${filePath}, creating a numbered version`);
            
            // Parse filename to create a numbered version
            const lastDotIndex = originalFilename.lastIndexOf('.');
            if (lastDotIndex !== -1) {
              // File has extension
              const nameWithoutExt = originalFilename.substring(0, lastDotIndex);
              const extension = originalFilename.substring(lastDotIndex);
              filename = `${nameWithoutExt} (${counter})${extension}`;
            } else {
              // File has no extension
              filename = `${originalFilename} (${counter})`;
            }
            
            filePath = path.join(downloadFolder, filename);
            counter++;
          } else {
            // Path exists but is not a file (maybe directory), break to avoid infinite loop
            break;
          }
        }
        
        console.log(`Final filename for download: ${filename}`);
      } catch (error) {
        console.error(`Error checking if file exists: ${error}`);
      }
      
      // Create new download item
      const newDownload: DownloadItem = {
        id: generateUUID(),
        url,
        filename: filename, // Store the final, DECODED, potentially numbered filename
        status: options?.startPaused ? DownloadStatus.PAUSED : DownloadStatus.QUEUED,
        progress: 0,
        speed: 0,
        size: 0,
        downloaded: 0,
        eta: 0,
        createdAt: new Date(),
        segments: [],
        downloadFolder: downloadFolder, // Store the final download folder path
        options: { ...options, customFilename: filename } // Store final filename in options too?
      };

      this.downloads.set(newDownload.id, newDownload);
      this.updateDownloadProgress(newDownload); // Notify renderer immediately
      this.saveDownloads();

      // Use finalFilename (decoded) when logging and passing to engine
      console.log(`[DownloadManager] Creating item ${newDownload.id} with filename: ${filename}, folder: ${downloadFolder}`);
      
      // Process queue if not starting paused
      if (!options?.startPaused) {
          this.processQueue();
      }
      
      return newDownload;
    } catch (error) {
      console.error('Error creating new download:', error);
      throw error;
    }
  }

  /**
   * Find an active/paused/queued download by its URL
   */
  public findDownloadByUrl(url: string): DownloadItem | undefined {
    const normalizedUrl = this.normalizeUrl(url);
    for (const download of this.downloads.values()) {
      const normalizedItemUrl = this.normalizeUrl(download.url);
      if (normalizedItemUrl === normalizedUrl) {
        if (download.status === DownloadStatus.DOWNLOADING || 
            download.status === DownloadStatus.QUEUED || 
            download.status === DownloadStatus.PAUSED) {
          return download;
        }
      }
    }
    return undefined;
  }
  
  /**
   * Get the default download folder
   */
  public getDefaultDownloadFolder(): string {
    return this.downloadFolder;
  }

  // Add setRendererReady method
  setRendererReady(): void {
    this.isRendererReady = true;
    console.log('[DownloadManager] Renderer is ready.');
    this.sendSavedDownloadsToRenderer(); 
  }

  // Method to send the full download list to the renderer
  private sendDownloadsToRenderer(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed() && this.isRendererReady) {
      const downloadsArray = Array.from(this.downloads.values());
      console.log('[DownloadManager] Sending current downloads to renderer:', downloadsArray.length);
      this.mainWindow.webContents.send('downloads-loaded', downloadsArray);
    } else {
        console.log('[DownloadManager] Cannot send downloads - Main window or renderer not ready.');
    }
  }

  // Add openFile method
  async openFile(id: string): Promise<boolean> {
    const download = this.downloads.get(id);
    if (!download) {
        console.error(`[openFile] Download not found for ID: ${id}`);
        throw new Error('Download not found');
    }
    if (download.status !== DownloadStatus.COMPLETED) {
        console.warn(`[openFile] Attempted to open non-completed download: ${id} (${download.status})`);
        throw new Error('Download is not completed');
    }

    const filePath = this.getDownloadPath(id); // Use existing helper
    if (!filePath) {
        console.error(`[openFile] Could not determine file path for ID: ${id}`);
        throw new Error('File path not found');
    }

    try {
        console.log(`[openFile] Opening file: ${filePath}`);
        await shell.openPath(filePath);
        return true;
    } catch (error) {
        console.error(`[openFile] Error opening file ${filePath}:`, error);
        throw new Error(`Failed to open file: ${error.message || 'Unknown error'}`);
    }
  }

  // Add showInFolder method
  async showInFolder(id: string): Promise<boolean> {
      const download = this.downloads.get(id);
      if (!download) {
          console.error(`[showInFolder] Download not found for ID: ${id}`);
          throw new Error('Download not found');
      }
      
      const filePath = this.getDownloadPath(id); // Use existing helper
      if (!filePath) {
          console.error(`[showInFolder] Could not determine file path for ID: ${id}`);
          throw new Error('File path not found');
      }

      try {
          console.log(`[showInFolder] Showing item in folder: ${filePath}`);
          await shell.showItemInFolder(filePath);
          return true;
      } catch (error) {
          console.error(`[showInFolder] Error showing item ${filePath}:`, error);
          throw new Error(`Failed to show item in folder: ${error.message || 'Unknown error'}`);
      }
  }
} 