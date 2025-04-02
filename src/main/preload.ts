// console.log('--- PRELOAD SCRIPT EXECUTION TEST ---');

// Restore original preload script content
import { contextBridge, ipcRenderer } from 'electron';

console.log('--- Preload script starting execution ---');

contextBridge.exposeInMainWorld('electron', {
    ipcRenderer: {
        send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
        on: (channel: string, func: (...args: any[]) => void) => {
            const subscription = (_event: any, ...args: any[]) => func(...args);
            ipcRenderer.on(channel, subscription);
            // Return a function to remove the listener
            return () => {
                ipcRenderer.removeListener(channel, subscription);
            };
        },
        invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
        removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel)
    },
    sendRendererReady: () => ipcRenderer.send('renderer-ready'),
    // Add wrappers for other events if needed
    onDownloadsLoaded: (callback: (downloads: any[]) => void) => ipcRenderer.on('downloads-loaded', (_event, downloads) => callback(downloads)),
    onDownloadProgress: (callback: (download: any) => void) => ipcRenderer.on('download-progress', (_event, download) => callback(download)),
    onDownloadRemoved: (callback: (id: string) => void) => ipcRenderer.on('download-removed', (_event, id) => callback(id)),
    onShowDownloadConfirmDialog: (callback: (data: any) => void) => ipcRenderer.on('show-download-confirm-dialog', (_event, data) => callback(data)),
    onDownloadDuplicateFound: (callback: (data: any) => void) => ipcRenderer.on('download-duplicate-found', (_event, data) => callback(data)),
    onSettingsUpdated: (callback: (settings: any) => void) => ipcRenderer.on('settings-updated', (_event, settings) => callback(settings)),
    // Add wrappers for invoke calls if desired, or call invoke directly from renderer
    createNewDownload: (url: string, options?: any) => ipcRenderer.invoke('create-new-download', url, options),
    confirmAndCreateDownload: (url: string, options: any) => ipcRenderer.invoke('confirm-and-create-download', url, options),
    overwriteAndCreateDownload: (url: string, options: any) => ipcRenderer.invoke('overwrite-and-create-download', url, options),
    pauseDownload: (id: string) => ipcRenderer.invoke('pause-download', id),
    resumeDownload: (id: string) => ipcRenderer.invoke('resume-download', id),
    cancelDownload: (id: string) => ipcRenderer.invoke('cancel-download', id),
    removeDownload: (id: string) => ipcRenderer.invoke('remove-download', id),
    openFile: (id: string) => ipcRenderer.invoke('open-file', id),
    openFolder: (id: string) => ipcRenderer.invoke('open-folder', id),
    showInFolder: (id: string) => ipcRenderer.invoke('show-in-folder', id),
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    getCategories: () => ipcRenderer.invoke('get-categories'),
    addCategory: (category: string) => ipcRenderer.invoke('add-category', category),
    getDefaultPathForCategory: (category: string) => ipcRenderer.invoke('get-default-path-for-category', category),
    savePathForCategory: (category: string, path: string) => ipcRenderer.invoke('save-path-for-category', category, path),
    selectFolderForSettings: () => ipcRenderer.invoke('select-folder-for-settings'),
    validatePath: (pathString: string) => ipcRenderer.invoke('validate-path', pathString)
});

console.log('--- Preload script finished execution, electron API exposed ---');