import React, { useState, useEffect, useCallback } from 'react';
import { DownloadItem, DownloadStatus, AppSettings, DownloadOptions } from '../common/types';
import { DownloadList } from './components/DownloadList';
import { DownloadForm } from './components/DownloadForm';
import { DownloadConfirmDialog } from './components/DownloadConfirmDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useTranslation } from 'react-i18next';
import { FiDownload, FiSettings, FiGlobe } from 'react-icons/fi';

// Extend the Window interface to include the electron property injected by preload
declare global {
    interface Window {
        electron: {
            // 1. ipcRenderer methods
            ipcRenderer: {
                send(channel: string, ...args: any[]): void;
                on(channel: string, func: (...args: any[]) => void): () => void; 
                invoke(channel: string, ...args: any[]): Promise<any>;
                removeAllListeners(channel: string): void;
            };
            // 2. Other top-level functions exposed by preload.ts
            addDownload: (url: string, options?: any) => Promise<any>; // Adjust types if needed
            createNewDownload: (url: string, options?: any) => Promise<any>;
            pauseDownload: (id: string) => Promise<void>;
            resumeDownload: (id: string) => Promise<void>;
            cancelDownload: (id: string) => Promise<void>;
            removeDownload: (id: string) => Promise<void>;
            selectFolder: () => Promise<{ canceled: boolean, filePaths: string[] }>;
            selectFolderForSettings: () => Promise<{ filePath: string | null }>;
            openFile: (id: string) => Promise<boolean>; // Matches return type in main.ts
            showInFolder: (id: string) => Promise<boolean>; // Matches return type in main.ts
            getCategories: () => Promise<string[]>;
            addCategory: (category: string) => Promise<void>;
            getDefaultPathForCategory: (category: string) => Promise<string>;
            savePathForCategory: (category: string, path: string) => Promise<void>;
            getSettings: () => Promise<AppSettings | null>;
            saveSettings: (settings: any) => Promise<{success: boolean, settings?: AppSettings, error?: string}>;
            validatePath: (pathString: string) => Promise<{ isValid: boolean, error?: string }>;
            // Add any other functions exposed by preload.ts
        };
    }
}

// Define types for dialog data
interface ConfirmDialogData {
  url: string;
  options: DownloadOptions; // Use the imported type
  fileExists: boolean;
  partialFileExists: boolean;
}

interface DuplicateDialogData {
  newUrl: string;
  newOptions: DownloadOptions; // Use the imported type
  existingDownload: Partial<DownloadItem>; // Use Partial as not all fields might be sent
}

function App() {
  const { t, i18n } = useTranslation();
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [showConfirmDialog, setShowConfirmDialog] = useState<boolean>(false);
  const [confirmDialogData, setConfirmDialogData] = useState<ConfirmDialogData | null>(null);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState<boolean>(false);
  const [duplicateDialogData, setDuplicateDialogData] = useState<DuplicateDialogData | null>(null);
  const [showSettingsDialog, setShowSettingsDialog] = useState<boolean>(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [showLanguageMenu, setShowLanguageMenu] = useState<boolean>(false);

  // Update document direction based on language
  useEffect(() => {
    document.documentElement.dir = i18n.language === 'ar' ? 'rtl' : 'ltr';
  }, [i18n.language]);

  // Load initial data and set up IPC listeners
  useEffect(() => {
    console.log("[App useEffect] Setting up IPC listeners...");

    // Signal that the renderer is ready
    window.electron.ipcRenderer.send('renderer-ready');

    // Listener for loaded downloads
    const handleDownloadsLoaded = (loadedDownloads: DownloadItem[]) => {
      console.log("[App useEffect] Received 'downloads-loaded' event.");
      console.log("[App useEffect] Raw loaded downloads data:", JSON.stringify(loadedDownloads, null, 2)); // Log raw data
      setDownloads(prevDownloads => {
        console.log("[App useEffect] Updating downloads state. Previous count:", prevDownloads.length, "New count:", loadedDownloads.length);
        // Simple replacement for now, might need merging logic later if needed
        return Array.isArray(loadedDownloads) ? loadedDownloads : []; // Ensure it's an array
      });
      console.log("[App useEffect] Finished updating downloads state after 'downloads-loaded'.");
    };
    const removeDownloadsLoadedListener = window.electron.ipcRenderer.on('downloads-loaded', handleDownloadsLoaded);

    // Listener for download progress updates
    const handleDownloadProgress = (progressUpdate: DownloadItem) => {
      setDownloads(prev => prev.map(d => d.id === progressUpdate.id ? { ...d, ...progressUpdate } : d));
      if (progressUpdate.status === DownloadStatus.ERROR) {
        toast.error(`${t('downloadStatus.error')}: ${progressUpdate.filename} - ${progressUpdate.error || t('downloadItem.unknown')}`);
      }
    };
    const removeDownloadProgressListener = window.electron.ipcRenderer.on('download-progress', handleDownloadProgress);

    // Listener for download removed
    const handleDownloadRemoved = (removedId: string) => {
      setDownloads(prevDownloads => prevDownloads.filter(d => d.id !== removedId));
    };
    const removeDownloadRemovedListener = window.electron.ipcRenderer.on('download-removed', handleDownloadRemoved);

    // Listener for show download confirm dialog
    const handleShowConfirm = (data: ConfirmDialogData) => {
      setConfirmDialogData(data as ConfirmDialogData);
      setShowConfirmDialog(true);
      setShowDuplicateDialog(false);
    };
    const removeShowConfirmListener = window.electron.ipcRenderer.on('show-download-confirm-dialog', handleShowConfirm);

    // Listener for download duplicate found
    const handleDuplicateFound = (data: DuplicateDialogData) => {
      setDuplicateDialogData(data as DuplicateDialogData);
      setShowDuplicateDialog(true);
      setShowConfirmDialog(false);
    };
    const removeDuplicateFoundListener = window.electron.ipcRenderer.on('download-duplicate-found', handleDuplicateFound);

    // Listener for settings updated
    const handleSettingsUpdated = (updatedSettings: AppSettings) => {
      setSettings(updatedSettings);
    };
    const removeSettingsUpdatedListener = window.electron.ipcRenderer.on('settings-updated', handleSettingsUpdated);

    // Initial fetch for settings (keep this logic)
    window.electron.ipcRenderer.invoke('get-settings').then((initialSettings) => {
      if (!initialSettings) {
        console.error("Failed to fetch initial settings");
        // Handle error, maybe set default settings for UI
        setSettings({ defaultDownloadPath: '', maxConcurrentDownloads: 3, language: 'en' }); // Add language default
      }
    });

    // Cleanup function
    return () => {
      console.log("[App useEffect] Cleaning up IPC listeners...");
      // Use the specific remover functions returned by .on()
      removeDownloadsLoadedListener();
      removeDownloadProgressListener();
      removeDownloadRemovedListener();
      removeShowConfirmListener();
      removeDuplicateFoundListener();
      removeSettingsUpdatedListener();
      
      // Alternative: remove all for specific channels if preferred, but less safe if multiple listeners exist
      // window.electron.ipcRenderer.removeAllListeners('downloads-loaded');
      // window.electron.ipcRenderer.removeAllListeners('download-progress');
      // ... etc
    };
  }, []);

  // Effect to log state changes (for debugging)
  useEffect(() => {
    console.log("[App State Debug] Downloads state changed:", JSON.stringify(downloads, null, 2));
  }, [downloads]);

  // --- Download Action Handlers --- 

  const handleAddDownload = useCallback(async (url: string, options?: DownloadOptions) => {
    try {
      const result = await window.electron.ipcRenderer.invoke('create-new-download', url, options);
      if (result?.error) {
         console.error("Error during initial download check:", result.error);
         toast.error(`${t('downloadForm.adding')} ${result.error}`);
      }
    } catch (error) {
      console.error('Error invoking create-new-download:', error);
      toast.error(`${t('downloadForm.adding')}: ${error.message || t('downloadItem.unknown')}`);
    }
  }, [t]);

  const handleDownloadConfirm = useCallback(async (confirmOptions: {
    category: string;
    savePath: string;
    description: string;
    startPaused: boolean;
  }) => {
    if (!confirmDialogData) return;
    setShowConfirmDialog(false);
    
    const urlToDownload = confirmDialogData.url;
    const finalOptions: DownloadOptions = {
      ...confirmDialogData.options,
      category: confirmOptions.category,
      savePath: confirmOptions.savePath,
      description: confirmOptions.description,
      startPaused: confirmOptions.startPaused,
      customFilename: confirmOptions.savePath ? confirmOptions.savePath.split(/[\\/]/).pop() : confirmDialogData.options?.customFilename
    };

    try {
      const result = await window.electron.ipcRenderer.invoke('confirm-and-create-download', urlToDownload, finalOptions);
      if (result && result.id && !result.error) {
          const newDownloadItem: DownloadItem = {
              ...result,
              progress: 0,
              speed: 0,
              size: 0,
              downloaded: 0,
              eta: 0,
              createdAt: new Date(),
              segments: [],
              options: finalOptions
          };
          setDownloads(prev => [...prev, newDownloadItem]);
      } else if (result?.error) {
          console.error("Error starting confirmed download:", result.error);
          toast.error(`${t('general.startDownload')}: ${result.error}`);
      }
    } catch (error) {
      console.error('Error invoking confirm-and-create-download:', error);
      toast.error(`${t('general.startDownload')}: ${error.message || t('downloadItem.unknown')}`);
    }
    setConfirmDialogData(null);
  }, [confirmDialogData, t]);

  const handleOverwriteDownload = useCallback(async () => {
    if (!duplicateDialogData) return;
    setShowDuplicateDialog(false);
    const { newUrl, newOptions } = duplicateDialogData;
    try {
        const result = await window.electron.ipcRenderer.invoke('overwrite-and-create-download', newUrl, newOptions);
        if (result && result.id && !result.error) {
            const newDownloadItem: DownloadItem = {
              ...result,
              progress: 0,
              speed: 0,
              size: 0,
              downloaded: 0,
              eta: 0,
              createdAt: new Date(),
              segments: [],
              options: newOptions
            };
            setDownloads(prev => [...prev, newDownloadItem]);
        } else if (result?.error) {
            console.error("Error starting overwritten download:", result.error);
            toast.error(`${t('general.cancelOldStartNew')}: ${result.error}`);
        }
    } catch (error) {
        console.error('Error invoking overwrite-and-create-download:', error);
        toast.error(`${t('general.cancelOldStartNew')}: ${error.message || t('downloadItem.unknown')}`);
    }
    setDuplicateDialogData(null);
  }, [duplicateDialogData, t]);

  const handleResumeDownload = useCallback(async () => {
    if (!duplicateDialogData?.existingDownload?.id) return;
    setShowDuplicateDialog(false);

    try {
        await window.electron.ipcRenderer.invoke('resume-download', duplicateDialogData.existingDownload.id);
    } catch (error) {
        console.error('Error invoking resume-download:', error);
        toast.error(`${t('general.resume')}: ${error.message || t('downloadItem.unknown')}`);
    }
    setDuplicateDialogData(null);
  }, [duplicateDialogData, t]);

  const handleCancelConfirm = useCallback(() => {
    setShowConfirmDialog(false);
    setConfirmDialogData(null);
  }, []);
  
  const handleCancelDuplicate = useCallback(() => {
    setShowDuplicateDialog(false);
    setDuplicateDialogData(null);
  }, []);

  const handleAction = useCallback(async (id: string, action: string) => {
    try {
      switch (action) {
        case 'pause':
          await window.electron.ipcRenderer.invoke('pause-download', id);
          break;
        case 'resume':
          await window.electron.ipcRenderer.invoke('resume-download', id);
          break;
        case 'cancel':
          setDownloads(prev => prev.filter(d => d.id !== id));
          await window.electron.ipcRenderer.invoke('cancel-download', id);
          break;
        case 'remove':
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
        toast.error(`${action}: ${error.message || t('downloadItem.unknown')}`);
    }
  }, [t]);

  // Settings Handlers
  const handleOpenSettings = () => {
    window.electron.ipcRenderer.invoke('get-settings').then((currentSettings) => {
        if(currentSettings) setSettings(currentSettings);
        setShowSettingsDialog(true); 
    });
  };
  const handleCloseSettings = () => { setShowSettingsDialog(false); };
  const handleSaveSettings = async (newSettings: AppSettings) => {
    let saveSucceeded = false;
    try {
        const result = await window.electron.ipcRenderer.invoke('save-settings', newSettings);
        if(result?.success && result?.settings) {
            setSettings(result.settings);
            toast.success(t('settings.saveSuccess')); 
            saveSucceeded = true;
        } else {
            const errorMsg = result?.error || t('settings.saveFailed');
            console.error("Failed to save settings:", errorMsg);
            toast.error(`${t('settings.saveFailed')}: ${errorMsg}`); 
        }
    } catch (error) {
        const errorMsg = error.message || t('downloadItem.unknown');
        console.error('Error invoking save-settings:', error);
        toast.error(`${t('settings.saveFailed')}: ${errorMsg}`); 
    }
    
    if (saveSucceeded) {
        setShowSettingsDialog(false);
    }
  };

  // Language Handlers
  const handleChangeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    setShowLanguageMenu(false);
    toast.success(t('settings.languageChanged'));
  };

  return (
    <div className="app-container">
      <ToastContainer 
        position="bottom-right" 
        autoClose={5000} 
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={i18n.language === 'ar'}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />
      <header className="header">
        <div className="header-title">
          <FiDownload /> {t('app.title')}
        </div>
        <div className="header-actions">
          <div className="language-selector" style={{ position: 'relative' }}>
            <button 
              className={`language-button ${showLanguageMenu ? 'active' : ''}`}
              onClick={() => {
                console.log('Language button clicked, toggling menu:', !showLanguageMenu);
                setShowLanguageMenu(!showLanguageMenu);
              }}
              aria-label={t('settings.language')}
            >
              <FiGlobe />
            </button>
          </div>
          <button 
            onClick={handleOpenSettings} 
            className="settings-button"
            aria-label={t('general.settings')}
          >
            <FiSettings />
          </button>
          
          {/* Language Dialog */}
          {showLanguageMenu && (
            <div className="dialog-overlay" onClick={() => setShowLanguageMenu(false)}>
              <div className="dialog language-dialog" onClick={e => e.stopPropagation()}>
                <h2>{t('settings.language')}</h2>
                <div className="language-options">
                  <button 
                    onClick={() => handleChangeLanguage('en')} 
                    className={`language-option-btn ${i18n.language === 'en' ? 'active' : ''}`}
                  >
                    <span className="language-name">English</span>
                    {i18n.language === 'en' && <span className="language-active-indicator">✓</span>}
                  </button>
                  
                  <button 
                    onClick={() => handleChangeLanguage('fr')} 
                    className={`language-option-btn ${i18n.language === 'fr' ? 'active' : ''}`}
                  >
                    <span className="language-name">Français</span>
                    {i18n.language === 'fr' && <span className="language-active-indicator">✓</span>}
                  </button>
                  
                  <button 
                    onClick={() => handleChangeLanguage('ar')} 
                    className={`language-option-btn ${i18n.language === 'ar' ? 'active' : ''}`}
                  >
                    <span className="language-name">العربية</span>
                    {i18n.language === 'ar' && <span className="language-active-indicator">✓</span>}
                  </button>
                </div>
                <div className="dialog-buttons">
                  <button 
                    onClick={() => setShowLanguageMenu(false)}
                    className="btn btn-secondary"
                  >
                    {t('general.close')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>
      <main className="content-wrapper">
        <DownloadForm onAddDownload={handleAddDownload} />
        {downloads.length === 0 ? (
          <div className="empty-state">
            <FiDownload />
            <h3>{t('downloadList.empty.title')}</h3>
            <p>{t('downloadList.empty.message')}</p>
          </div>
        ) : (
          <DownloadList 
            downloads={downloads} 
            onAction={handleAction} 
          />
        )}
      </main>

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
          newOptions={confirmDialogData.options}
        />
      )}

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

      {showSettingsDialog && settings && (
        <SettingsDialog
          isOpen={showSettingsDialog}
          currentSettings={settings}
          onSave={handleSaveSettings}
          onClose={handleCloseSettings}
        />
      )}

    </div>
  );
}

export default App; 