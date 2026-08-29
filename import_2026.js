const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const Module = require('module');

const ROOT = __dirname;
const SOURCE_DIR = path.join(ROOT, '2026');
const IMAGE_DIR = path.join(ROOT, 'questions_images');
const DRY_RUN = process.argv.includes('--dry-run');

function addBundledNodeModules() {
  const candidates = [
    process.env.CODEX_RUNTIME_NODE_MODULES,
    process.env.USERPROFILE && path.join(
      process.env.USERPROFILE,
      '.cache',
      'codex-runtimes',
      'codex-primary-runtime',
      'dependencies',
      'node',
      'node_modules'
    )
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && !module.paths.includes(candidate)) {
      module.paths.push(candidate);
      process.env.NODE_PATH = [process.env.NODE_PATH, candidate].filter(Boolean).join(path.delimiter);
    }
  }
  Module._initPaths();
}

addBundledNodeModules();

function resolveDependency(request) {
  try {
    return require.resolve(request, { paths: module.paths });
  } catch (error) {
    throw new Error(`Missing dependency ${request}. Set CODEX_RUNTIME_NODE_MODULES to the bundled node_modules folder.`);
  }
}

const { createCanvas } = require(resolveDependency('@napi-rs/canvas'));
const sharp = require(resolveDependency('sharp'));

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function parsePaperFilename(filename) {
  const match = filename.match(
    /^(9618 Computer Science|9626 Information Technology) (June|March|November) (\d{4}) (Question Paper|Mark Scheme)\s+(\d+)\.pdf$/i
  );
  if (!match) return null;
  return {
    subject: match[1].startsWith('9618') ? '9618' : '9626',
    session: match[2][0].toUpperCase() + match[2].slice(1).toLowerCase(),
    year: Number(match[3]),
    type: match[4].toLowerCase().startsWith('question') ? 'qp' : 'ms',
    variant: match[5].padStart(2, '0'),
    filename
  };
}

function paperNumber(subject, variant) {
  const value = Number(variant);
  if (subject === '9618') return Math.floor(value / 10);
  if (value === 2) return 2;
  if (value === 4) return 4;
  return Math.floor(value / 10);
}

function topicChapterNumbers(subject, paper) {
  if (subject === '9618') {
    return {
      1: [1, 2, 3, 4, 5, 6, 7, 8],
      2: [9, 10, 11, 12],
      3: [13, 14, 15, 16, 17, 18],
      4: [19, 20]
    }[paper] || [1];
  }
  return {
    1: [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31],
    2: [28, 30, 31],
    3: [32, 33, 34, 35, 36],
    4: [37, 38, 39, 40, 41]
  }[paper] || [21];
}

function classifyQuestion(chapters, subject, paper, questionText, answerText) {
  const allowed = new Set(topicChapterNumbers(subject, paper));
  const question = questionText.toLowerCase();
  const answer = answerText.toLowerCase();
  let best = null;
  let bestScore = 0;

  for (const chapter of chapters) {
    if (!allowed.has(Number(chapter.chapter_num))) continue;
    for (const topic of chapter.topics || []) {
      let score = 0;
      for (const rawKeyword of topic.keywords || []) {
        const keyword = String(rawKeyword).toLowerCase().trim();
        if (!keyword) continue;
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`(^|\\W)${escaped}(?=\\W|$)`, 'g');
        score += (question.match(pattern) || []).length * 3;
        pattern.lastIndex = 0;
        score += (answer.match(pattern) || []).length;
      }
      if (score > bestScore) {
        bestScore = score;
        best = topic.id;
      }
    }
  }

  if (best) return best;
  const firstChapter = chapters.find(chapter => allowed.has(Number(chapter.chapter_num)));
  return firstChapter?.topics?.[0]?.id || (subject === '9618' ? '1.1' : '21.1');
}

async function loadPdf(pdfjs, filename) {
  const data = new Uint8Array(fs.readFileSync(path.join(SOURCE_DIR, filename)));
  return pdfjs.getDocument({ data, disableWorker: true }).promise;
}

async function extractPages(document) {
  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const height = page.view[3] - page.view[1];
    const width = page.view[2] - page.view[0];
    const items = textContent.items
      .filter(item => item.str && item.str.trim())
      .map(item => ({
        text: normalizeWhitespace(item.str),
        x: item.transform[4],
        y: height - item.transform[5],
        width: item.width || 0,
        height: Math.abs(item.transform[3]) || 10
      }));
    pages.push({ pageNumber, page, width, height, items });
  }
  return pages;
}

function questionStarts(pages) {
  const candidates = [];
  for (const page of pages) {
    for (const item of page.items) {
      let match = item.text.match(/^(?:Task\s*)?(\d+)$/i);
      if (!match || item.x < 38 || item.x > 68 || item.y < 55 || item.y > 750) continue;
      candidates.push({
        number: Number(match[1]),
        pageIndex: page.pageNumber - 1,
        y: item.y - item.height,
        item
      });
    }
  }

  const starts = [];
  let expected = 1;
  for (const candidate of candidates.sort((a, b) => a.pageIndex - b.pageIndex || a.y - b.y)) {
    if (candidate.number !== expected) continue;
    starts.push(candidate);
    expected += 1;
  }
  return starts;
}

function markSchemeStarts(pages) {
  const candidates = [];
  for (const page of pages) {
    const questionHeader = page.items.find(item =>
      item.y < 100 && /^(Question|Task)$/.test(item.text)
    );
    if (!questionHeader) continue;

    for (const item of page.items) {
      if (item.y < 75 || item.y > 750) continue;
      const match = item.text.match(/^(\d+)(?:\([a-zivx]+\))*$/i);
      if (!match) continue;
      // Question labels remain within their header column; numbered marking points
      // are in the answer column farther to the right.
      if (Math.abs(item.x - questionHeader.x) > 22) continue;
      candidates.push({
        number: Number(match[1]),
        pageIndex: page.pageNumber - 1,
        y: item.y - item.height,
        item
      });
    }
  }

  const starts = [];
  let expected = 1;
  for (const candidate of candidates.sort((a, b) => a.pageIndex - b.pageIndex || a.y - b.y)) {
    if (candidate.number < expected) continue;
    if (candidate.number !== expected) continue;
    starts.push(candidate);
    expected += 1;
  }
  return starts;
}

function regionItems(pages, start, end) {
  const selected = [];
  for (let pageIndex = start.pageIndex; pageIndex <= end.pageIndex; pageIndex += 1) {
    const page = pages[pageIndex];
    for (const item of page.items) {
      if (item.y < 45 || item.y > 785) continue;
      if (pageIndex === start.pageIndex && item.y < start.y - 5) continue;
      if (pageIndex === end.pageIndex && item.y >= end.y) continue;
      if (/^(?:©|\*|DO NOT WRITE|\[Turn over)/i.test(item.text)) continue;
      if (/^(?:9618|9626)\//.test(item.text)) continue;
      selected.push(item.text);
    }
  }
  return selected;
}

function calculateMarks(items) {
  return items.reduce((total, text) => {
    const match = text.match(/\[(\d+)\]\s*$/);
    return total + (match ? Number(match[1]) : 0);
  }, 0) || null;
}

async function renderRegionImages(pages, start, end, filenamePrefix) {
  if (DRY_RUN) return [];
  const output = [];
  const scale = 2;

  for (let pageIndex = start.pageIndex; pageIndex <= end.pageIndex; pageIndex += 1) {
    const pageInfo = pages[pageIndex];
    const viewport = pageInfo.page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext('2d');
    await pageInfo.page.render({ canvasContext: context, viewport }).promise;

    const topPoints = pageIndex === start.pageIndex ? Math.max(45, start.y - 8) : 45;
    const bottomPoints = pageIndex === end.pageIndex ? Math.min(785, end.y + 6) : 785;
    const top = Math.max(0, Math.floor(topPoints * scale));
    const bottom = Math.min(canvas.height, Math.ceil(bottomPoints * scale));
    if (bottom - top < 45) continue;

    const outputName = `${filenamePrefix}_p${output.length}.jpg`;
    const outputPath = path.join(IMAGE_DIR, outputName);
    const buffer = canvas.toBuffer('image/png');
    await sharp(buffer)
      .extract({ left: 0, top, width: canvas.width, height: bottom - top })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
      .toFile(outputPath);
    output.push(`questions_images\\${outputName}`);
  }
  return output;
}

function endBoundary(pages, starts, index) {
  if (index + 1 < starts.length) {
    const next = starts[index + 1];
    return { pageIndex: next.pageIndex, y: Math.max(45, next.y - 12) };
  }
  return { pageIndex: pages.length - 1, y: 785 };
}

function questionTextAndMarks(pages, start, end) {
  const items = regionItems(pages, start, end);
  return {
    text: normalizeWhitespace(items.filter(text => !/^\[\d+\]$/.test(text)).join(' ')),
    marks: calculateMarks(items)
  };
}

async function processPair(pdfjs, chapters, pair) {
  const qpDocument = await loadPdf(pdfjs, pair.qp.filename);
  const qpPages = await extractPages(qpDocument);
  const starts = questionStarts(qpPages);
  if (!starts.length) throw new Error(`No questions detected in ${pair.qp.filename}`);

  let msDocument = null;
  let msPages = [];
  let msStarts = [];
  if (pair.ms) {
    msDocument = await loadPdf(pdfjs, pair.ms.filename);
    msPages = await extractPages(msDocument);
    msStarts = markSchemeStarts(msPages);
    if (!msStarts.length) throw new Error(`No answers detected in ${pair.ms.filename}`);
    const questionNumbers = starts.map(item => item.number).join(',');
    const answerNumbers = msStarts.map(item => item.number).join(',');
    if (questionNumbers !== answerNumbers) {
      throw new Error(
        `Question/answer numbering mismatch for ${pair.qp.filename}: QP [${questionNumbers}], MS [${answerNumbers}]`
      );
    }
  }

  const paper = paperNumber(pair.qp.subject, pair.qp.variant);
  const questions = [];
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const end = endBoundary(qpPages, starts, index);
    const questionData = questionTextAndMarks(qpPages, start, end);
    const base = `${pair.qp.subject}_${pair.qp.year}_${pair.qp.session.toLowerCase()}_${pair.qp.variant}`;
    const qPrefix = `${base}_q_${start.number}`;
    const imagesQ = await renderRegionImages(qpPages, start, end, qPrefix);

    const msIndex = msStarts.findIndex(item => item.number === start.number);
    let answerText = '';
    let imagesMs = [];
    let msPage = null;
    if (msIndex >= 0) {
      const msStart = msStarts[msIndex];
      const msEnd = endBoundary(msPages, msStarts, msIndex);
      answerText = normalizeWhitespace(
        regionItems(msPages, msStart, msEnd).filter(text => !/^(Question|Answer|Marks|Task)$/.test(text)).join(' ')
      );
      imagesMs = await renderRegionImages(msPages, msStart, msEnd, `${base}_ms_${start.number}`);
      msPage = msStart.pageIndex + 1;
    }

    questions.push({
      id: `${base}_q${start.number}`,
      year: pair.qp.year,
      session: pair.qp.session,
      paper: `Paper ${paper}`,
      variant: pair.qp.variant,
      num_label: String(start.number),
      text: questionData.text,
      marks: questionData.marks,
      topic_id: classifyQuestion(chapters, pair.qp.subject, paper, questionData.text, answerText),
      images_q: imagesQ,
      images_ms: imagesMs,
      answers: answerText ? [answerText] : [],
      qp_path: `2026/${pair.qp.filename}`,
      ms_path: pair.ms ? `2026/${pair.ms.filename}` : null,
      qp_page: start.pageIndex + 1,
      ms_page: msPage,
      subject: pair.qp.subject
    });
  }

  await qpDocument.destroy();
  if (msDocument) await msDocument.destroy();
  const markTotal = questions.reduce((total, question) => total + (question.marks || 0), 0);
  process.stdout.write(`; ${markTotal} marks`);
  return questions;
}

function pairPapers() {
  const parsed = fs.readdirSync(SOURCE_DIR)
    .map(parsePaperFilename)
    .filter(item => item && item.year === 2026);
  const markSchemes = new Map(
    parsed.filter(item => item.type === 'ms').map(item => [
      `${item.subject}:${item.session}:${item.variant}`,
      item
    ])
  );
  return parsed
    .filter(item => item.type === 'qp')
    .map(qp => ({
      qp,
      ms: markSchemes.get(`${qp.subject}:${qp.session}:${qp.variant}`) || null
    }))
    .sort((a, b) =>
      a.qp.subject.localeCompare(b.qp.subject) ||
      a.qp.session.localeCompare(b.qp.session) ||
      Number(a.qp.variant) - Number(b.qp.variant)
    );
}

function writeJsonAtomically(filename, data) {
  const destination = path.join(ROOT, filename);
  const temporary = `${destination}.2026-import.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  // Windows cannot rename over an existing file when another process has it
  // open for reading. Copying the complete temporary file still prevents a
  // partially serialized database from being installed.
  fs.copyFileSync(temporary, destination);
  fs.unlinkSync(temporary);
}

async function main() {
  if (!fs.existsSync(SOURCE_DIR)) throw new Error('The 2026 source folder does not exist.');
  fs.mkdirSync(IMAGE_DIR, { recursive: true });

  const pdfModulePath = resolveDependency('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfjs = await import(pathToFileURL(pdfModulePath).href);
  const dbV2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'questions_db_v2.json'), 'utf8'));
  const pairs = pairPapers();
  const imported = [];

  for (let index = 0; index < pairs.length; index += 1) {
    const pair = pairs[index];
    process.stdout.write(`[${index + 1}/${pairs.length}] ${pair.qp.filename}`);
    const questions = await processPair(pdfjs, dbV2.chapters, pair);
    imported.push(...questions);
    process.stdout.write(` -> ${questions.length} questions${pair.ms ? '' : ' (no mark scheme)'}\n`);
  }

  const duplicateIds = imported.filter(question =>
    dbV2.questions.some(existing => existing.id === question.id)
  ).map(question => question.id);
  if (duplicateIds.length) {
    throw new Error(`Refusing to overwrite existing questions: ${duplicateIds.join(', ')}`);
  }

  const summary = imported.reduce((result, question) => {
    const key = `${question.subject} ${question.session} ${question.variant}`;
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {});
  console.log(JSON.stringify(summary, null, 2));

  if (DRY_RUN) {
    console.log(`Dry run complete: ${imported.length} questions detected.`);
    return;
  }

  for (const filename of ['questions_db.json', 'questions_db_v2.json']) {
    const database = JSON.parse(fs.readFileSync(path.join(ROOT, filename), 'utf8'));
    database.questions.push(...imported);
    writeJsonAtomically(filename, database);
  }
  console.log(`Imported ${imported.length} questions and generated their screenshots.`);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
