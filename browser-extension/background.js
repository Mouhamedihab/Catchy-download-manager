// Simple inline icon as a data URL - blue download arrow
const ICON_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAbwAAAG8B8aLcQwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAB7SURBVDiN7ZOxCYAwEEXfKWhjZSV2DuEUTmAlWNk4gp2VnZ2dE9gJIXAQRUyIFoLgwYeD+/M5jgP+DcAU2YI5cqa6NwtJfWRL0nqzk1TUvVmADVgj5wTMwPCwkwBT5JyBHuiAI3JOQJtC8sTb/MqQA0kFcEk6JZ3yHXwGF9N9Pk8vFk1mAAAAAElFTkSuQmCC';

// Set the action icon using a file path temporarily
chrome.action.setIcon({ path: { 
  '16': 'icons/icon16.png', 
  '32': 'icons/icon32.png'
} });

// Create context menu items when extension is installed
chrome.runtime.onInstalled.addListener(() => {
  // Create a context menu item for downloading links
  chrome.contextMenus.create({
    id: 'catchyDownload',
    title: 'Download with Catchy',
    contexts: ['link']
  });

  // Create a context menu item for media detection
  chrome.contextMenus.create({
    id: 'download-media-with-catchy',
    title: 'Download Media with Catchy',
    contexts: ['page']
  });

  console.log('Catchy extension installed. Context menus created.');
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'catchyDownload' && info.linkUrl) {
    handleDownload(info.linkUrl);
  } else if (info.menuItemId === 'download-media-with-catchy') {
    // This would normally involve content script injection to find media
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'findMedia' });
    }
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadUrl') {
    handleDownload(request.url);
    sendResponse({ success: true });
  }
});

// Function to check if URL is likely a download
function isDownloadUrl(url) {
  // Add your download URL patterns here
  const downloadPatterns = [
    /\.exe$/i,
    /\.zip$/i,
    /\.rar$/i,
    /\.7z$/i,
    /\.tar$/i,
    /\.gz$/i,
    /\.pdf$/i,
    /\.mp4$/i,
    /\.mkv$/i,
    /\.mp3$/i,
    /\.wav$/i,
    /\.iso$/i,
    /\.img$/i,
    /\.apk$/i,
    /\.doc$/i,
    /\.docx$/i,
    /\.xls$/i,
    /\.xlsx$/i,
    /\.ppt$/i,
    /\.pptx$/i
  ];

  return downloadPatterns.some(pattern => pattern.test(url));
}

// Function to handle downloads
async function handleDownload(url) {
  try {
    // Send download request to the app
    const response = await fetch('http://localhost:43210/download', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: url,
        options: {
          startPaused: false // Default to starting immediately
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log('Download request result:', result);

    // Show notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: ICON_DATA,
      title: 'Download Added',
      message: `Download request sent to Catchy Download Manager`
    });

  } catch (error) {
    console.error('Error sending download request:', error);
    
    // Show error notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: ICON_DATA,
      title: 'Download Error',
      message: 'Could not send download to Catchy. Is the app running?'
    });
  }
}

// Handle extension icon clicks
chrome.action.onClicked.addListener((tab) => {
  // Inject content script to find downloadable content
  if (tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'findMedia' });
  }
});

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Message received:', request);
    
    if (request.action === 'initiateDownload') {
        handleDownload(request.downloadInfo);
        sendResponse({ success: true });
    } else if (request.action === 'openFileDialog') {
        // Forward the request to the native app to show file dialog
        fetch('http://localhost:43210/showFileDialog', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                currentPath: request.currentPath
            })
        })
        .then(response => response.json())
        .then(data => {
            sendResponse({ path: data.path });
        })
        .catch(error => {
            console.error('Error showing file dialog:', error);
            sendResponse({ error: 'Failed to show file dialog' });
        });
        return true; // Required for async response
    }
}); 