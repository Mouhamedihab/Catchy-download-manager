const fs = require('fs');
const path = require('path');

// Create dist directory if it doesn't exist
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Create renderer directory directly in dist
const rendererDir = path.join(distDir, 'renderer');
if (!fs.existsSync(rendererDir)) {
  fs.mkdirSync(rendererDir, { recursive: true });
}

// Copy HTML file to dist/renderer
const srcHtmlPath = path.join(__dirname, 'src', 'renderer', 'index.html');
const destHtmlPath = path.join(rendererDir, 'index.html');

try {
  // Check if the source HTML file exists
  if (!fs.existsSync(srcHtmlPath)) {
    console.error(`Source HTML file not found at ${srcHtmlPath}`);
    process.exit(1);
  }
  
  const htmlContent = fs.readFileSync(srcHtmlPath, 'utf8');
  
  // Fix the script path in HTML - make it relative to the HTML file location
  const fixedHtmlContent = htmlContent.replace('./renderer.js', './renderer.js');
  fs.writeFileSync(destHtmlPath, fixedHtmlContent);
  console.log('HTML file copied to', destHtmlPath);
  
  // Copy renderer.js to renderer directory
  const srcJsPath = path.join(distDir, 'renderer.js');
  const destJsPath = path.join(rendererDir, 'renderer.js');
  
  if (fs.existsSync(srcJsPath)) {
    fs.copyFileSync(srcJsPath, destJsPath);
    console.log('renderer.js copied to', destJsPath);
    
    // Copy license file if it exists
    const srcLicensePath = path.join(distDir, 'renderer.js.LICENSE.txt');
    if (fs.existsSync(srcLicensePath)) {
      const destLicensePath = path.join(rendererDir, 'renderer.js.LICENSE.txt');
      fs.copyFileSync(srcLicensePath, destLicensePath);
      console.log('renderer.js.LICENSE.txt copied to', destLicensePath);
    }
    
    // Copy map file if it exists
    const srcMapPath = path.join(distDir, 'renderer.js.map');
    if (fs.existsSync(srcMapPath)) {
      const destMapPath = path.join(rendererDir, 'renderer.js.map');
      fs.copyFileSync(srcMapPath, destMapPath);
      console.log('renderer.js.map copied to', destMapPath);
    }
  } else {
    console.error('renderer.js not found in dist directory. Webpack build may have failed.');
  }
} catch (error) {
  console.error('Error during build process:', error);
  process.exit(1);
}

console.log('Build completed successfully!'); 