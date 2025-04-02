import React, { useState, useEffect, useCallback } from 'react';
import { DownloadItem, DownloadStatus, AppSettings, DownloadOptions } from '../../common/types';
import { DownloadList } from './DownloadList';
import { DownloadForm } from './DownloadForm'; 
import { DownloadConfirmDialog } from './DownloadConfirmDialog'; 
import '../App.css';

// Extend the Window interface
// --- REMOVED Incomplete Global Declaration --- 
// declare global {
//     interface Window {
//         electron: {
//             ipcRenderer: {
//                 send(channel: string, ...args: any[]): void;
//                 on(channel: string, func: (...args: any[]) => void): () => void;
//                 invoke(channel: string, ...args: any[]): Promise<any>;
//                 removeAllListeners(channel: string): void;
//             };
//         };
//     }
// }

// Define types for dialog data
interface ConfirmDialogData {
  url: string;
  options: DownloadOptions;
  fileExists: boolean;
  partialFileExists: boolean;
}

interface DuplicateDialogData {
  newUrl: string;
  newOptions: DownloadOptions;
  existingDownload: Partial<DownloadItem>;
}

function App() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [showConfirmDialog, setShowConfirmDialog] = useState<boolean>(false);
  const [confirmDialogData, setConfirmDialogData] = useState<ConfirmDialogData | null>(null);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState<boolean>(false);
  const [duplicateDialogData, setDuplicateDialogData] = useState<DuplicateDialogData | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  // --- IPC Event Handlers --- 
  useEffect(() => {
    window.electron.ipcRenderer.send('renderer-ready');
    window.electron.ipcRenderer.invoke('get-settings').then(setSettings);

    const listeners = [
      window.electron.ipcRenderer.on('downloads-loaded', (loadedDownloads) => {
        console.log('Received initial downloads list:', loadedDownloads);
        setDownloads(Array.isArray(loadedDownloads) ? loadedDownloads : []);
      }),
      window.electron.ipcRenderer.on('download-progress', (updatedDownload) => {
        setDownloads(prev => prev.map(d => d.id === updatedDownload.id ? { ...d, ...updatedDownload } : d));
      }),
      window.electron.ipcRenderer.on('download-removed', (removedId) => {
        console.log(`Received download removal signal for ID: ${removedId}`);
        setDownloads(prev => prev.filter(d => d.id !== removedId));
      }),
      window.electron.ipcRenderer.on('show-download-confirm-dialog', (data) => {
        console.log('Received show-download-confirm-dialog:', data);
        setConfirmDialogData(data as ConfirmDialogData);
        setShowConfirmDialog(true);
        setShowDuplicateDialog(false); 
      }),
      window.electron.ipcRenderer.on('download-duplicate-found', (data) => {
        console.log('Received download-duplicate-found:', data);
        setDuplicateDialogData(data as DuplicateDialogData);
        setShowDuplicateDialog(true);
        setShowConfirmDialog(false); 
      }),
      window.electron.ipcRenderer.on('settings-updated', (updatedSettings) => {
         console.log('Received settings update:', updatedSettings);
         setSettings(updatedSettings);
      })
    ];

    return () => { listeners.forEach(remove => remove()); };
  }, []);

  // --- Download Action Handlers --- 

  const handleAddDownload = useCallback(async (url: string, options?: DownloadOptions) => {
    console.log('handleAddDownload called with:', url, options);
    try {
      const result = await window.electron.ipcRenderer.invoke('create-new-download', url, options);
      console.log('create-new-download invoke result:', result);
      if (result?.error) console.error("Error during initial download check:", result.error);
    } catch (error) { console.error('Error invoking create-new-download:', error); }
  }, []);

  // Updated handler for standard confirmation dialog
  const handleDownloadConfirm = useCallback(async (confirmOptions: {
    category: string;
    savePath: string;
    description: string;
    startPaused: boolean;
  }) => {
    if (!confirmDialogData) return;
    console.log(`Confirming download with options:`, confirmOptions);
    setShowConfirmDialog(false);
    
    // Combine original options with confirmed details
    const finalOptions: DownloadOptions = {
      ...confirmDialogData.options,
      category: confirmOptions.category,
      savePath: confirmOptions.savePath,
      description: confirmOptions.description,
      startPaused: confirmOptions.startPaused,
      customFilename: confirmOptions.savePath ? confirmOptions.savePath.split(/[\\/]/).pop() : confirmDialogData.options?.customFilename // Extract filename from full path
    };

    try {
      const result = await window.electron.ipcRenderer.invoke('confirm-and-create-download', confirmDialogData.url, finalOptions);
      console.log('confirm-and-create-download invoke result:', result);
      if (result?.error) {
          console.error("Error starting confirmed download:", result.error);
      }
    } catch (error) {
      console.error('Error invoking confirm-and-create-download:', error);
    }
    setConfirmDialogData(null); // Clear data after handling
  }, [confirmDialogData]);

  // Handlers for the duplicate dialog
  const handleOverwriteDownload = useCallback(async () => {
    if (!duplicateDialogData) return;
    console.log('Overwrite confirmed for duplicate.');
    setShowDuplicateDialog(false);
    try {
        const result = await window.electron.ipcRenderer.invoke('overwrite-and-create-download', duplicateDialogData.newUrl, duplicateDialogData.newOptions);
        if (result?.error) console.error("Error starting overwritten download:", result.error);
    } catch (error) { console.error('Error invoking overwrite-and-create-download:', error); }
    setDuplicateDialogData(null);
  }, [duplicateDialogData]);

  const handleResumeDownload = useCallback(async () => {
    if (!duplicateDialogData?.existingDownload?.id) return;
    const existingId = duplicateDialogData.existingDownload.id;
    console.log(`Resuming existing download ID: ${existingId}`);
    setShowDuplicateDialog(false);
    try {
        await window.electron.ipcRenderer.invoke('resume-download', existingId);
    } catch (error) { console.error('Error invoking resume-download:', error); }
    setDuplicateDialogData(null);
  }, [duplicateDialogData]);

  // Cancel handlers
  const handleCancelConfirm = useCallback(() => { setShowConfirmDialog(false); setConfirmDialogData(null); }, []);
  const handleCancelDuplicate = useCallback(() => { setShowDuplicateDialog(false); setDuplicateDialogData(null); }, []);

  // Consolidated action handler for DownloadList
  const handleAction = useCallback(async (id: string, action: string) => {
    console.log(`Action requested: ${action} for ID: ${id}`);
    try {
      switch (action) {
        case 'pause':
          await window.electron.ipcRenderer.invoke('pause-download', id);
          break;
        case 'resume':
          await window.electron.ipcRenderer.invoke('resume-download', id);
          break;
        case 'cancel':
          // Optimistic UI update + IPC call
          setDownloads(prev => prev.filter(d => d.id !== id));
          await window.electron.ipcRenderer.invoke('cancel-download', id);
          break;
        case 'remove':
           // Optimistic UI update + IPC call
          setDownloads(prev => prev.filter(d => d.id !== id));
          await window.electron.ipcRenderer.invoke('remove-download', id);
          break;
        case 'openFile':
          await window.electron.ipcRenderer.invoke('open-file', id);
          break;
        case 'openFolder':
          await window.electron.ipcRenderer.invoke('open-folder', id);
          break;
        default:
          console.warn(`Unknown action type: ${action}`);
      }
    } catch (error) {
        console.error(`Error invoking action '${action}' for ID ${id}:`, error);
        // Maybe revert optimistic updates here if needed
    }
  }, []);

  // --- Render ---
  return (
    <div className="App">
      <header className="App-header">
        <h1>Catchy Download Manager</h1>
      </header>
      <main className="App-main">
        <DownloadForm onAddDownload={handleAddDownload} />
        <DownloadList 
          downloads={downloads} 
          onAction={handleAction} 
        />
      </main>

      {/* Standard Confirmation Dialog */}
      {showConfirmDialog && confirmDialogData && (
        <DownloadConfirmDialog
          isOpen={showConfirmDialog}
          downloadInfo={{
              url: confirmDialogData.url,
              filename: confirmDialogData.options?.customFilename,
          }}
          fileExists={confirmDialogData.fileExists}
          partialFileExists={confirmDialogData.partialFileExists}
          onConfirm={handleDownloadConfirm} 
          onCancel={handleCancelConfirm}
          isDuplicateDialog={false}
          newOptions={confirmDialogData.options} // Pass options for dialog init
        />
      )}

      {/* Duplicate Download Dialog */}
      {showDuplicateDialog && duplicateDialogData && (
         <DownloadConfirmDialog
          isOpen={showDuplicateDialog}
          isDuplicateDialog={true} 
          existingDownload={duplicateDialogData.existingDownload}
          newOptions={duplicateDialogData.newOptions}
          onConfirmOverwrite={handleOverwriteDownload} 
          onConfirmResume={handleResumeDownload} 
          onCancel={handleCancelDuplicate}
        />
      )}

    </div>
  );
}

export default App;
