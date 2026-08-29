const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { archiveImages } = require('./server');

test('archiveImages moves question images into deleted-images', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), '9626-archive-'));
  const sourceDir = path.join(root, 'questions_images');
  fs.mkdirSync(sourceDir);
  fs.writeFileSync(path.join(sourceDir, 'cover.jpg'), 'image');

  const archived = archiveImages(root, ['questions_images\\cover.jpg']);

  assert.deepEqual(archived, ['deleted-images\\cover.jpg']);
  assert.equal(fs.existsSync(path.join(sourceDir, 'cover.jpg')), false);
  assert.equal(fs.readFileSync(path.join(root, 'deleted-images', 'cover.jpg'), 'utf8'), 'image');

  fs.rmSync(root, { recursive: true, force: true });
});

test('archiveImages rejects paths outside questions_images', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), '9626-archive-'));

  assert.throws(
    () => archiveImages(root, ['questions_images\\..\\questions_db.json']),
    /Invalid image path/
  );

  fs.rmSync(root, { recursive: true, force: true });
});
