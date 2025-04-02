import React, { useState, useEffect } from 'react';
import { DownloadItem, DownloadStatus, DownloadOptions } from '../../common/types';
import './DownloadConfirmDialog.css';
import { useTranslation } from 'react-i18next';
import { 
  FiAlertTriangle, 
  FiInfo, 
  FiFolder, 
  FiPlusCircle, 
  FiDownload, 
  FiPlay,
  FiX,
  FiSave,
  FiClock
} from 'react-icons/fi';

// Standard actions for the default dialog
export type ConfirmAction = 'start' | 'later' | 'cancel';

interface DownloadConfirmDialogProps {
  isOpen: boolean;
  // --- Standard Mode Props ---
  downloadInfo?: { // Optional for duplicate mode
    url: string;
    filename?: string;
    fileSize?: number;
  };
  fileExists?: boolean; // From main process check
  partialFileExists?: boolean; // From main process check
  onConfirm?: (options: { // Optional for duplicate mode
    category: string;
    savePath: string; // Full path
    description: string;
    startPaused: boolean; // Derived from action
  }) => void;
  
  // --- Duplicate Mode Props ---
  isDuplicateDialog?: boolean;
  existingDownload?: Partial<DownloadItem>; // Details of the existing download
  newOptions?: DownloadOptions; // Options for the *new* request (may be needed for context)
  onConfirmOverwrite?: () => void; // Callback for Overwrite option
  onConfirmResume?: () => void; // Callback for Resume option

  // --- Common Prop ---
  onCancel: () => void; // Used by both modes
}

// Helper function to format file size
function formatFileSize(bytes: number): string {
    if (bytes <= 0) return 'Unknown size';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export const DownloadConfirmDialog: React.FC<DownloadConfirmDialogProps> = ({
  isOpen,
  // Standard mode props (now optional)
  downloadInfo,
  fileExists,
  partialFileExists,
  onConfirm,
  // Duplicate mode props
  isDuplicateDialog = false,
  existingDownload,
  newOptions,
  onConfirmOverwrite,
  onConfirmResume,
  // Common prop
  onCancel,
}) => {
  const { t } = useTranslation();
  const [category, setCategory] = useState('General');
  const [saveDirectory, setSaveDirectory] = useState('');
  const [saveFilename, setSaveFilename] = useState('');
  const [description, setDescription] = useState('');
  const [categories, setCategories] = useState<string[]>(['General']);
  const [rememberPath, setRememberPath] = useState(false);

  // --- Effects ---
  useEffect(() => {
    if (isOpen && !isDuplicateDialog && downloadInfo) {
      // Standard dialog initialization
      loadCategories();
      setDescription(newOptions?.description || '');
      setRememberPath(false);
      setSaveFilename(downloadInfo.filename || newOptions?.customFilename || '');
      loadDefaultPath(newOptions?.category || 'General');
    } else if (isOpen && isDuplicateDialog && existingDownload) {
      // Duplicate dialog specific setup (if any needed beyond display)
      setSaveFilename(existingDownload.filename || ''); // Show existing filename maybe?
    }
  }, [isOpen, isDuplicateDialog, downloadInfo, existingDownload, newOptions]); 
  
  useEffect(() => {
    if (isOpen && !isDuplicateDialog) {
        // Reload path if category changes in standard mode
        loadDefaultPath(category);
    }
  }, [category, isOpen, isDuplicateDialog]);

  // --- Data Loading ---
  const loadCategories = async () => {
     try {
      // Use window.electron defined in App.tsx global scope
      const result = await window.electron.ipcRenderer.invoke('get-categories');
      setCategories(result && Array.isArray(result) ? result : ['General']);
      // Set default category if needed
      const currentCategory = newOptions?.category || 'General';
      if (result && !result.includes(currentCategory)) {
        setCategory('General');
      } else {
        setCategory(currentCategory);
      }
    } catch (error) { 
      console.error('Error loading categories:', error); 
      setCategories(['General']); 
    }
  };

  const loadDefaultPath = async (currentCategory: string) => {
     try {
      const defaultDir = await window.electron.ipcRenderer.invoke('get-default-path-for-category', currentCategory);
      setSaveDirectory(defaultDir || '');
    } catch (error) { 
      console.error('Error loading default path:', error); 
      setSaveDirectory(''); 
    } 
  };

  // --- Handlers ---
  const handleAddCategory = async () => {
    const newCategory = prompt(t('confirmDialog.addCategoryPrompt'));
    if (newCategory && newCategory.trim()) {
      try {
        await window.electron.ipcRenderer.invoke('add-category', newCategory);
        const updatedCategories = [...categories, newCategory.trim()];
        setCategories(updatedCategories);
        setCategory(newCategory.trim());
      } catch (error) { 
        console.error('Error adding category:', error); 
      }
    }
  };

  const handleBrowse = async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke('select-folder');
      if (!result.canceled && result.filePaths.length > 0) {
        const selectedDir = result.filePaths[0];
        setSaveDirectory(selectedDir);
        if (rememberPath) {
          // Ensure category exists before saving
          if (!categories.includes(category)) await handleAddCategory(); // Or handle differently
          await window.electron.ipcRenderer.invoke('save-path-for-category', category, selectedDir);
        }
      }
    } catch (error) { 
      console.error('Error browsing for folder:', error); 
    }
  };

  // Standard confirm handler (called by buttons)
  const handleStandardConfirm = (action: ConfirmAction) => {
    if (!onConfirm || action === 'cancel') {
      onCancel(); // Use the common cancel handler
      return;
    }
    const fullSavePath = saveDirectory ? `${saveDirectory}\\${saveFilename}` : saveFilename;
    onConfirm({
      category,
      savePath: fullSavePath,
      description,
      startPaused: action === 'later' // Derive startPaused from the button clicked
    });
  };

  if (!isOpen) return null;

  // --- Render Logic ---

  let title = t('downloadForm.title');
  let content = null;
  let buttons = null;

  if (isDuplicateDialog && existingDownload) {
    // --- Duplicate Dialog Content ---
    title = t('confirmDialog.duplicateTitle');
    content = (
      <div className="dialog-content">
        <p>{t('confirmDialog.duplicateMessage')}</p>
        <div className="existing-download-info">
            <div><strong>{t('confirmDialog.existingFile')}</strong> {existingDownload.filename || t('downloadItem.unknown')}</div>
            <div><strong>{t('confirmDialog.existingStatus')}</strong> {t(`downloadStatus.${existingDownload.status?.toLowerCase()}`)}</div>
        </div>
        <p>{t('confirmDialog.duplicateQuestion')}</p>
      </div>
    );
    buttons = (
      <div className="dialog-buttons">
        {/* Check if resumable */} 
        {(existingDownload.status === DownloadStatus.PAUSED || existingDownload.status === DownloadStatus.ERROR) && onConfirmResume && (
          <button onClick={onConfirmResume} className="btn btn-primary">
            <FiPlay /> {t('general.resumeExisting')}
          </button>
        )}
        {/* Always offer overwrite */} 
        {onConfirmOverwrite && (
           <button onClick={onConfirmOverwrite} className="btn btn-secondary">
             <FiDownload /> {t('general.cancelOldStartNew')}
           </button>
        )}
        <button onClick={onCancel} className="btn btn-tertiary">
          <FiX /> {t('general.cancelAction')}
        </button>
      </div>
    );

  } else if (downloadInfo) {
    // --- Standard Dialog Content ---
    title = t('confirmDialog.title'); // Changed title
    let messageBar = null;
    if (fileExists) {
        messageBar = (
          <div className="message-bar warning">
            <FiAlertTriangle /> {t('confirmDialog.fileExistsWarning')}
          </div>
        );
    } else if (partialFileExists) {
        messageBar = (
          <div className="message-bar info">
            <FiInfo /> {t('confirmDialog.partialFileInfo')}
          </div>
        );
    }

    content = (
      <>
        {messageBar}
        <div className="form-group">
          <label>{t('confirmDialog.url')}</label>
          <input type="text" value={downloadInfo.url} readOnly className="readonly-input"/>
        </div>
        {/* File Size (optional) */}
        {downloadInfo.fileSize && downloadInfo.fileSize > 0 && (
            <div className="form-group">
              <label>{t('confirmDialog.fileSize')}</label>
              <div>{formatFileSize(downloadInfo.fileSize)}</div>
            </div>
        )}
        {/* Category Dropdown */}
        <div className="form-group">
          <label>{t('confirmDialog.category')}</label>
          <div className="category-container">
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
            <button 
              onClick={handleAddCategory} 
              title={t('confirmDialog.addCategory')}
              className="add-category-btn"
            >
              <FiPlusCircle />
            </button>
          </div>
        </div>
        {/* Save Directory */}
        <div className="form-group">
          <label>{t('confirmDialog.saveDirectory')}</label>
          <div className="save-path-container">
            <input type="text" value={saveDirectory} onChange={(e) => setSaveDirectory(e.target.value)} placeholder={t('downloadForm.defaultFolder')} />
            <button onClick={handleBrowse} className="btn btn-secondary">
              <FiFolder /> {t('general.browse')}
            </button>
          </div>
          <div className="remember-path">
            <input type="checkbox" id="rememberPathCheckbox" checked={rememberPath} onChange={(e) => setRememberPath(e.target.checked)} />
            <label htmlFor="rememberPathCheckbox">{t('confirmDialog.rememberPath')}</label>
          </div>
        </div>
        {/* Filename Input */}
        <div className="form-group">
            <label>{t('confirmDialog.filename')}</label>
            <input type="text" value={saveFilename} onChange={(e) => setSaveFilename(e.target.value)} placeholder="Enter filename..." />
        </div>
        {/* Description Textarea */}
        <div className="form-group">
          <label>{t('confirmDialog.description')}</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Optional description..." />
        </div>
      </>
    );
    buttons = (
      <div className="dialog-buttons">
        <button onClick={() => handleStandardConfirm('start')} className="btn btn-primary">
          <FiDownload /> {t('general.startDownload')}
        </button>
        <button onClick={() => handleStandardConfirm('later')} className="btn btn-secondary">
          <FiClock /> {t('general.downloadLater')}
        </button>
        <button onClick={() => handleStandardConfirm('cancel')} className="btn btn-tertiary">
          <FiX /> {t('general.cancel')}
        </button>
      </div>
    );
  }

  return (
    <div className="dialog-overlay">
      <div className="dialog download-confirm-dialog">
        <h2><FiSave /> {title}</h2>
        {content}
        {buttons}
      </div>
    </div>
  );
}; 