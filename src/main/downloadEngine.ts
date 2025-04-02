import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { EventEmitter } from 'events';
import { DownloadItem, DownloadStatus, DownloadSegment } from '../common/types';

// Number of concurrent connections per download
const DEFAULT_CONNECTIONS = 8;
// Default segment size (5MB)
const DEFAULT_SEGMENT_SIZE = 5 * 1024 * 1024;
// Minimum file size to use segmented download (1MB)
const MIN_SIZE_FOR_SEGMENTATION = 1 * 1024 * 1024;
// Minimum speed to consider a connection healthy (10KB/s)
const MIN_HEALTHY_SPEED = 10 * 1024;
// Maximum retries for failed segments
const MAX_SEGMENT_RETRIES = 3;
// Interval to check connection health (5 seconds)
const CONNECTION_HEALTH_CHECK_INTERVAL = 5000;

interface DownloadOptions {
  url: string;
  filename: string;
  directory: string;
  connections?: number;
  segmentSize?: number;
  maxRetries?: number;
  dynamicConnections?: boolean;
}

export class DownloadEngine extends EventEmitter {
  private activeDownloads: Map<string, DownloadTask>;

  constructor() {
    super();
    this.activeDownloads = new Map();
  }

  /**
   * Start a new download
   */
  public async startDownload(id: string, options: DownloadOptions): Promise<void> {
    // Create a new download task
    const task = new DownloadTask(id, options);
    
    // Add event listeners
    task.on('progress', (progress) => {
      this.emit('progress', { id, ...progress });
    });
    
    task.on('complete', () => {
      this.activeDownloads.delete(id);
      this.emit('complete', { id });
    });
    
    task.on('error', (error) => {
      this.activeDownloads.delete(id);
      this.emit('error', { id, error });
    });
    
    // Start the download
    this.activeDownloads.set(id, task);
    task.start();
  }

  /**
   * Start a new download with existing segment information
   */
  public async resumeDownloadWithSegments(id: string, options: DownloadOptions, savedData: any): Promise<void> {
    // Create a new download task with saved data
    const task = new DownloadTask(id, options);
    
    // Add event listeners
    task.on('progress', (progress) => {
      this.emit('progress', { id, ...progress });
    });
    
    task.on('complete', () => {
      this.activeDownloads.delete(id);
      this.emit('complete', { id });
    });
    
    task.on('error', (error) => {
      this.activeDownloads.delete(id);
      this.emit('error', { id, error });
    });
    
    // Set the saved data
    await task.restoreState(savedData);
    
    // Start the download
    this.activeDownloads.set(id, task);
    task.resume();
  }

  /**
   * Pause a download
   */
  public pauseDownload(id: string, silent = false): boolean {
    const task = this.activeDownloads.get(id);
    if (!task) {
      console.error(`Cannot pause download ${id}: not active`);
      return false;
    }
    
    return task.pause(silent);
  }

  /**
   * Resume a download
   */
  public resumeDownload(id: string): boolean {
    const task = this.activeDownloads.get(id);
    if (!task) {
      return false;
    }
    
    return task.resume();
  }

  /**
   * Cancel a download
   */
  public cancelDownload(id: string): boolean {
    const task = this.activeDownloads.get(id);
    if (!task) {
      return false;
    }
    
    task.cancel();
    this.activeDownloads.delete(id);
    return true;
  }
}

/**
 * Manages a single download with multiple connections
 */
class DownloadTask extends EventEmitter {
  private id: string;
  private url: string;
  private filename: string;
  private directory: string;
  private connections: number;
  private segmentSize: number;
  private fileSize: number;
  private downloadedBytes: number;
  private segments: DownloadSegment[];
  private activeSegments: Set<number>;
  private status: DownloadStatus;
  private startTime: number;
  private lastUpdateTime: number;
  private lastDownloadedBytes: number;
  private speed: number;
  private tempDirectory: string;
  private downloadRequests: http.ClientRequest[];
  private downloadInterval: NodeJS.Timeout | null;
  private healthCheckInterval: NodeJS.Timeout | null;
  private maxRetries: number;
  private segmentRetries: Map<number, number>;
  private dynamicConnections: boolean;
  private segmentSpeeds: Map<number, number>;

  constructor(id: string, options: DownloadOptions) {
    super();
    this.id = id;
    this.url = options.url;
    this.filename = options.filename;
    this.directory = options.directory;
    this.connections = options.connections || DEFAULT_CONNECTIONS;
    this.segmentSize = options.segmentSize || DEFAULT_SEGMENT_SIZE;
    this.maxRetries = options.maxRetries || MAX_SEGMENT_RETRIES;
    this.dynamicConnections = options.dynamicConnections !== undefined ? options.dynamicConnections : true;
    this.fileSize = 0;
    this.downloadedBytes = 0;
    this.segments = [];
    this.activeSegments = new Set();
    this.status = DownloadStatus.QUEUED;
    this.startTime = Date.now();
    this.lastUpdateTime = this.startTime;
    this.lastDownloadedBytes = 0;
    this.speed = 0;
    this.tempDirectory = path.join(this.directory, '.temp', this.id);
    this.downloadRequests = [];
    this.downloadInterval = null;
    this.healthCheckInterval = null;
    this.segmentRetries = new Map();
    this.segmentSpeeds = new Map();
    
    // --- DIAGNOSTIC LOG --- 
    console.log(`[Task ${this.id}] Constructor called with options:`, JSON.stringify(options, null, 2));
    console.log(`[Task ${this.id}] Save Directory set to: ${this.directory}`);
    console.log(`[Task ${this.id}] Temp Directory set to: ${this.tempDirectory}`);
    if (!this.directory) {
        console.error(`[Task ${this.id}] CRITICAL: Directory is empty or undefined in constructor!`);
    }
    // --- END DIAGNOSTIC LOG --- 
  }

  /**
   * Restore download state from saved data
   */
  public async restoreState(savedData: any): Promise<void> {
    // Restore file size and downloaded bytes
    this.fileSize = savedData.size || 0;
    this.downloadedBytes = savedData.downloaded || 0;
    
    // Restore segments if available
    if (Array.isArray(savedData.segments) && savedData.segments.length > 0) {
      this.segments = savedData.segments.map((segment: any) => ({
        ...segment,
        status: DownloadStatus.QUEUED // Mark as queued to download remaining parts
      }));
      
      // Ensure temp directory exists
      if (!fs.existsSync(this.tempDirectory)) {
        fs.mkdirSync(this.tempDirectory, { recursive: true });
      }
      
      // Check if segment files exist and verify their sizes
      for (const segment of this.segments) {
        const segmentPath = path.join(this.tempDirectory, `segment-${segment.id}`);
        
        // If the segment file doesn't exist, create an empty one
        if (!fs.existsSync(segmentPath)) {
          segment.downloaded = 0;
          segment.progress = 0;
          
          // Create an empty placeholder file
          try {
            fs.writeFileSync(segmentPath, '');
          } catch (error) {
            console.error(`Error creating segment file: ${error}`);
          }
          continue;
        }
        
        // Get the file size
        try {
          const stats = fs.statSync(segmentPath);
          // Verify if the saved download amount matches the file size
          if (stats.size !== segment.downloaded) {
            // Update to the actual size
            segment.downloaded = stats.size;
            segment.progress = (stats.size / (segment.end - segment.start + 1)) * 100;
            
            // Update total downloaded bytes to match actual file size
            this.downloadedBytes += (stats.size - segment.downloaded);
          }
          
          // If the segment is 100% downloaded, mark it as completed
          if (segment.downloaded >= (segment.end - segment.start + 1)) {
            segment.status = DownloadStatus.COMPLETED;
            segment.progress = 100;
          }
        } catch (error) {
          // If there's an error, reset progress
          segment.downloaded = 0;
          segment.progress = 0;
          
          // Create an empty placeholder file
          try {
            fs.writeFileSync(segmentPath, '');
          } catch (e) {
            console.error(`Error creating segment file: ${e}`);
          }
        }
      }
    } else {
      // If no segments are available, create them
      await this.getFileInfo();
      this.createSegments();
    }
    
    // Restore speed and timing information
    this.startTime = Date.now();
    this.lastUpdateTime = this.startTime;
    this.lastDownloadedBytes = this.downloadedBytes;
    this.speed = savedData.speed || 0;
    
    // Set status to paused so resume() can work properly
    this.status = DownloadStatus.PAUSED;
  }

  /**
   * Start the download process
   */
  public async start(): Promise<void> {
    // --- DIAGNOSTIC LOG --- 
    console.log(`[Task ${this.id}] Entering start() method.`);
    // --- END DIAGNOSTIC LOG --- 
    try {
      // Ensure the main download directory exists
      if (!fs.existsSync(this.directory)) {
         console.log(`[Task ${this.id}] Creating main directory: ${this.directory}`);
        fs.mkdirSync(this.directory, { recursive: true });
      }
      
      // Ensure the temporary directory for this download exists
      if (!fs.existsSync(this.tempDirectory)) {
          console.log(`[Task ${this.id}] Creating temporary directory: ${this.tempDirectory}`);
          fs.mkdirSync(this.tempDirectory, { recursive: true });
      } else {
          console.log(`[Task ${this.id}] Temporary directory already exists: ${this.tempDirectory}`);
      }
      
      this.status = DownloadStatus.DOWNLOADING;
      this.startTime = Date.now();
      this.lastUpdateTime = this.startTime;
      this.lastDownloadedBytes = 0;
      
      // Get file info (size, support for ranges)
      await this.getFileInfo();
      
      // Now, create segments based on the file info obtained
      this.createSegments();
      
      // Start downloading segments
      this.downloadSegments();
      
      // Start progress reporting
      this.startProgressReporting();
      
      // Start connection health check
      this.startConnectionHealthCheck();

    } catch (error: any) {
      console.error(`Error starting download ${this.id}:`, error);
      this.handleError(error);
    }
  }

  /**
   * Pause the download
   */
  public pause(silent = false): boolean {
    // If not downloading, return
    if (this.status !== DownloadStatus.DOWNLOADING) {
      return false;
    }
    
    console.log(`Pausing download with active requests: ${this.downloadRequests.length}`);
    
    // Set status to paused
    this.status = DownloadStatus.PAUSED;
    
    // Mark requests as paused BEFORE aborting them
    for (const request of this.downloadRequests) {
      (request as any).isPaused = true;
    }
    
    // Now safely abort the requests
    for (const request of this.downloadRequests) {
      try {
        console.log(`Aborting request for paused segment`);
        request.abort();
      } catch (error: any) {
        console.error(`Error aborting request: ${error.message}`);
      }
    }
    
    // Clear the stored requests array after attempting abort
    this.downloadRequests = []; 

    // Mark active segments as PAUSED
    for (const segmentId of this.activeSegments) {
      const segment = this.segments.find(s => s.id === segmentId);
      if (segment) {
        console.log(`Marking segment ${segmentId} as paused`);
        segment.status = DownloadStatus.PAUSED;
      }
    }
    
    // Stop progress reporting & health checks
    this.stopProgressReporting();
    this.stopConnectionHealthCheck();
    
    // Emit progress event if not silent
    if (!silent) {
      this.emitProgress();
    }
    
    return true;
  }

  /**
   * Resume the download
   */
  public resume(): boolean {
    // If not paused, return
    if (this.status !== DownloadStatus.PAUSED && this.status !== DownloadStatus.QUEUED) {
      return false;
    }
    
    console.log(`Resuming download, segments: ${this.segments.length}, active: ${this.activeSegments.size}`);
    
    // Set status to downloading
    this.status = DownloadStatus.DOWNLOADING;
    
    // Reset timing information
    this.startTime = Date.now();
    this.lastUpdateTime = this.startTime;
    this.lastDownloadedBytes = this.downloadedBytes;
    
    // Make sure all download requests are cleared
    this.downloadRequests = [];
    
    // Mark paused segments as queued
    for (const segment of this.segments) {
      if (segment.status === DownloadStatus.PAUSED) {
        segment.status = DownloadStatus.QUEUED;
      }
    }
    
    // Clear the activeSegments set to allow redownloading paused segments
    this.activeSegments = new Set();
    
    // Start progress reporting
    this.startProgressReporting();
    
    // Start connection health checks if dynamic connections enabled
    if (this.dynamicConnections) {
      this.startConnectionHealthCheck();
    }
    
    // Resume downloading segments
    this.downloadSegments();
    
    return true;
  }

  /**
   * Cancel the download
   */
  public cancel(): boolean {
    // Abort all active requests
    this.downloadRequests.forEach(request => {
      try {
        request.abort();
      } catch (error) {
        console.error(`Error aborting download: ${error}`);
      }
    });
    
    // Clear the requests array
    this.downloadRequests = [];
    
    // Stop progress reporting
    this.stopProgressReporting();
    
    // Delete temp files
    this.cleanupTempFiles();
    
    // Set status to error
    this.status = DownloadStatus.ERROR;
    
    // Emit progress event
    this.emitProgress();
    
    return true;
  }

  /**
   * Get file information (size, etc.), letting Axios handle redirects.
   */
  private async getFileInfo(): Promise<void> {
    const MAX_REDIRECTS = 5;
    const TIMEOUT = 15000; // 15 seconds
    const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

    console.log(`Getting file info for ${this.url} (following redirects)`);
    
    try {
      // First, try HEAD request, allowing redirects
      try {
        const headResponse = await axios.head(this.url, {
          maxRedirects: MAX_REDIRECTS,
          timeout: TIMEOUT,
          headers: { 'User-Agent': USER_AGENT }
        });
        console.log(`getFileInfo HEAD request final URL: ${headResponse.request?.responseURL || this.url}`);
        console.log(`getFileInfo HEAD response status: ${headResponse.status}`);

        const contentLength = headResponse.headers['content-length'];
        if (contentLength) {
          this.fileSize = parseInt(contentLength, 10);
          console.log(`HEAD success: File size ${this.fileSize} bytes.`);
          return; // Size found
        } else {
             console.log('HEAD success but no content-length header found.');
        }
      } catch (headError: any) {
        console.warn(`getFileInfo HEAD request failed: ${headError.message}. Status: ${headError.response?.status}`);
        // Don't give up yet, try GET Range
      }

      // If HEAD failed or didn't give size, try GET with Range, allowing redirects
      console.log('Trying GET with Range (following redirects)...');
      try {
        const rangeResponse = await axios.get(this.url, {
          maxRedirects: MAX_REDIRECTS,
          timeout: TIMEOUT,
          headers: { 
              'Range': 'bytes=0-0',
              'User-Agent': USER_AGENT
          }
        });
        console.log(`getFileInfo GET Range request final URL: ${rangeResponse.request?.responseURL || this.url}`);
        console.log(`getFileInfo GET Range response status: ${rangeResponse.status}`);

        const contentRange = rangeResponse.headers['content-range'];
        if (contentRange) {
          const match = contentRange.match(/\/(\d+)/); // Look for */<size>
          if (match && match[1]) {
            this.fileSize = parseInt(match[1], 10);
            console.log(`GET Range success: File size ${this.fileSize} bytes.`);
            return; // Size found
          }
        }
        console.log('GET Range success but no valid content-range header found.');

        // Last resort: If GET Range worked but didn't have Content-Range,
        // check if it returned Content-Length (some servers might do this
        // even for range requests, ignoring the range)
        const contentLength = rangeResponse.headers['content-length'];
         if (contentLength) {
             this.fileSize = parseInt(contentLength, 10);
             console.log(`GET Range fallback: Found content-length: ${this.fileSize} bytes.`);
             return; // Size found
         }

      } catch (rangeError: any) {
         console.warn(`getFileInfo GET Range request failed: ${rangeError.message}. Status: ${rangeError.response?.status}`);
      }

      // If both failed after redirects, fallback
      console.warn('Could not determine file size after HEAD/GET Range attempts (with redirects). Falling back.');
      this.fileSize = 0;
      this.connections = 1;
      
    } catch (error: any) {
      // Catch any unexpected error during the process
      console.error(`Unexpected error in getFileInfo for ${this.url}: ${error.message}`);
      this.fileSize = 0;
      this.connections = 1;
    }
  }

  /**
   * Create segments for the download
   */
  private createSegments(): void {
    // If we don't know the file size or it's small, use a single segment
    if (this.fileSize === 0 || this.fileSize < MIN_SIZE_FOR_SEGMENTATION || this.connections === 1) {
      this.segments = [{
        id: 0,
        start: 0,
        end: this.fileSize > 0 ? this.fileSize - 1 : 0,
        downloaded: 0,
        progress: 0,
        status: DownloadStatus.QUEUED
      }];
      return;
    }
    
    // Calculate segment size based on file size and number of connections
    const segmentSize = Math.min(this.segmentSize, Math.ceil(this.fileSize / this.connections));
    
    // Create segments
    this.segments = [];
    let segmentId = 0;
    
    for (let start = 0; start < this.fileSize; start += segmentSize) {
      const end = Math.min(start + segmentSize - 1, this.fileSize - 1);
      
      this.segments.push({
        id: segmentId++,
        start,
        end,
        downloaded: 0,
        progress: 0,
        status: DownloadStatus.QUEUED
      });
    }
  }

  /**
   * Download segments
   */
  private async downloadSegments(): Promise<void> {
    // If the download is no longer active, return
    if (this.status !== DownloadStatus.DOWNLOADING) {
      return;
    }
    
    // Find segments that are not yet downloaded
    const pendingSegments = this.segments.filter(segment => 
      segment.status !== DownloadStatus.COMPLETED && 
      !this.activeSegments.has(segment.id)
    );
    
    // If there are no more segments to download, we're done
    if (pendingSegments.length === 0 && this.activeSegments.size === 0) {
      await this.finalizeDownload();
      return;
    }
    
    // Calculate how many more segments we can download concurrently
    const availableSlots = this.connections - this.activeSegments.size;
    
    // Start downloading segments
    for (let i = 0; i < Math.min(availableSlots, pendingSegments.length); i++) {
      const segment = pendingSegments[i];
      
      // Mark the segment as active
      this.activeSegments.add(segment.id);
      
      // Update segment status
      segment.status = DownloadStatus.DOWNLOADING;
      
      // Start downloading the segment
      this.downloadSegment(segment).then(() => {
        // When the segment is done, remove it from active segments
        this.activeSegments.delete(segment.id);
        
        // Check if we can download more segments
        this.downloadSegments();
      });
    }
  }

  /**
   * Download a single segment
   */
  private async downloadSegment(segment: DownloadSegment): Promise<void> {
    // If the download is no longer active, return
    if (this.status !== DownloadStatus.DOWNLOADING) {
      console.log(`Download no longer active for segment ${segment.id}, status: ${this.status}`);
      return;
    }
    
    // Create a temp file path for the segment
    const tempFile = path.join(this.tempDirectory, `segment-${segment.id}`);
    
    // --- DIAGNOSTIC LOGGING & PREEMPTIVE CHECK --- 
    console.log(`[Segment ${segment.id}] Attempting write stream.`);
    console.log(`[Segment ${segment.id}] Temp Directory: ${this.tempDirectory}`);
    console.log(`[Segment ${segment.id}] Temp File Path: ${tempFile}`);
    try {
        const dirExists = fs.existsSync(this.tempDirectory);
        console.log(`[Segment ${segment.id}] Directory exists check: ${dirExists}`);
        if (!dirExists) {
            console.log(`[Segment ${segment.id}] PREEMPTIVE CHECK: Directory NOT found. Creating...`);
            fs.mkdirSync(this.tempDirectory, { recursive: true });
            console.log(`[Segment ${segment.id}] PREEMPTIVE CHECK: Directory created.`);
        }
    } catch (dirError) {
        console.error(`[Segment ${segment.id}] Error during preemptive directory check/creation:`, dirError);
        // Decide if we should throw or try to continue
        this.handleError(new Error(`Failed to ensure temp directory for segment ${segment.id}: ${dirError.message}`));
        return; // Stop processing this segment if directory fails
    }
    // --- END DIAGNOSTIC LOGGING & PREEMPTIVE CHECK --- 

    // Determine if we're appending to an existing file
    const appendToExisting = segment.downloaded > 0 && fs.existsSync(tempFile);
    
    // Create a write stream - append if we already have data
    let writeStream: fs.WriteStream;
    try {
      writeStream = fs.createWriteStream(tempFile, { 
        flags: appendToExisting ? 'a' : 'w' 
      });
    } catch (streamError) {
        console.error(`[Segment ${segment.id}] FAILED to create write stream for ${tempFile}:`, streamError);
        this.handleError(new Error(`Failed create write stream for segment ${segment.id}: ${streamError.message}`));
        return; // Stop processing this segment
    }
    
    // Track segment download speed
    let segmentStartTime = Date.now();
    let segmentLastBytes = segment.downloaded;
    let segmentLastTime = segmentStartTime;
    let retryCount = 0;
    const maxRetries = this.maxRetries;
    
    const downloadWithRetry = async (currentUrl: string = this.url, redirectCount: number = 0): Promise<void> => {
      // Check if the download is no longer active
      // @ts-ignore - Linter doesn't account for async status change during await
      if (this.status !== DownloadStatus.DOWNLOADING) {
        console.log(`Download is no longer active (${this.status}) for segment ${segment.id}, not starting request`);
        return;
      }

      // Prevent infinite redirects
      const MAX_REDIRECTS = 5;
      if (redirectCount > MAX_REDIRECTS) {
          throw new Error(`Maximum redirects (${MAX_REDIRECTS}) exceeded for segment ${segment.id}`);
      }

      // If we've exceeded the retry limit for the *original* URL attempt
      if (retryCount >= maxRetries) {
        console.error(`Maximum retries (${maxRetries}) exceeded for segment ${segment.id}`);
        throw new Error(`Maximum retries exceeded for segment ${segment.id}`);
      }
      
      // Exponential backoff for retries (only if it's a retry, not a redirect)
      if (retryCount > 0 && redirectCount === 0) { 
        console.log(`Retry ${retryCount}/${maxRetries} for segment ${segment.id}`);
        await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, retryCount), 10000)));
      }
      
      let request: http.ClientRequest | null = null; // Keep track of the request for potential abort
      
      try {
        console.log(`Attempting segment ${segment.id} from ${currentUrl} (redirect ${redirectCount}, retry ${retryCount})`);
        
        const isHttps = currentUrl.startsWith('https://');
        const httpModule = isHttps ? https : http;
        const urlObj = new URL(currentUrl);
        
        const options: http.RequestOptions = {
          hostname: urlObj.hostname,
          port: urlObj.port || (isHttps ? 443 : 80),
          path: urlObj.pathname + urlObj.search,
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          timeout: 30000 
        };
        
        if (this.fileSize > 0 && this.connections > 1) {
          const startByte = segment.start + segment.downloaded;
          const endByte = segment.end;
          options.headers['Range'] = `bytes=${startByte}-${endByte}`;
          console.log(`Using range request: bytes=${startByte}-${endByte}`);
        }
        
        await new Promise<void>((resolve, reject) => {
          request = httpModule.request(options, (response) => {
             console.log(`Response status: ${response.statusCode} for segment ${segment.id}`);
             
             // Handle Redirects (301, 302, 307, 308)
             if (response.statusCode && [301, 302, 307, 308].includes(response.statusCode)) {
                 const location = response.headers.location;
                 if (location) {
                     console.log(`Redirecting segment ${segment.id} to: ${location}`);
                     response.resume(); // Consume response data to free up memory
                     // Recursively call with new URL and incremented redirect count
                     downloadWithRetry(location, redirectCount + 1).then(resolve).catch(reject);
                     return; // Stop processing this response
                 } else {
                     reject(new Error(`Redirect status ${response.statusCode} received without Location header.`));
                     return;
                 }
             }

             // Handle Non-Successful Status Codes (other than redirects and 200/206)
             if (response.statusCode !== 200 && response.statusCode !== 206) {
                response.resume(); // Consume response data
                reject(new Error(`Server responded with status code ${response.statusCode}`));
                return;
             }

             // *** Successful Response (200 or 206) - Start Stream Handling ***

             // Add request to list for potential pause/cancel
             if (request) {
                this.downloadRequests.push(request);
                // Clean up request from list when it's truly finished (on 'end' or 'error')
                const cleanupRequest = () => {
                    this.downloadRequests = this.downloadRequests.filter(r => r !== request);
                };
                response.on('end', cleanupRequest);
                response.on('error', cleanupRequest);
                request.on('error', cleanupRequest);
             }

             let streamClosed = false; // Flag to prevent double handling

             response.on('data', (chunk: Buffer) => {
                if (streamClosed) return;
                // Check status before writing
                // @ts-ignore - Linter doesn't account for async status change during await
                if (this.status !== DownloadStatus.DOWNLOADING) {
                    if (request && !(request as any).isPaused) {
                        console.log('Status changed during download, aborting request for segment', segment.id);
                        (request as any).isPaused = true; // Mark as paused
                        request.abort(); 
                    }
                    return;
                }
                try {
                    writeStream.write(chunk);
                    segment.downloaded += chunk.length;
                    segment.progress = Math.min(100, (segment.downloaded / (segment.end - segment.start + 1)) * 100);
                    this.downloadedBytes += chunk.length;
                    // Speed calculation logic
                    const now = Date.now();
                    const timeDiff = now - segmentLastTime;
                    if (timeDiff >= 1000) {
                        const bytesDiff = segment.downloaded - segmentLastBytes;
                        const segmentSpeed = bytesDiff / (timeDiff / 1000);
                        this.segmentSpeeds.set(segment.id, segmentSpeed);
                        segmentLastBytes = segment.downloaded;
                        segmentLastTime = now;
                    }
                } catch (writeError) {
                    if (streamClosed) return;
                    streamClosed = true;
                    const errorMsg = String(writeError);
                    console.error(`Error writing chunk for segment ${segment.id}:`, errorMsg);
                    if (request) request.abort(); // Abort request on write error
                    reject(writeError);
                }
            });

            response.on('end', () => {
                if (streamClosed) return;
                streamClosed = true;
                writeStream.end(() => {
                    // @ts-ignore
                    if ((request as any)?.isPaused || this.status !== DownloadStatus.DOWNLOADING) {
                       console.log(`Download end ignored due to pause/status change for segment ${segment.id}`);
                    } else {
                       console.log(`Segment ${segment.id} downloaded successfully`);
                       segment.status = DownloadStatus.COMPLETED;
                       segment.progress = 100;
                    }
                    resolve();
                });
            });

            response.on('error', (error: Error) => {
                if (streamClosed) return;
                streamClosed = true;
                writeStream.end();
                // @ts-ignore
                if ((request as any)?.isPaused) {
                   console.log(`Response stream error ignored for paused segment ${segment.id}: ${String(error)}`);
                   resolve(); // Resolve as pause is handled
                   return;
                }
                console.error(`Response stream error for segment ${segment.id}: ${String(error)}`);
                reject(error);
            });
          });

          // Handle initial request errors (DNS, connection refused, etc.)
          request.on('error', (error: NodeJS.ErrnoException) => {
              // @ts-ignore
              if ((request as any)?.isPaused) {
                 console.log(`Initial request error ignored for paused segment ${segment.id}: ${String(error)}`);
                 resolve(); // Resolve as pause is handled
                 return;
              }
              console.error(`Initial request error for segment ${segment.id}: ${error.code || 'UnknownCode'} ${String(error)}`);
              reject(error);
          });

          // Handle request timeout
          request.on('timeout', () => {
              request?.abort(); // Abort on timeout
              reject(new Error(`Request timeout for segment ${segment.id}`));
          });

          // End the request (send it)
          request.end();
        });
      } catch (error: any) { // Catch errors from Promise reject or initial setup errors
         if (request && !request.destroyed) {
             request.abort(); // Ensure request is aborted on outer catch
         }
         if (!writeStream.destroyed) {
             writeStream.end();
         }

         console.error(`Caught error during downloadWithRetry segment ${segment.id}: ${String(error)}`);

         // Check if it was pause/abort related before retrying
         // @ts-ignore
         if ((request as any)?.isPaused || this.status !== DownloadStatus.DOWNLOADING) {
            console.log(`Download not in downloading state or was paused for segment ${segment.id}`);
            return; // Do not retry
         }

         retryCount++; // Increment retry count for the original URL attempt
         console.log(`Attempting retry ${retryCount}/${maxRetries} for segment ${segment.id}`);
         // Recursively call with the *original* URL to retry
         return downloadWithRetry(this.url, 0); 
      }
    }; // End of downloadWithRetry definition
    
    try {
      await downloadWithRetry();
    } catch (error) {
      // **Revised Fix v2**: Prioritize checking the overall task status.
      // @ts-ignore - Linter doesn't account for async status change during await
      if (this.status === DownloadStatus.PAUSED) {
        console.error(`Segment ${segment.id} failure handling called while task is PAUSED. Ignoring error: ${error?.message}`);
        segment.status = DownloadStatus.PAUSED; // Ensure segment reflects pause
        return;
      }

      // Also check for explicit abort message
      if (error?.message === 'aborted') {
        console.error(`Segment ${segment.id} explicit 'aborted' error in failure handler. Ignoring.`);
        // Don't change segment status here, outer catch should handle it if task is paused.
        return;
      }
      
      // If neither paused nor aborted, proceed with retry logic
      console.error(`Handling potentially real error for segment ${segment.id}: ${error?.message}`);
      const currentRetries = this.segmentRetries.get(segment.id) || 0;
      if (currentRetries < this.maxRetries) {
        console.log(`Retrying segment ${segment.id} (attempt ${currentRetries + 1}/${this.maxRetries})`);
        this.segmentRetries.set(segment.id, currentRetries + 1);
        segment.status = DownloadStatus.QUEUED;
        // Ensure this segment is picked up again by the main loop
        this.downloadSegments();
      } else {
        console.error(`Max retries reached for segment ${segment.id}, marking segment as error`);
        segment.status = DownloadStatus.ERROR;
        // Check if ALL segments are completed or errored to determine overall task status
        this.checkOverallCompletion();
      }
    }
  }

  /**
   * Finalize the download by merging segments
   */
  private async finalizeDownload(): Promise<void> {
    try {
      // Stop progress reporting
      this.stopProgressReporting();
      
      // Create output directory if it doesn't exist
      if (!fs.existsSync(this.directory)) {
        fs.mkdirSync(this.directory, { recursive: true });
      }
      
      // Create the output file
      const outputPath = path.join(this.directory, this.filename);
      
      // Check if file already exists
      let fileAlreadyExists = false;
      try {
        if (fs.existsSync(outputPath)) {
          const stats = fs.statSync(outputPath);
          fileAlreadyExists = stats.isFile() && stats.size > 0;
        }
      } catch (error) {
        console.error(`Error checking output file: ${error}`);
      }
      
      // If file exists, add a number suffix to avoid overwriting
      let finalOutputPath = outputPath;
      if (fileAlreadyExists) {
        console.log(`File already exists at ${outputPath}, checking if it's the same file...`);
        
        // Check if the file content is the same by comparing some segments
        // If it's the same size, we assume it's the same file
        const existingSize = fs.statSync(outputPath).size;
        
        if (existingSize === this.fileSize) {
          console.log('Existing file has the same size, assuming it\'s the same file');
          
          // Clean up temp files
          this.cleanupTempFiles();
          
          // Set status to completed
          this.status = DownloadStatus.COMPLETED;
          
          // Emit progress event
          this.emitProgress();
          
          // Emit complete event
          this.emit('complete');
          
          return;
        }
        
        // Otherwise, generate a new filename with a number suffix
        const extIndex = this.filename.lastIndexOf('.');
        let basename: string, extension: string;
        
        if (extIndex > 0) {
          basename = this.filename.substring(0, extIndex);
          extension = this.filename.substring(extIndex);
        } else {
          basename = this.filename;
          extension = '';
        }
        
        let counter = 1;
        do {
          finalOutputPath = path.join(this.directory, `${basename} (${counter})${extension}`);
          counter++;
        } while (fs.existsSync(finalOutputPath));
        
        console.log(`Using alternative filename to avoid overwriting: ${finalOutputPath}`);
      }
      
      // Create a write stream for the final output
      const outputStream = fs.createWriteStream(finalOutputPath);
      
      // Merge segments
      for (const segment of this.segments) {
        const segmentPath = path.join(this.tempDirectory, `segment-${segment.id}`);
        
        if (!fs.existsSync(segmentPath)) {
          throw new Error(`Segment file not found: ${segmentPath}`);
        }
        
        // Read the segment file
        const segmentData = fs.readFileSync(segmentPath);
        
        // Write the segment data to the output file
        outputStream.write(segmentData);
      }
      
      // Close the output stream
      outputStream.end();
      
      // Wait for the stream to finish
      await new Promise<void>((resolve, reject) => {
        outputStream.on('finish', resolve);
        outputStream.on('error', reject);
      });
      
      // Clean up temp files
      this.cleanupTempFiles();
      
      // Set status to completed
      this.status = DownloadStatus.COMPLETED;
      
      // Emit progress event
      this.emitProgress();
      
      // Emit complete event
      this.emit('complete');
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Start progress reporting
   */
  private startProgressReporting(): void {
    // Clear any existing interval
    this.stopProgressReporting();
    
    // Start a new interval
    this.downloadInterval = setInterval(() => {
      this.updateSpeed();
      this.emitProgress();
    }, 1000);
  }

  /**
   * Stop progress reporting
   */
  private stopProgressReporting(): void {
    if (this.downloadInterval) {
      clearInterval(this.downloadInterval);
      this.downloadInterval = null;
    }
  }

  /**
   * Update download speed
   */
  private updateSpeed(): void {
    const now = Date.now();
    const timeDiff = (now - this.lastUpdateTime) / 1000; // Convert to seconds
    
    if (timeDiff > 0) {
      const byteDiff = this.downloadedBytes - this.lastDownloadedBytes;
      this.speed = byteDiff / timeDiff; // Bytes per second
      
      this.lastUpdateTime = now;
      this.lastDownloadedBytes = this.downloadedBytes;
    }
  }

  /**
   * Emit progress event
   */
  private emitProgress(): void {
    // Calculate overall progress
    const progress = this.fileSize > 0 ? (this.downloadedBytes / this.fileSize) * 100 : 0;
    
    // Calculate ETA
    let eta = 0;
    if (this.speed > 0 && this.fileSize > this.downloadedBytes) {
      eta = (this.fileSize - this.downloadedBytes) / this.speed;
    }
    
    // Emit progress event
    this.emit('progress', {
      progress,
      speed: this.speed,
      downloaded: this.downloadedBytes,
      size: this.fileSize,
      eta,
      status: this.status,
      segments: this.segments
    });
  }

  /**
   * Handle errors
   */
  private handleError(error: any): void {
    console.error(`Download error: ${error}`);
    
    // Set status to error
    this.status = DownloadStatus.ERROR;
    
    // Stop progress reporting
    this.stopProgressReporting();
    
    // Emit progress event
    this.emitProgress();
    
    // Emit error event
    this.emit('error', error.toString());
  }

  /**
   * Clean up temporary files
   */
  private cleanupTempFiles(): void {
    try {
      // Delete each segment file
      for (const segment of this.segments) {
        const segmentPath = path.join(this.tempDirectory, `segment-${segment.id}`);
        
        if (fs.existsSync(segmentPath)) {
          fs.unlinkSync(segmentPath);
        }
      }
      
      // Delete the temp directory
      if (fs.existsSync(this.tempDirectory)) {
        fs.rmdirSync(this.tempDirectory, { recursive: true });
      }
    } catch (error) {
      console.error(`Error cleaning up temp files: ${error}`);
    }
  }

  /**
   * Start connection health check
   */
  private startConnectionHealthCheck(): void {
    // Clear any existing interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Create a new interval
    this.healthCheckInterval = setInterval(() => {
      this.checkConnectionHealth();
    }, CONNECTION_HEALTH_CHECK_INTERVAL);
  }

  /**
   * Stop connection health check
   */
  private stopConnectionHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Check connection health and adjust number of connections
   */
  private checkConnectionHealth(): void {
    // Only check if we're downloading
    if (this.status !== DownloadStatus.DOWNLOADING) {
      return;
    }
    
    // Calculate average speed per connection
    let totalActiveSpeed = 0;
    let activeConnectionCount = 0;
    
    for (const segmentId of this.activeSegments) {
      const speed = this.segmentSpeeds.get(segmentId) || 0;
      if (speed > 0) {
        totalActiveSpeed += speed;
        activeConnectionCount++;
      }
    }
    
    // If we have active connections
    if (activeConnectionCount > 0) {
      const avgSpeed = totalActiveSpeed / activeConnectionCount;
      
      // If average speed is good, try adding more connections
      if (avgSpeed > MIN_HEALTHY_SPEED && this.connections < 16) {
        this.connections++;
        console.log(`Increasing connections to ${this.connections} for download ${this.id}`);
      }
      // If average speed is poor, reduce connections
      else if (avgSpeed < MIN_HEALTHY_SPEED / 2 && this.connections > 1) {
        this.connections--;
        console.log(`Decreasing connections to ${this.connections} for download ${this.id}`);
      }
    }
  }

  /**
   * Checks if all segments are finished (completed or error) and updates task status.
   */
  private checkOverallCompletion(): void {
    const allSegmentsFinished = this.segments.every(
      s => s.status === DownloadStatus.COMPLETED || s.status === DownloadStatus.ERROR
    );

    if (allSegmentsFinished) {
      const hasErrors = this.segments.some(s => s.status === DownloadStatus.ERROR);
      if (hasErrors) {
        this.handleError(new Error('Download failed due to segment errors.'));
      } else {
        // This case should ideally be handled by finalizeDownload, but adding a check here.
        console.log('All segments appear completed, attempting finalization.');
        this.finalizeDownload(); 
      }
    }
  }
} 