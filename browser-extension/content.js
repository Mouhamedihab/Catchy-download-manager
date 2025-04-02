// Function to find all video and audio elements on the page
function findMediaElements() {
  // Get all video elements
  const videoElements = Array.from(document.querySelectorAll('video'));
  
  // Get all audio elements
  const audioElements = Array.from(document.querySelectorAll('audio'));
  
  // Get sources from these elements
  const mediaSources = [];
  
  // Extract video sources
  videoElements.forEach(video => {
    // Get the direct source if available
    if (video.src) {
      mediaSources.push({
        url: video.src,
        type: 'video',
        title: document.title || 'Video',
      });
    }
    
    // Get sources from source elements
    const sources = video.querySelectorAll('source');
    sources.forEach(source => {
      if (source.src) {
        mediaSources.push({
          url: source.src,
          type: source.type || 'video',
          title: document.title || 'Video',
        });
      }
    });
  });
  
  // Extract audio sources
  audioElements.forEach(audio => {
    // Get the direct source if available
    if (audio.src) {
      mediaSources.push({
        url: audio.src,
        type: 'audio',
        title: document.title || 'Audio',
      });
    }
    
    // Get sources from source elements
    const sources = audio.querySelectorAll('source');
    sources.forEach(source => {
      if (source.src) {
        mediaSources.push({
          url: source.src,
          type: source.type || 'audio',
          title: document.title || 'Audio',
        });
      }
    });
  });
  
  return mediaSources;
}

// Function to find media in iframes
function findIframeMedia() {
  // Get all iframes
  const iframes = Array.from(document.querySelectorAll('iframe'));
  
  // YouTube video URLs
  const youtubeVideos = iframes
    .filter(iframe => iframe.src && iframe.src.includes('youtube.com/embed/'))
    .map(iframe => {
      const videoId = iframe.src.split('/').pop().split('?')[0];
      return {
        url: `https://www.youtube.com/watch?v=${videoId}`,
        type: 'youtube',
        title: document.title || `YouTube Video (${videoId})`,
      };
    });
  
  // Vimeo video URLs
  const vimeoVideos = iframes
    .filter(iframe => iframe.src && iframe.src.includes('player.vimeo.com/video/'))
    .map(iframe => {
      const videoId = iframe.src.split('/').pop().split('?')[0];
      return {
        url: `https://vimeo.com/${videoId}`,
        type: 'vimeo',
        title: document.title || `Vimeo Video (${videoId})`,
      };
    });
  
  return [...youtubeVideos, ...vimeoVideos];
}

// Function to show media selection UI
function showMediaSelectionUI(mediaSources) {
  // Remove any existing UI
  const existingUI = document.getElementById('catchy-media-selector');
  if (existingUI) {
    existingUI.remove();
  }
  
  // If no media sources found
  if (mediaSources.length === 0) {
    alert('No media found on this page.');
    return;
  }
  
  // Create the UI container
  const container = document.createElement('div');
  container.id = 'catchy-media-selector';
  container.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    width: 400px;
    max-height: 80vh;
    overflow-y: auto;
    background-color: #161a25;
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    z-index: 999999;
    font-family: Arial, sans-serif;
    padding: 16px;
  `;
  
  // Add header
  const header = document.createElement('div');
  header.innerHTML = '<h2 style="margin-top: 0; color: #61dafb;">Catchy Download Manager</h2>';
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    border-bottom: 1px solid #2c3e50;
    padding-bottom: 8px;
  `;
  
  // Add close button
  const closeBtn = document.createElement('button');
  closeBtn.innerText = '×';
  closeBtn.style.cssText = `
    background: none;
    border: none;
    color: white;
    font-size: 24px;
    cursor: pointer;
  `;
  closeBtn.onclick = () => container.remove();
  header.appendChild(closeBtn);
  
  container.appendChild(header);
  
  // Add media items
  const mediaList = document.createElement('div');
  
  mediaSources.forEach((source, index) => {
    const mediaItem = document.createElement('div');
    mediaItem.style.cssText = `
      padding: 12px;
      margin-bottom: 8px;
      background-color: #1e2736;
      border-radius: 4px;
      cursor: pointer;
      transition: background-color 0.2s;
    `;
    mediaItem.onmouseover = () => {
      mediaItem.style.backgroundColor = '#2c3e50';
    };
    mediaItem.onmouseout = () => {
      mediaItem.style.backgroundColor = '#1e2736';
    };
    
    // When clicked, send the URL to background script
    mediaItem.onclick = () => {
      browser.runtime.sendMessage({
        action: 'downloadUrl',
        url: source.url
      });
      container.remove();
    };
    
    // Create content
    mediaItem.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 4px;">${source.title || 'Media'}</div>
      <div style="font-size: 12px; color: #61dafb;">${source.type}</div>
      <div style="font-size: 11px; color: #bbb; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${source.url}</div>
    `;
    
    mediaList.appendChild(mediaItem);
  });
  
  container.appendChild(mediaList);
  
  // Add to page
  document.body.appendChild(container);
}

// Listen for messages from the background script
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Content script received message:', request);
  
  if (request.action === 'findMedia') {
    console.log('Finding media on the current page');
    
    // Find all video and audio elements
    const mediaElements = Array.from(document.querySelectorAll('video, audio'));
    console.log('Found media elements:', mediaElements.length);
    
    // Find all video and audio source URLs
    const mediaUrls = [];
    
    mediaElements.forEach(element => {
      // Check if the element has a src attribute
      if (element.src && element.src.startsWith('http')) {
        mediaUrls.push({
          type: element.tagName.toLowerCase(),
          url: element.src
        });
      }
      
      // Check for source elements
      const sources = element.querySelectorAll('source');
      sources.forEach(source => {
        if (source.src && source.src.startsWith('http')) {
          mediaUrls.push({
            type: element.tagName.toLowerCase(),
            url: source.src
          });
        }
      });
    });
    
    // Also look for <a> tags with media file extensions
    const mediaExtensions = ['.mp4', '.mp3', '.avi', '.mkv', '.flv', '.mov', '.wmv', '.wav', '.ogg', '.webm'];
    const links = Array.from(document.querySelectorAll('a[href]'));
    
    links.forEach(link => {
      const href = link.href.toLowerCase();
      if (mediaExtensions.some(ext => href.endsWith(ext))) {
        mediaUrls.push({
          type: 'link',
          url: link.href
        });
      }
    });
    
    console.log('Found media URLs:', mediaUrls);
    
    // Combine with media elements
    const allMedia = findMediaElements().concat(findIframeMedia()).concat(mediaUrls);
    
    // Deduplicate by URL
    const dedupedMedia = [];
    const urlSet = new Set();
    
    allMedia.forEach(media => {
      if (!urlSet.has(media.url)) {
        urlSet.add(media.url);
        dedupedMedia.push(media);
      }
    });
    
    // Show UI for media selection
    showMediaSelectionUI(dedupedMedia);
    
    // Send response
    sendResponse({ success: true, mediaCount: dedupedMedia.length });
    return true; // Required for asynchronous response in Firefox
  }
});

// List of file extensions to intercept
const DOWNLOAD_EXTENSIONS = [
  // Video
  '.mp4', '.webm', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.3gp',
  // Audio 
  '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac',
  // Documents
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  // Archive
  '.zip', '.rar', '.7z', '.tar', '.gz',
  // Images (large)
  '.iso', '.dmg',
  // Executables
  '.exe', '.msi', '.apk', '.deb', '.rpm'
];

// Main link click interceptor
document.addEventListener('click', function(event) {
  // Only proceed if the user clicked an <a> element
  if (event.target.tagName !== 'A' && !event.target.closest('a')) {
    return;
  }
  
  // Get the link element
  const link = event.target.tagName === 'A' ? event.target : event.target.closest('a');
  
  // Check if the link has href and it's not empty
  if (!link.href || link.href === '#' || link.href.startsWith('javascript:')) {
    return;
  }
  
  // Check if the link is a download link
  const isDownloadAttr = link.hasAttribute('download');
  const isDownloadExt = DOWNLOAD_EXTENSIONS.some(ext => 
    link.href.toLowerCase().endsWith(ext)
  );
  
  // If it's a download link, intercept it
  if (isDownloadAttr || isDownloadExt) {
    event.preventDefault();
    event.stopPropagation();
    
    console.log('Intercepted download link:', link.href);
    
    // Send message to background script to handle the download
    chrome.runtime.sendMessage({
      action: 'downloadUrl',
      url: link.href,
      filename: link.getAttribute('download') || link.href.split('/').pop()
    }).then(response => {
      console.log('Download request sent:', response);
      
      // Show notification to user
      showDownloadNotification(link.href);
    }).catch(error => {
      console.error('Error sending download request:', error);
    });
  }
});

// Shows a small notification that fades out
function showDownloadNotification(url) {
  // Create the notification element
  const notification = document.createElement('div');
  
  // Extract filename from URL
  const filename = url.split('/').pop();
  
  // Set content and style
  notification.textContent = `Sending to Catchy: ${filename}`;
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background-color: #161a25;
    color: white;
    border-left: 4px solid #61dafb;
    padding: 12px 16px;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    z-index: 99999;
    font-family: Arial, sans-serif;
    max-width: 300px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 1;
    transition: opacity 0.5s ease;
  `;
  
  // Add to page
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 500);
  }, 3000);
}

console.log('Catchy content script initialized'); 