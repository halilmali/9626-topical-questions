const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const IMAGE_DIR = 'questions_images';
const DELETED_IMAGE_DIR = 'deleted-images';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.ico': 'image/x-icon'
};

function archiveImages(rootDir, imagePaths) {
  const sourceRoot = path.resolve(rootDir, IMAGE_DIR);
  const destinationRoot = path.resolve(rootDir, DELETED_IMAGE_DIR);
  const archived = [];

  for (const imagePath of new Set(imagePaths || [])) {
    if (typeof imagePath !== 'string') {
      throw new Error('Invalid image path');
    }

    const sourcePath = path.resolve(rootDir, imagePath.replace(/[\\/]/g, path.sep));
    const relativePath = path.relative(sourceRoot, sourcePath);
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error(`Invalid image path: ${imagePath}`);
    }

    if (!fs.existsSync(sourcePath)) continue;

    let destinationPath = path.join(destinationRoot, relativePath);
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });

    if (fs.existsSync(destinationPath)) {
      const extension = path.extname(destinationPath);
      const basename = path.basename(destinationPath, extension);
      destinationPath = path.join(
        path.dirname(destinationPath),
        `${basename}-${Date.now()}${extension}`
      );
    }

    fs.renameSync(sourcePath, destinationPath);
    archived.push(path.relative(rootDir, destinationPath).replace(/[\\/]/g, '\\'));
  }

  return archived;
}

function getReferencedImages(payload) {
  const references = new Set();
  for (const database of [payload.v1, payload.v2]) {
    for (const question of database?.questions || []) {
      for (const imagePath of [...(question.images_q || []), ...(question.images_ms || [])]) {
        references.add(imagePath);
      }
    }
  }
  return references;
}

const server = http.createServer((req, res) => {
  // Logger
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

  // CORS Headers for API flexibility
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API Route: Save Database
  if (req.method === 'POST' && req.url === '/api/save-database') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const archivedImages = payload.removedImages || [];
        const referencedImages = getReferencedImages(payload);

        for (const imagePath of archivedImages) {
          if (referencedImages.has(imagePath)) {
            throw new Error(`Cannot archive an image that is still referenced: ${imagePath}`);
          }
        }
        
        if (payload.v1) {
          const v1Path = path.join(__dirname, 'questions_db.json');
          fs.writeFileSync(v1Path, JSON.stringify(payload.v1, null, 2), 'utf8');
          console.log('Saved questions_db.json (v1)');
        }
        
        if (payload.v2) {
          const v2Path = path.join(__dirname, 'questions_db_v2.json');
          fs.writeFileSync(v2Path, JSON.stringify(payload.v2, null, 2), 'utf8');
          console.log('Saved questions_db_v2.json (v2)');
        }

        const archived = archiveImages(__dirname, archivedImages);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Database saved successfully!',
          archivedImages: archived
        }));
      } catch (err) {
        console.error('Error saving database:', err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Static files server
  let reqUrl = req.url.split('?')[0]; // strip query string
  if (reqUrl === '/') {
    reqUrl = '/index.html';
  }

  const decodedUrl = decodeURIComponent(reqUrl);
  let filePath = path.join(__dirname, decodedUrl);

  // Security check: ensure path is within __dirname
  const relative = path.relative(__dirname, filePath);
  const isSafe = relative && !relative.startsWith('..') && !path.isAbsolute(relative);
  if (!isSafe && filePath !== __dirname) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  // Resolve directory to index file
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`500 Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`  Syllabus Explorer Server running at:`);
    console.log(`  http://localhost:${PORT}/`);
    console.log(`  Admin Editor available at:`);
    console.log(`  http://localhost:${PORT}/admin.html`);
    console.log(`==================================================`);
  });
}

module.exports = { archiveImages, server };
