import React from 'react';
import { DownloadItem } from '../../common/types';
import { DownloadListItem } from './DownloadListItem';
import { useTranslation } from 'react-i18next';
import { FiDownload } from 'react-icons/fi';

interface DownloadListProps {
  downloads: DownloadItem[];
  onAction: (id: string, action: string) => Promise<void>;
}

export const DownloadList: React.FC<DownloadListProps> = ({ downloads, onAction }) => {
  const { t } = useTranslation();
  
  // Sort downloads by createdAt, newest first
  const sortedDownloads = [...downloads].sort((a, b) => {
    // Convert string dates to Date objects if needed
    const dateA = typeof a.createdAt === 'string' ? new Date(a.createdAt) : a.createdAt;
    const dateB = typeof b.createdAt === 'string' ? new Date(b.createdAt) : b.createdAt;
    
    return dateB.getTime() - dateA.getTime();
  });
  
  // If no downloads, show a message
  if (sortedDownloads.length === 0) {
    return (
      <div className="empty-state">
        <FiDownload />
        <h3>{t('downloadList.empty.title')}</h3>
        <p>{t('downloadList.empty.message')}</p>
      </div>
    );
  }
  
  return (
    <div className="download-list-container">
      <h2>{t('downloadList.title')}</h2>
      <div className="download-list">
        {sortedDownloads.map(download => (
          <DownloadListItem
            key={download.id} 
            download={download}
            onAction={onAction}
          />
        ))}
      </div>
    </div>
  );
}; 