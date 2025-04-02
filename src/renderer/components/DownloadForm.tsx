import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiDownload, FiFolder, FiChevronsDown, FiChevronsUp, FiInfo, FiSettings } from 'react-icons/fi';

interface DownloadFormProps {
  onAddDownload: (url: string, options?: any) => Promise<void>;
}

export const DownloadForm: React.FC<DownloadFormProps> = ({ onAddDownload }) => {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [connections, setConnections] = useState(8);
  const [dynamicConnections, setDynamicConnections] = useState(true);
  const [customFolder, setCustomFolder] = useState('');
  const [forceNewDownload, setForceNewDownload] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!url.trim()) {
      setError(t('downloadForm.enterUrl'));
      return;
    }
    
    try {
      // Validate URL
      new URL(url); // This will throw if invalid
      
      setIsSubmitting(true);
      setError('');
      
      // Create options object only when advanced options are shown
      const options = showAdvanced ? {
        connections,
        dynamicConnections,
        downloadFolder: customFolder || undefined,
        forceNewDownload
      } : { forceNewDownload };
      
      await onAddDownload(url, options);
      setUrl('');
      setIsSubmitting(false);
    } catch (err) {
      setError(t('downloadForm.invalidUrl'));
      setIsSubmitting(false);
    }
  };

  const handleSelectFolder = async () => {
    try {
      const result = await window.electron.selectFolder();
      if (result && !result.canceled && result.filePaths.length > 0) {
        setCustomFolder(result.filePaths[0]);
      }
    } catch (err) {
      console.error('Error selecting folder:', err);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="download-form">
      <div className="card">
        <div className="card-header">
          <h2><FiDownload /> {t('downloadForm.title')}</h2>
        </div>
        
        <div className="form-group">
          <label htmlFor="url">{t('downloadForm.url')}</label>
          <div className="input-group">
            <input
              type="text"
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/file.zip"
              disabled={isSubmitting}
              className={error ? 'error' : ''}
            />
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={isSubmitting}
            >
              <FiDownload /> {isSubmitting ? t('downloadForm.adding') : t('downloadForm.addDownload')}
            </button>
          </div>
          {error && <div className="error-message">{error}</div>}
        </div>
        
        <div className="advanced-toggle">
          <button 
            type="button" 
            className="btn-link" 
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? (
              <><FiChevronsUp /> {t('downloadForm.hideAdvanced')}</>
            ) : (
              <><FiChevronsDown /> {t('downloadForm.showAdvanced')}</>
            )}
          </button>
        </div>
        
        {showAdvanced && (
          <div className="advanced-options">
            <div className="form-group">
              <label htmlFor="folder">{t('downloadForm.downloadFolder')}</label>
              <div className="input-with-button">
                <input
                  type="text"
                  id="folder"
                  value={customFolder}
                  placeholder={t('downloadForm.defaultFolder')}
                  readOnly
                  disabled={isSubmitting}
                />
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={handleSelectFolder}
                  disabled={isSubmitting}
                >
                  <FiFolder /> {t('general.browse')}
                </button>
              </div>
              <small className="form-help">{t('downloadForm.useDefaultFolder')}</small>
            </div>

            <div className="form-group">
              <label htmlFor="connections">
                {t('downloadForm.connections')}
                <span className="tooltip-container">
                  <span className="help-icon"><FiInfo /></span>
                  <span className="tooltip-text">
                    {t('downloadForm.connectionsTooltip')}
                  </span>
                </span>
              </label>
              <div className="input-with-value">
                <input
                  type="range"
                  id="connections"
                  min="1"
                  max="16"
                  value={connections}
                  onChange={(e) => setConnections(parseInt(e.target.value))}
                  disabled={isSubmitting}
                />
                <span className="input-value">{connections}</span>
              </div>
            </div>
            
            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={dynamicConnections}
                  onChange={(e) => setDynamicConnections(e.target.checked)}
                  disabled={isSubmitting}
                />
                {t('downloadForm.dynamicConnections')}
                <span className="tooltip-container">
                  <span className="help-icon"><FiInfo /></span>
                  <span className="tooltip-text">
                    {t('downloadForm.dynamicConnectionsTooltip')}
                  </span>
                </span>
              </label>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}; 