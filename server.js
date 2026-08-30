const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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

function questionSourceMeta(q) {
  return [
    q.subject,
    q.session,
    q.year,
    `${q.paper}${q.variant ? ' Variant ' + q.variant : ''}`,
    `Q${q.num_label}`
  ].filter(Boolean).join(' - ');
}

// Build the exam PDFs + Word docs via exam_build.py (PyMuPDF +
// python-docx): questions are clipped straight out of the source past-paper
// PDFs so tables, diagrams, images and text keep their original formatting.
// Returns null on failure so the caller can fall back to the text-based
// generator.
function buildExamWithPython(examName, questions, qpPath, msPath, qpDocxPath, msDocxPath) {
  const script = path.join(__dirname, 'exam_build.py');
  if (!fs.existsSync(script)) {
    return { success: false, error: 'exam_build.py not found' };
  }

  const spec = {
    exam_name: examName,
    out_qp: qpPath,
    out_ms: msPath,
    out_qp_docx: qpDocxPath || null,
    out_ms_docx: msDocxPath || null,
    questions: questions.map(q => ({
      id: q.id,
      num_label: q.num_label,
      marks: q.marks,
      meta: questionSourceMeta(q),
      text: q.text,
      answers: q.answers,
      qp_path: q.qp_path ? path.join(__dirname, q.qp_path) : null,
      qp_page: q.qp_page,
      ms_path: q.ms_path ? path.join(__dirname, q.ms_path) : null,
      ms_page: q.ms_page
    }))
  };

  const specPath = qpPath.replace(/\.pdf$/, '.spec.json');
  fs.writeFileSync(specPath, JSON.stringify(spec), 'utf8');

  try {
    let result = spawnSync('python', [script, specPath], {
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024,
      cwd: __dirname
    });
    if (result.error) {
      // 'python' not found - try the Windows launcher
      result = spawnSync('py', [script, specPath], {
        encoding: 'utf8',
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
        cwd: __dirname
      });
    }
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`exam_build.py exited with ${result.status}: ${(result.stderr || '').slice(0, 500)}`);
    }
    const jsonLine = (result.stdout || '').trim().split('\n').pop();
    const parsed = JSON.parse(jsonLine);
    if (!parsed.success) throw new Error('exam_build.py reported failure');
    return parsed;
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    try { fs.unlinkSync(specPath); } catch (e) { /* ignore */ }
  }
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

  // API Route: Create Exam (Question Paper + Mark Scheme PDFs)
  if (req.method === 'POST' && req.url === '/api/create-exam') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const examName = String(payload.name || '').trim();
        const questionIds = payload.questionIds;

        if (!examName) {
          throw new Error('Exam name is required.');
        }
        if (examName.length > 120) {
          throw new Error('Exam name is too long (max 120 characters).');
        }
        if (!Array.isArray(questionIds) || questionIds.length === 0) {
          throw new Error('Select at least one question for the exam.');
        }
        if (questionIds.length > 100) {
          throw new Error('Too many questions selected (max 100).');
        }

        const dbPath = path.join(__dirname, 'questions_db_v2.json');
        const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        const byId = new Map(database.questions.map(q => [q.id, q]));

        const questions = questionIds.map(id => {
          const q = byId.get(id);
          if (!q) {
            throw new Error(`Question not found: ${id}`);
          }
          return q;
        });

        const slug = examName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'exam';
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const qpFile = `${slug}_${stamp}_Question_Paper.pdf`;
        const msFile = `${slug}_${stamp}_Mark_Scheme.pdf`;
        const qpDocxFile = `${slug}_${stamp}_Question_Paper.docx`;
        const msDocxFile = `${slug}_${stamp}_Mark_Scheme.docx`;

        const examDir = path.join(__dirname, 'exams');
        fs.mkdirSync(examDir, { recursive: true });
        const qpPath = path.join(examDir, qpFile);
        const msPath = path.join(examDir, msFile);
        const qpDocxPath = path.join(examDir, qpDocxFile);
        const msDocxPath = path.join(examDir, msDocxFile);

        const totalMarks = questions.reduce((sum, q) => sum + (q.marks || 0), 0);

        // Build exact-layout PDFs and stable Word copies using normal
        // paragraphs plus source-faithful images for tables and diagrams.
        let builtWith = 'source-regions';
        const buildResult = buildExamWithPython(examName, questions, qpPath, msPath, qpDocxPath, msDocxPath);
        if (!buildResult || !buildResult.success) {
          throw new Error(buildResult?.error || 'The Word exam builder is unavailable.');
        }
        const docxBuilt = !!(
          buildResult.docx &&
          fs.existsSync(qpDocxPath) && fs.statSync(qpDocxPath).size > 0 &&
          fs.existsSync(msDocxPath) && fs.statSync(msDocxPath).size > 0
        );
        if (!docxBuilt) {
          throw new Error('The editable Word files could not be created. Install the Python dependencies from requirements.txt, then try again.');
        }

        console.log(`Created exam "${examName}" (${questions.length} questions, ${totalMarks} marks) [${builtWith}${docxBuilt ? ' + Word' : ''}]`);

        const qpUrl = `/exams/${encodeURIComponent(qpDocxFile)}`;
        const msUrl = `/exams/${encodeURIComponent(msDocxFile)}`;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Exam created successfully!',
          qpUrl,
          msUrl,
          qpPdfUrl: `/exams/${encodeURIComponent(qpFile)}`,
          msPdfUrl: `/exams/${encodeURIComponent(msFile)}`,
          format: 'Word',
          questionCount: questions.length,
          totalMarks,
          builtWith
        }));
      } catch (err) {
        console.error('Error creating exam:', err);
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
