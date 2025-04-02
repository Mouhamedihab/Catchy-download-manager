import React, { useState, useEffect, useCallback } from 'react';
// Ensure the path to common types is correct relative to src/renderer/components/
import { AppSettings } from '../../common/types'; 
import './SettingsDialog.css';
import { useTranslation } from 'react-i18next';
import { FiFolder, FiCheck, FiX, FiGlobe, FiLoader, FiAlertCircle, FiSettings } from 'react-icons/fi';

interface SettingsDialogProps {
  isOpen: boolean;
  currentSettings: AppSettings;
  onSave: (newSettings: AppSettings) => Promise<void>; 
  onClose: () => void;
}

// Extended settings interface to include language
interface ExtendedSettings extends AppSettings {
  language?: string;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  isOpen,
  currentSettings,
  onSave,
  onClose,
}) => {
  const { t, i18n } = useTranslation();
  const [editedPath, setEditedPath] = useState('');
  const [editedMaxConcurrent, setEditedMaxConcurrent] = useState(3);
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  // Validation State
  const [isValidatingPath, setIsValidatingPath] = useState(false);
  const [pathValidationError, setPathValidationError] = useState<string | null>(null);
  const [isPathValid, setIsPathValid] = useState(true); // Assume valid initially or based on current setting

  // Debounce timer state
  const validationTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Function to trigger validation
  const triggerValidation = useCallback(async (path: string) => {
    setIsValidatingPath(true);
    setPathValidationError(null); 
    setIsPathValid(false); 

    try {
      const result = await window.electron.validatePath(path);
      if (result.isValid) {
          setIsPathValid(true);
          setPathValidationError(null);
      } else {
          setIsPathValid(false);
          setPathValidationError(result.error || t('settings.pathInvalid'));
      }
    } catch (error) {
        setIsPathValid(false); 
        setPathValidationError(`${t('settings.pathValidationFailed')}: ${error.message || t('settings.ipcError')}`);
    } finally {
        setIsValidatingPath(false);
    }
  }, [t]);

  // Initialize state and validate initial path
  useEffect(() => {
    if (isOpen && currentSettings) {
      const initialPath = currentSettings.defaultDownloadPath || '';
      setEditedPath(initialPath);
      setEditedMaxConcurrent(currentSettings.maxConcurrentDownloads || 3);
      setSelectedLanguage(i18n.language || 'en');
      
      // Validate the initial path when the dialog opens
      if (initialPath) {
        triggerValidation(initialPath);
      } else {
        // Treat empty path as valid for saving (main process might use default)
        setIsPathValid(true); 
        setPathValidationError(null);
        setIsValidatingPath(false);
      }
    }
  }, [isOpen, currentSettings, triggerValidation, i18n.language]);

  // Handle path changes with debounce
  const handlePathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPath = e.target.value;
    setEditedPath(newPath);
    setIsValidatingPath(true); // Show validating indicator immediately
    setPathValidationError(t('settings.pathValidating')); // Indicate validation is happening
    setIsPathValid(false); // Assume invalid until validation completes

    // Clear existing timer
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }

    // Set new timer
    if (newPath) { // Only validate non-empty paths
        validationTimeoutRef.current = setTimeout(() => {
            triggerValidation(newPath);
        }, 800); // Debounce time (e.g., 800ms)
    } else {
        // If path becomes empty, clear validation state & consider valid
        setIsValidatingPath(false);
        setPathValidationError(null);
        setIsPathValid(true);
        if (validationTimeoutRef.current) clearTimeout(validationTimeoutRef.current);
    }
  };

  const handleBrowse = async () => {
    try {
      const result = await window.electron.selectFolderForSettings(); 
      if (result && result.filePath) {
        setEditedPath(result.filePath);
        triggerValidation(result.filePath);
      }
    } catch (error) {
      console.error("Error selecting folder for settings:", error);
    }
  };

  const handleSave = async () => {
    if (!isPathValid || isValidatingPath) return; 
    setIsSaving(true);

    // Update language if changed
    if (selectedLanguage !== i18n.language) {
      i18n.changeLanguage(selectedLanguage);
    }

    const newSettings: ExtendedSettings = {
      // Make sure the properties match the AppSettings interface
      defaultDownloadPath: editedPath, 
      maxConcurrentDownloads: editedMaxConcurrent,
      language: selectedLanguage // Store language preference in settings
    };
    try {
      await onSave(newSettings as AppSettings);
    } catch (error) {
      console.error("Error during save callback:", error);
    } finally {
        setIsSaving(false);
    }
  };

  const handleShowExtensionFiles = () => {
    console.log('Requesting to show extension files...');
    window.electron.ipcRenderer.invoke('show-extension-files');
  };

  if (!isOpen) return null; // Don't render if not open

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog settings-dialog" onClick={e => e.stopPropagation()}>
        <h2><FiSettings /> {t('settings.title')}</h2>
        
        <div className="form-group">
          <label htmlFor="defaultPath">{t('settings.defaultPath')}</label>
          <div className="input-with-button">
            <input
              type="text"
              id="defaultPath"
              value={editedPath}
              onChange={handlePathChange}
              placeholder="Enter default path or browse..."
              disabled={isSaving}
              className={pathValidationError && !isValidatingPath ? 'error' : ''}
            />
            <button 
              onClick={handleBrowse} 
              disabled={isSaving} 
              className="btn btn-secondary"
            >
              <FiFolder /> {t('settings.browsePath')}
            </button>
          </div>
          <div className="validation-message">
            {isValidatingPath && (
              <span className="validating">
                <FiLoader className="spin" /> {t('settings.pathValidating')}
              </span>
            )}
            {pathValidationError && !isValidatingPath && (
              <span className="error">
                <FiAlertCircle /> {pathValidationError}
              </span>
            )}
            {isPathValid && !isValidatingPath && editedPath && (
              <span className="success">
                <FiCheck /> {t('settings.pathValid')}
              </span>
            )} 
          </div>
        </div>
        
        <div className="form-group">
          <label htmlFor="maxConcurrent">{t('settings.maxConcurrent')}</label>
          <div className="input-with-value">
            <input
              type="range"
              id="maxConcurrent"
              min="1"
              max="10" 
              value={editedMaxConcurrent}
              onChange={(e) => setEditedMaxConcurrent(parseInt(e.target.value, 10))}
              disabled={isSaving}
            />
            <span className="input-value">{editedMaxConcurrent}</span>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="language">
            <FiGlobe /> {t('settings.language')}
          </label>
          <div className="language-selection">
            <select 
              id="language" 
              value={selectedLanguage} 
              onChange={(e) => setSelectedLanguage(e.target.value)}
              disabled={isSaving}
              className="language-select"
            >
              <option value="en">{t('settings.languages.en')}</option>
              <option value="fr">{t('settings.languages.fr')}</option>
              <option value="ar">{t('settings.languages.ar')}</option>
            </select>
          </div>
        </div>
        
        {/* --- Browser Extension Section --- */}
        <div className="form-section" style={{ marginTop: 'var(--spacing-xl)', paddingTop: 'var(--spacing-lg)', borderTop: '1px solid var(--border-color)' }}>
          <h3>{t('settings.extensionTitle')}</h3>
          <p style={{ marginBottom: 'var(--spacing-md)'}}>{t('settings.extensionInstructions')}</p>
          <ul style={{ listStyle: 'decimal', paddingLeft: '20px', marginBottom: 'var(--spacing-lg)'}}>
            <li>{t('settings.extensionStep1')}</li>
            <li>{t('settings.extensionStep2')}</li>
            <li>{t('settings.extensionStep3')}</li>
            <li>{t('settings.extensionStep4')}</li>
          </ul>
          <button 
            onClick={handleShowExtensionFiles}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)'}}
          >
            <FiFolder /> {t('settings.showExtensionFilesButton')}
          </button>
        </div>

        <div className="dialog-buttons">
          <button 
            onClick={handleSave} 
            disabled={isSaving || isValidatingPath || !isPathValid}
            className="btn btn-primary"
          >
            {isSaving ? (
              <><FiLoader className="spin" /> {t('general.saving')}</>
            ) : (
              <><FiCheck /> {t('general.save')}</>
            )}
          </button>
          <button onClick={onClose} disabled={isSaving} className="btn btn-secondary">
            <FiX /> {t('general.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};
