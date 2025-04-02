# Catchy Browser Extension

A browser extension for Catchy Download Manager that allows for easy downloading of files directly from your web browser.

## Features

- Right-click menu for downloading links
- Download media files detected on web pages
- Automatic download interception for supported file types
- Cross-browser compatibility (Chrome, Firefox, Edge, Brave)

## Installation

### Prerequisites

1. First, ensure that the Catchy Download Manager application is installed and running on your computer.

### Installing the Browser Polyfill

For cross-browser compatibility, the extension requires the `browser-polyfill.min.js` file.

1. Download the WebExtension Polyfill from the Mozilla GitHub repository:
   - Visit: https://github.com/mozilla/webextension-polyfill/releases
   - Download the latest `browser-polyfill.min.js` file
   - Place this file in the root directory of the extension (same folder as manifest.json)

### Chrome / Edge / Brave Installation

1. Open your browser and navigate to the extensions page:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
   - Brave: `brave://extensions/`

2. Enable "Developer mode" using the toggle in the top-right corner.

3. Click "Load unpacked" and select the browser-extension folder.

4. The Catchy Download Manager extension should now be installed.

### Firefox Installation

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.

2. Click "Load Temporary Add-on" and select any file in the browser-extension folder (like `manifest.json`).

## Usage

### Right-click Menu

- Right-click on any link and select "Download with Catchy" to send the link to Catchy Download Manager.

### Media Download

- Click on the Catchy icon in the toolbar to scan the current page for media files.
- Select from the list of detected media to download.

### Automatic Download Interception

The extension will automatically intercept downloads when you click on links to supported file types, including:

- Video files (.mp4, .webm, .mkv, etc.)
- Audio files (.mp3, .wav, .ogg, etc.)
- Documents (.pdf, .doc, .xlsx, etc.)
- Archives (.zip, .rar, .7z, etc.)
- Executables (.exe, .msi, .apk, etc.)

## Troubleshooting

- Ensure the Catchy application is running before using the extension.
- The extension connects to Catchy via localhost:43210. Make sure this port is not blocked.
- If you encounter issues with Firefox, check the browser console for error messages.

## Development

To make changes to the extension:

1. Edit the files in the browser-extension folder.
2. Reload the extension in your browser:
   - For Chrome/Edge/Brave: Click the refresh icon on the extension card.
   - For Firefox: Click "Reload" next to the extension in about:debugging. 