const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;

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

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Database saved successfully!' }));
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
    reqUrl = '/index_v2.html';
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
      filePath = path.join(filePath, 'index_v2.html');
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

server.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`  Syllabus Explorer Server running at:`);
  console.log(`  http://localhost:${PORT}/`);
  console.log(`  Admin Editor available at:`);
  console.log(`  http://localhost:${PORT}/admin.html`);
  console.log(`==================================================`);
});
