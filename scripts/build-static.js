const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const assetDirs = ['css', 'js', 'images', 'admin-assets'];
const configuredApiBaseUrl = process.env.LIFETIME_API_BASE_URL || '';

function normalizeApiBaseUrl(value) {
  if (!value) {
    return '';
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error('LIFETIME_API_BASE_URL must be a valid HTTPS URL (or HTTP for local development).');
  }

  if (
    !['http:', 'https:'].includes(parsedUrl.protocol) ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.pathname !== '/' ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error('LIFETIME_API_BASE_URL must contain only the backend origin, without credentials, a path, or query string.');
  }

  return parsedUrl.origin;
}

const apiBaseUrl = normalizeApiBaseUrl(configuredApiBaseUrl);

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}

fs.mkdirSync(distDir, { recursive: true });
fs.copyFileSync(path.join(root, 'index.html'), path.join(distDir, 'index.html'));
fs.copyFileSync(path.join(root, 'admin.html'), path.join(distDir, 'admin.html'));

for (const dirName of assetDirs) {
  const srcDir = path.join(root, dirName);
  if (fs.existsSync(srcDir)) {
    copyDir(srcDir, path.join(distDir, dirName));
  }
}

const apiConfigPath = path.join(distDir, 'js', 'api-config.js');
const apiConfig = fs.readFileSync(apiConfigPath, 'utf8');
const defaultApiBaseUrl = "window.LIFETIME_API_BASE_URL = '';";
if (!apiConfig.includes(defaultApiBaseUrl)) {
  throw new Error('js/api-config.js is missing the expected API base URL setting.');
}
fs.writeFileSync(
  apiConfigPath,
  apiConfig.replace(defaultApiBaseUrl, `window.LIFETIME_API_BASE_URL = ${JSON.stringify(apiBaseUrl)};`)
);

console.log(`Static site copied to ${distDir}`);
