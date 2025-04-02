import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import { DownloadManager } from './downloadManager';
import { DownloadOptions, AppSettings } from '../common/types';
import * as http from 'http';
import * as url from 'url';
import Store from 'electron-store';
import * as fs from 'fs';
import fsPromises from 'node:fs'; // Import fsPromises

// Define the schema matching AppSettings and other stored data
interface StoreSchema {
    // Make properties optional if they might not exist initially or rely on defaults
    defaultDownloadPath?: string; 
    maxConcurrentDownloads?: number; 
    language?: string; // Add language property
    categories?: string[]; // Keep optional if using defaults
    categoryPaths?: Record<string, string>; // Keep optional if using defaults
}

// Keep store initialized globally for now
const store = new Store<StoreSchema>({
    defaults: {
        categories: ['General'],
        categoryPaths: {}
    }
});

// --- Global References --- 
let mainWindow: BrowserWindow | null = null;
let downloadManager: DownloadManager;

// --- Simple File Logger ---
const logFilePath = path.join(app.getPath('userData'), 'catchy-startup-log.txt');
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
const logToFile = (message: string, ...optionalParams: any[]) => {
  const timestamp = new Date().toISOString();
  const formattedMessage = `${timestamp} - ${message} ${optionalParams.map(p => JSON.stringify(p)).join(' ')}\n`;
  console.log(message, ...optionalParams); // Log to console too
  logStream.write(formattedMessage);
};
logToFile('--- Application Starting --- ');
logToFile('app.getAppPath():', app.getAppPath()); // <-- Log app path
// ------------------------

function createWindow() {
  logToFile('createWindow: Creating BrowserWindow...');
  
  const preloadPath = path.join(__dirname, 'preload.js'); 
  logToFile('createWindow: Calculated preload path (using __dirname):', preloadPath);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
      webSecurity: false
    }
  });
  logToFile('createWindow: BrowserWindow created.');

  const htmlPath = path.join(__dirname, 'renderer/index.html'); 
  const htmlUrl = url.format({
      pathname: htmlPath,
      protocol: 'file:',
      slashes: true
  });
  logToFile('createWindow: Loading URL (standard pathing):', htmlUrl); 
  mainWindow.loadURL(htmlUrl);
  
  // Open DevTools only if in development (not packaged)
  if (!app.isPackaged) { 
    logToFile('createWindow: Opening DevTools (not packaged).');
    mainWindow.webContents.openDevTools(); 
  }

  mainWindow.on('closed', () => {
    logToFile('createWindow: Main window closed event.');
    mainWindow = null;
  });
  logToFile('createWindow: Finished setup.');
}

// Create HTTP server for browser extension
const SERVER_PORT = 43210;
let httpServer: http.Server | null = null;

function createHttpServer(port: number) {
  try {
    httpServer = http.createServer((req, res) => {
      // Set CORS headers for all responses
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      
      // Parse URL
      const parsedUrl = url.parse(req.url);
      
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });

        req.on('end', async () => {
          try {
            const requestData = JSON.parse(body);

            // Handle different endpoints
            switch (parsedUrl.pathname) {
              case '/download':
                handleDownloadRequest(requestData, res);
                break;

              case '/showFileDialog':
                try {
                  const { dialog } = require('electron');
                  const result = await dialog.showSaveDialog(mainWindow, {
                    defaultPath: requestData.currentPath || '',
                    properties: ['showOverwriteConfirmation'],
                    filters: [
                      { name: 'All Files', extensions: ['*'] }
                    ]
                  });

                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({
                    path: result.canceled ? null : result.filePath
                  }));
                } catch (error) {
                  console.error('Error showing file dialog:', error);
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Failed to show file dialog' }));
                }
                break;

              case '/checkFile':
                try {
                  const fs = require('fs');
                  const filePath = requestData.filePath;
                  const exists = await new Promise(resolve => {
                    fs.access(filePath, fs.constants.F_OK, (err) => {
                      resolve(!err);
                    });
                  });
                  
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ exists }));
                } catch (error) {
                  console.error('Error checking file:', error);
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Failed to check file' }));
                }
                break;

              default:
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Not found' }));
            }
          } catch (error) {
            console.error('Error processing request:', error);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Invalid request' }));
          }
        });
      } else {
        // Handle unsupported methods
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    httpServer.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`Port ${port} is already in use, trying port ${port + 1}`);
        // Try the next port
        createHttpServer(port + 1);
      } else {
        console.error('[HTTP Server] Error:', err);
      }
    });
    
    httpServer.listen(port, () => {
      console.log(`[HTTP Server] === Successfully listening for extension connections at http://localhost:${port} ===`);
    });
  } catch (error) {
    console.error('[HTTP Server] Failed to create/start server:', error);
  }
}

// Helper function to handle download requests from the HTTP server (extension)
async function handleDownloadRequest(requestData: any, res: http.ServerResponse) {
  const downloadUrl = requestData.url;
  const filename = requestData.filename || downloadUrl.split('/').pop() || 'unknown_file';
  // const fileSize = requestData.fileSize || 0; // fileSize isn't used in the check logic
  
  console.log('[HTTP Server] Received download request from extension:', { url: downloadUrl, filename });

  if (!mainWindow || mainWindow.isDestroyed()) {
    console.error('[HTTP Server] Main window not available to handle download request.');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Main window not available',
      message: 'Could not process download request.'
    }));
    return;
  }

  // --- Centralized Check Logic --- 
  // Directly perform the check logic similar to 'create-new-download' IPC handler
  try {
    const initialOptions: DownloadOptions = { customFilename: filename }; // Pass filename
    console.log(`[HTTP Server] Checking for existing download for URL: ${downloadUrl}`);
    const existingDownload = downloadManager.findDownloadByUrl(downloadUrl);

    if (existingDownload) {
        console.log(`[HTTP Server] Found existing download (ID: ${existingDownload.id}). Sending 'download-duplicate-found' to renderer.`);
        // Send duplicate found event
        mainWindow.webContents.send('download-duplicate-found', {
            newUrl: downloadUrl,
            newOptions: initialOptions, // Pass minimal options from extension
            existingDownload: { // Send relevant details
                id: existingDownload.id,
                filename: existingDownload.filename,
                status: existingDownload.status,
                progress: existingDownload.progress,
                size: existingDownload.size,
                downloaded: existingDownload.downloaded
            }
        });
    } else {
        console.log(`[HTTP Server] No existing download found. Sending 'show-download-confirm-dialog' to renderer.`);
        // Send standard confirm dialog event
        // Note: We don't check file existence here yet, dialog can handle that if needed
        mainWindow.webContents.send('show-download-confirm-dialog', {
            url: downloadUrl,
            options: initialOptions, // Pass minimal options from extension
            fileExists: false, // Default to false, main process check could be added later if needed
            partialFileExists: false // Default to false
        });
    }

    // Respond quickly to the extension - Request is being processed
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Download request received by Catchy app.'
    }));

  } catch (error) {
    console.error('[HTTP Server] Error during download check:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Internal server error during download check',
      message: 'Could not process download request.'
    }));
  }
}

// Initialize App
app.whenReady().then(async () => {
  logToFile('app.whenReady: Starting initialization...');
  try {
    // Store is already initialized globally
    logToFile('app.whenReady: Verified global store instance.');

    // --- 1. CREATE WINDOW --- 
    createWindow();
    if (!mainWindow) {
        throw new Error("Failed to create main window.");
    }
    logToFile('app.whenReady: Main window created.');
    
    // --- 2. INITIALIZE MANAGER --- 
    downloadManager = new DownloadManager(mainWindow);
    logToFile('app.whenReady: DownloadManager initialized.');

    // --- 3. SETUP HANDLERS --- 
    setupIpcHandlers(store);
    logToFile('app.whenReady: IPC handler setup initiated.'); 
    
    // --- 4. START HTTP SERVER --- 
    createHttpServer(SERVER_PORT);
    logToFile('app.whenReady: HTTP Server started.');

    logToFile('app.whenReady: === Initialization sequence complete. ===');

  } catch (error: any) { // <-- Catch error
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : 'No stack trace available';
      logToFile('app.whenReady: XXX CRITICAL ERROR DURING STARTUP XXX:', errorMessage, errorStack); 
      dialog.showErrorBox('Application Startup Error', 
          `Failed to start the application:\n\n${errorMessage}\n\nStack Trace:\n${errorStack}\n\nPlease check the log file at: ${logFilePath}`
      ); // <-- Show error dialog
      app.quit(); // Quit if startup fails critically
  }
});

// Modify setupIpcHandlers definition to accept store
function setupIpcHandlers(storeInstance: Store<StoreSchema>) {
  const { dialog } = require('electron');
  const { shell } = require('electron');
  console.log('[IPC Setup] Required electron modules.');

  ipcMain.on('renderer-ready', () => {
    downloadManager.setRendererReady();
  });
  console.log('[IPC Setup] Registered handler for: renderer-ready');

  // --- Settings Handlers ---
  ipcMain.handle('get-settings', async (event): Promise<AppSettings> => {
    try {
        // Using store.get with defaults - casting to any for diagnosis
        const settings: AppSettings = {
            defaultDownloadPath: (storeInstance as any).get('defaultDownloadPath', app.getPath('downloads')), 
            maxConcurrentDownloads: (storeInstance as any).get('maxConcurrentDownloads', 3),
            language: (storeInstance as any).get('language', 'en'), // Default to English 
        };
        return settings;
    } catch (error) {
        console.error('[IPC get-settings] Error retrieving settings:', error);
        // Return defaults on error
        return { 
            defaultDownloadPath: app.getPath('downloads'),
            maxConcurrentDownloads: 3,
            language: 'en'
        };
    }
  });
  console.log('[IPC Setup] Registered handler for: get-settings');

  ipcMain.handle('save-settings', async (event, settingsToSave: Partial<AppSettings>) => {
    try {
        // Using store.set - casting to any for diagnosis
        if (settingsToSave.defaultDownloadPath !== undefined) {
            (storeInstance as any).set('defaultDownloadPath', settingsToSave.defaultDownloadPath);
        }
        if (settingsToSave.maxConcurrentDownloads !== undefined) {
            (storeInstance as any).set('maxConcurrentDownloads', settingsToSave.maxConcurrentDownloads);
        }
        if (settingsToSave.language !== undefined) {
            (storeInstance as any).set('language', settingsToSave.language);
        }
        // Return the potentially updated settings
        const currentSettings: AppSettings = {
             defaultDownloadPath: (storeInstance as any).get('defaultDownloadPath', app.getPath('downloads')),
             maxConcurrentDownloads: (storeInstance as any).get('maxConcurrentDownloads', 3),
             language: (storeInstance as any).get('language', 'en')
        };
        return { success: true, settings: currentSettings };
    } catch (error) {
        console.error('[IPC save-settings] Error saving settings:', error);
        return { success: false, error: error.message };
    }
  });
  console.log('[IPC Setup] Registered handler for: save-settings');

  // --- Existing Download Handlers ---
  ipcMain.handle('add-download', async (event, url, options) => {
    console.log('[IPC add-download] Deprecated handler called.'); 
    // This handler is likely deprecated by the new create/confirm flow
    // Consider removing or refactoring if it's no longer used directly by App.tsx
    // For now, just log it.
    return { warning: 'Deprecated add-download handler called.' };
    // try {
    //     const result = await downloadManager.addDownload(url, options);
    //     return result;
    // } catch (error) {
    //     console.error('[IPC add-download] Error:', error);
    //     throw error; // Re-throw to be caught by invoke
    // }
  });
  console.log('[IPC Setup] Registered handler for: add-download (Deprecated?)');

  // --- New Download Flow Handlers ---
  ipcMain.handle('create-new-download', async (_event, url: string, options?: any) => {
    try {
      return await downloadManager.createNewDownload(url, options);
    } catch (error) {
      console.error('Error in create-new-download handler:', error);
      return { error: error.message || 'Failed to process download request' };
    }
  });
  console.log('[IPC Setup] Registered handler for: create-new-download');

  ipcMain.handle('confirm-and-create-download', async (_event, url: string, options: any) => {
    try {
       // Force new download since user explicitly confirmed
       options.forceNewDownload = true; 
       options.resumeExisting = false; 
       return await downloadManager.createNewDownload(url, options); 
    } catch (error) {
       console.error('Error confirming/creating download:', error);
       return { error: error.message || 'Failed to start confirmed download' };
    }
  });
  console.log('[IPC Setup] Registered handler for: confirm-and-create-download');

  ipcMain.handle('overwrite-and-create-download', async (_event, url: string, options: any) => {
      try {
          options.forceNewDownload = true;
          options.resumeExisting = false;
          // The createNewDownload method should handle removing the old one based on forceNewDownload
          return await downloadManager.createNewDownload(url, options);
      } catch (error) {
          console.error('Error overwriting/creating download:', error);
          return { error: error.message || 'Failed to start overwritten download' };
      }
  });
  console.log('[IPC Setup] Registered handler for: overwrite-and-create-download');

  ipcMain.handle('pause-download', async (_event, id: string) => {
    return downloadManager.pauseDownload(id);
  });
  console.log('[IPC Setup] Registered handler for: pause-download');

  ipcMain.handle('resume-download', async (_event, id: string) => {
    return downloadManager.resumeDownload(id);
  });
  console.log('[IPC Setup] Registered handler for: resume-download');

  ipcMain.handle('cancel-download', async (_event, id: string) => {
    return downloadManager.cancelDownload(id);
  });
  console.log('[IPC Setup] Registered handler for: cancel-download');

  ipcMain.handle('remove-download', async (_event, id: string) => {
    return downloadManager.removeDownload(id); 
  });
  console.log('[IPC Setup] Registered handler for: remove-download');

  // --- File/Folder Handlers ---
  ipcMain.handle('open-file', async (_event, id: string) => {
    return downloadManager.openFile(id);
  });
  console.log('[IPC Setup] Registered handler for: open-file');

  ipcMain.handle('open-folder', async (_event, id: string) => {
    return downloadManager.showInFolder(id);
  });
  console.log('[IPC Setup] Registered handler for: open-folder');
  
  ipcMain.handle('show-in-folder', async (event, id) => {
    try {
      const filePath = downloadManager.getDownloadPath(id);
      if (!filePath) {
        throw new Error('File path not found');
      }
      
      await shell.showItemInFolder(filePath);
      return true;
    } catch (error) {
      console.error('Error showing file in folder:', error);
      throw error;
    }
  });
  console.log('[IPC Setup] Registered handler for: show-in-folder');

  ipcMain.handle('select-folder', async () => {
    if (!mainWindow) {
      throw new Error('Main window is not available');
    }
    
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    
    return result;
  });
  console.log('[IPC Setup] Registered handler for: select-folder');

  // --- Category Handlers ---
  ipcMain.handle('get-categories', async () => {
      return (storeInstance as any).get('categories', ['General']); // Cast to any
  });
  console.log('[IPC Setup] Registered handler for: get-categories');

  ipcMain.handle('add-category', async (event, category: string) => {
      const categories = (storeInstance as any).get('categories', ['General']); // Cast to any
      if (category && !categories.includes(category)) {
          categories.push(category);
          (storeInstance as any).set('categories', categories); // Cast to any
      }
  });
  console.log('[IPC Setup] Registered handler for: add-category');

  ipcMain.handle('get-default-path-for-category', async (event, category: string) => {
      const paths = (storeInstance as any).get('categoryPaths', {}); // Cast to any
      const defaultPath = (storeInstance as any).get('defaultDownloadPath', app.getPath('downloads')); // Cast to any
      return paths[category] || defaultPath; 
  });
  console.log('[IPC Setup] Registered handler for: get-default-path-for-category');

  ipcMain.handle('save-path-for-category', async (event, category: string, path: string) => {
      const paths = (storeInstance as any).get('categoryPaths', {}); // Cast to any
      paths[category] = path;
      (storeInstance as any).set('categoryPaths', paths); // Cast to any
  });
  console.log('[IPC Setup] Registered handler for: save-path-for-category');
  
  // Handler for Settings Dialog Browse button
  ipcMain.handle('select-folder-for-settings', async () => {
    if (!mainWindow) {
      throw new Error('Main window is not available');
    }
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
        console.log('[IPC select-folder-for-settings] Directory selected:', result.filePaths[0]);
        return { filePath: result.filePaths[0] };
    } else {
        console.log('[IPC select-folder-for-settings] Dialog cancelled.');
        return { filePath: null }; // Indicate cancellation or no selection
    }
  });
  console.log('[IPC Setup] Registered handler for: select-folder-for-settings');

  // Handler for validating a path in the Settings Dialog
  ipcMain.handle('validate-path', async (_event, pathString: string): Promise<{ isValid: boolean, error?: string }> => {
    if (!pathString) {
        return { isValid: false, error: 'Path cannot be empty' }; // Or treat empty as valid?
    }
    try {
        console.log(`[IPC validate-path] Validating path: ${pathString}`);
        const stats = await fsPromises.promises.stat(pathString);
        if (stats.isDirectory()) {
            console.log(`[IPC validate-path] Path is a valid directory.`);
            return { isValid: true };
        } else {
             console.log(`[IPC validate-path] Path is not a directory.`);
            return { isValid: false, error: 'Selected path is not a directory' };
        }
    } catch (error: any) {
        console.log(`[IPC validate-path] Error validating path:`, error.code);
        if (error.code === 'ENOENT') {
            return { isValid: false, error: 'Path does not exist' };
        } else if (error.code === 'EACCES') {
            return { isValid: false, error: 'Permission denied to access path' };
        } else {
             return { isValid: false, error: `Validation error: ${error.code || error.message}` };
        }
    }
  });
  console.log('[IPC Setup] Registered handler for: validate-path');

  // --- Handler to show extension files --- 
  ipcMain.handle('show-extension-files', async () => {
    // Get the directory containing app.asar (the resources path)
    const resourcesPath = path.dirname(app.getAppPath());
    // Path where extraResources copies the extension, relative to resourcesPath
    const extensionPath = path.join(resourcesPath, 'extensions/browser-extension'); 
    logToFile('[IPC show-extension-files] Calculated resources path:', resourcesPath);
    logToFile('[IPC show-extension-files] Trying to open extension path:', extensionPath);
    try {
      // Check if the directory exists before trying to open it
      if (fs.existsSync(extensionPath)) {
        await shell.openPath(extensionPath);
        return { success: true };
      } else {
        logToFile('[IPC show-extension-files] Error: Extension path not found:', extensionPath);
        dialog.showErrorBox('Error', `Extension folder not found at: ${extensionPath}`);
        return { success: false, error: 'Extension folder not found.' };
      }
    } catch (error: any) {
      logToFile('[IPC show-extension-files] Error opening path:', error?.message || error);
       dialog.showErrorBox('Error', `Could not open extension folder: ${error?.message || error}`);
      return { success: false, error: error.message };
    }
  });
  logToFile('[IPC Setup] Registered handler for: show-extension-files');

  console.log('[IPC Setup] === All handlers registered. ===');
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
    downloadManager = new DownloadManager(mainWindow);
  }
}); 