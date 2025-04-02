# Troubleshooting Browser Extension Issues

## Icon Loading Error

If you see an error like "Could not load icon" or "Could not load manifest" when installing the extension, this is likely due to the extension being unable to find the icon files.

### Solution

The extension now uses a data URL for the icon, so this error should not occur. However, if you still encounter this issue, follow these steps:

1. Open the browser extension folder
2. Create a folder named `icons` if it doesn't exist
3. Create empty icon files with these names:
   - icons/icon16.png
   - icons/icon32.png
   - icons/icon48.png
   - icons/icon128.png

You can use any PNG files for these icons. They should be square images of the corresponding pixel sizes (16x16, 32x32, etc.).

## Extension Not Working

If the extension installs correctly but doesn't function as expected:

1. Check the browser console for errors (F12 > Console)
2. Make sure you've enabled the right permissions for the extension
3. Verify that Catchy Download Manager is running on your computer
4. Test the protocol handler by entering `catchy://https://example.com/file.zip` directly in your browser

## Context Menu Not Appearing

If the "Download with Catchy" option doesn't appear in the context menu:

1. Reinstall the extension
2. Restart your browser
3. Make sure you're right-clicking on links, videos, or audio elements

## Media Detection Not Working

If the extension cannot find media on the page:

1. Try a different page with known media elements
2. Some websites use complex methods to serve video that might not be detectable
3. Try YouTube or Vimeo for testing, as these are directly supported 