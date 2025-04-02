# Catchy Download Manager

A modern download manager application built with Electron, React, and TypeScript.

## Key Features

*   Download files via direct URL input.
*   Browser integration via extension to capture downloads (manual installation required).
*   Pause, resume, and cancel downloads.
*   Organize downloads into categories.
*   Set custom download paths per category.
*   Multi-language support (English, French, Arabic).

## Installation

1.  Go to the **[Releases](https://github.com/Mouhamedihab/Catchy-download-manager/releases)** page. 
    *(Note: Replace the URL if your username/repo name is different)*
2.  Download the latest `Catchy.Download.Manager.Setup.X.X.X.exe` file.
3.  Run the downloaded installer.

## Browser Extension Setup (Manual)

The browser extension allows Catchy to capture downloads directly from your browser. Due to limitations, it requires manual installation:

1.  **Open Catchy App:** Launch the installed Catchy Download Manager application.
2.  **Go to Settings:** Click the settings icon (⚙️).
3.  **Reveal Extension:** Scroll down to the "Browser Extension Installation" section and click the **"Show Extension Files"** button. This will open a folder on your computer.
4.  **Open Browser Extensions Page:**
    *   **Chrome/Brave/Opera:** Type `chrome://extensions` in your address bar and press Enter.
    *   **Edge:** Type `edge://extensions` in your address bar and press Enter.
    *   **Firefox:** Type `about:addons` in your address bar, click the gear icon (⚙️), and select "Install Add-on From File..." (Firefox requires a `.xpi` or `.zip` file, see note below).
5.  **Enable Developer Mode:** Find the "Developer mode" toggle (usually in the top-right corner) and turn it **ON**.
6.  **Load Unpacked:** Click the **"Load unpacked"** button that appears.
7.  **Select Folder:** In the file dialog that opens, navigate to and select the `browser-extension` folder that was opened by the Catchy app in Step 3. Click "Select Folder".
8.  **Done!** The Catchy extension should now be installed and active.

*(**Note for Firefox:** Manual installation usually requires a packaged `.xpi` or `.zip` file. The "Load unpacked" method might require temporary loading via `about:debugging`. Consider packaging the extension as a `.zip` for Firefox users or publishing it separately to the Firefox Add-ons store for free).*

## Development Setup

1.  Clone the repository: `git clone https://github.com/Mouhamedihab/Catchy-download-manager.git` 
    *(Note: Replace the URL if needed)*
2.  Navigate to the project directory: `cd Catchy-download-manager`
3.  Install dependencies: `npm install`
4.  Run in development mode: `npm run dev`
5.  Build for production: `npm run build`
6.  Create distributable installer: `npm run dist`

## Technologies Used

*   Electron
*   React
*   TypeScript
*   Webpack
*   electron-builder
*   electron-store
*   i18next (Localization)
*   Node.js

## License

*(Optional: Add license information here if you choose one, e.g., MIT License)* 