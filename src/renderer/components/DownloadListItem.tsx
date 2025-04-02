import React from 'react';
import { DownloadItem, DownloadStatus } from '../../common/types';
import { useTranslation } from 'react-i18next';
import { 
  FiPause, 
  FiPlay, 
  FiX, 
  FiTrash2, 
  FiFolder, 
  FiExternalLink, 
  FiClock, 
  FiHardDrive, 
  FiZap,
  FiCheckCircle,
  FiAlertCircle,
  FiClock as FiQueue,
  FiDownload
} from 'react-icons/fi';

interface DownloadListItemProps {
  download: DownloadItem;
  onAction: (id: string, action: string) => Promise<void>;
}

export const DownloadListItem: React.FC<DownloadListItemProps> = ({ download, onAction }) => {
  const { t } = useTranslation();
  const { id, filename, status, progress, speed, size, downloaded, eta } = download;
  
  // Format download size
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  // Format download speed
  const formatSpeed = (bytesPerSecond: number): string => {
    return formatSize(bytesPerSecond) + '/s';
  };
  
  // Format ETA
  const formatEta = (seconds: number): string => {
    if (!seconds || seconds === Infinity || seconds < 0) return t('downloadItem.unknown');
    
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    let result = '';
    if (hrs > 0) result += `${hrs}h `;
    if (mins > 0) result += `${mins}m `;
    if (secs > 0 || result === '') result += `${secs}s`;
    
    return result.trim();
  };
  
  // Get status badge icon
  const getStatusIcon = () => {
    switch (status) {
      case DownloadStatus.DOWNLOADING:
        return <FiDownload />;
      case DownloadStatus.PAUSED:
        return <FiPause />;
      case DownloadStatus.QUEUED:
        return <FiQueue />;
      case DownloadStatus.COMPLETED:
        return <FiCheckCircle />;
      case DownloadStatus.ERROR:
        return <FiAlertCircle />;
      default:
        return null;
    }
  };
  
  // Get status badge 
  const getStatusBadge = () => {
    const badgeClass = `badge badge-${status.toLowerCase()}`;
    return (
      <span className={badgeClass}>
        {getStatusIcon()} {t(`downloadStatus.${status.toLowerCase()}`)}
      </span>
    );
  };
  
  // File operations for completed downloads
  const handleOpenFile = async () => {
    try {
      await window.electron.openFile(download.id);
    } catch (error) {
      console.error('Error opening file:', error);
    }
  };
  
  const handleShowInFolder = async () => {
    try {
      await window.electron.showInFolder(download.id);
    } catch (error) {
      console.error('Error showing file in folder:', error);
    }
  };
  
  // Get action buttons based on status
  const getActionButtons = () => {
    switch (status) {
      case DownloadStatus.DOWNLOADING:
        return (
          <button 
            className="btn btn-secondary" 
            onClick={() => onAction(id, 'pause')}
          >
            <FiPause /> {t('general.pause')}
          </button>
        );
      
      case DownloadStatus.PAUSED:
        return (
          <>
            <button 
              className="btn btn-primary" 
              onClick={() => onAction(id, 'resume')}
            >
              <FiPlay /> {t('general.resume')}
            </button>
            <button 
              className="btn btn-secondary" 
              onClick={() => onAction(id, 'cancel')}
            >
              <FiX /> {t('general.cancel')}
            </button>
          </>
        );
      
      case DownloadStatus.QUEUED:
        return (
          <button 
            className="btn btn-secondary" 
            onClick={() => onAction(id, 'cancel')}
          >
            <FiX /> {t('general.cancel')}
          </button>
        );
      
      case DownloadStatus.COMPLETED:
        return (
          <>
            <button 
              className="btn btn-secondary" 
              onClick={() => onAction(id, 'remove')}
            >
              <FiTrash2 /> {t('general.remove')}
            </button>
            <div className="file-operations">
              <button 
                className="btn-icon" 
                onClick={handleOpenFile}
                title={t('general.open')}
              >
                <FiExternalLink />
              </button>
              <button 
                className="btn-icon" 
                onClick={handleShowInFolder}
                title={t('general.folder')}
              >
                <FiFolder />
              </button>
            </div>
          </>
        );
      
      case DownloadStatus.ERROR:
        return (
          <button 
            className="btn btn-secondary" 
            onClick={() => onAction(id, 'remove')}
          >
            <FiTrash2 /> {t('general.remove')}
          </button>
        );
      
      default:
        return null;
    }
  };

  // Determine if the progress bar should show the shimmer animation
  const showShimmer = status === DownloadStatus.DOWNLOADING;
  
  // Determine progress bar class based on status
  const getProgressBarClass = () => {
    switch (status) {
      case DownloadStatus.COMPLETED:
        return 'progress-bar completed';
      case DownloadStatus.ERROR:
        return 'progress-bar error';
      default:
        return 'progress-bar';
    }
  };
  
  return (
    <div className="download-item" id={`download-item-${id}`}>
      <div className="download-header">
        <h3 className="download-filename">{filename}</h3>
        {getStatusBadge()}
      </div>
      
      <div className="progress-container">
        <div 
          className={getProgressBarClass()}
          style={{ width: `${progress}%` }}
        />
        {showShimmer && <div className="progress-shimmer" />}
      </div>
      
      <div className="download-stats">
        <div className="download-stat">
          {progress.toFixed(1)}%
        </div>
        
        {status === DownloadStatus.DOWNLOADING && (
          <div className="download-stat">
            <FiZap /> {formatSpeed(speed)}
          </div>
        )}
        
        <div className="download-stat">
          <FiHardDrive />
          {size > 0 ? (
            `${formatSize(downloaded)} / ${formatSize(size)}`
          ) : (
            formatSize(downloaded)
          )}
        </div>
        
        {status === DownloadStatus.DOWNLOADING && eta > 0 && (
          <div className="download-stat">
            <FiClock /> {t('downloadItem.eta')} {formatEta(eta)}
          </div>
        )}
      </div>
      
      <div className="download-actions">
        {getActionButtons()}
      </div>
    </div>
  );
}; 