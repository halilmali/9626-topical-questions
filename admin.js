/* ==========================================================================
   9626 IT Explorer - Admin Dashboard JavaScript
   ========================================================================== */

// Global State
let dbV1 = null;
let dbV2 = null;
let originalDbV1 = null;
let originalDbV2 = null;

let isDirty = false;
let currentTab = 'assigner';
let isServerOnline = false;

// Pagination and Filtering State
let currentPage = 1;
const pageSize = 15;
let filteredQuestions = [];
let availableTopics = []; // flat list of { id, title, chapterTitle } for fast lookups

// DOM Elements
const connectionStatus = document.getElementById('connection-status');
const unsavedBadge = document.getElementById('unsaved-badge');
const btnSave = document.getElementById('btn-save');
const btnUndo = document.getElementById('btn-undo');
const btnBackup = document.getElementById('btn-backup');

const statTotal = document.getElementById('stat-total');
const statClassified = document.getElementById('stat-classified');
const statUnclassified = document.getElementById('stat-unclassified');
const statChapters = document.getElementById('stat-chapters');

const filterPaper = document.getElementById('filter-paper');
const filterYear = document.getElementById('filter-year');
const filterTopic = document.getElementById('filter-topic');
const filterStatus = document.getElementById('filter-status');
const qSearch = document.getElementById('q-search');

const assignerList = document.getElementById('assigner-list');
const assignerLoading = document.getElementById('assigner-loading');
const paginationInfo = document.getElementById('pagination-info');
const pagPrev = document.getElementById('pag-prev');
const pagNext = document.getElementById('pag-next');
const pagCurrent = document.getElementById('pag-current');

const syllabusTree = document.getElementById('syllabus-tree');
const syllabusLoading = document.getElementById('syllabus-loading');

const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');

// Define default fallback topics for papers
const FALLBACK_TOPICS = ['1.1', '12.4', '8.1', '21.1'];

// Initialize App
window.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await checkServerStatus();
  await loadDatabases();
});

// Setup Global Listeners
function setupEventListeners() {
  // Filter change handlers
  filterPaper.addEventListener('change', () => { currentPage = 1; applyFilters(); });
  filterYear.addEventListener('change', () => { currentPage = 1; applyFilters(); });
  filterTopic.addEventListener('change', () => { currentPage = 1; applyFilters(); });
  filterStatus.addEventListener('change', () => { currentPage = 1; applyFilters(); });
  
  // Search input debounced
  let searchTimeout;
  qSearch.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentPage = 1;
      applyFilters();
    }, 300);
  });

  // Undo button click
  btnUndo.addEventListener('click', () => {
    if (confirm('Are you sure you want to discard all unsaved edits?')) {
      resetEdits();
    }
  });

  // Save button click
  btnSave.addEventListener('click', async () => {
    await saveDatabaseToServer();
  });

  // Backup download click
  btnBackup.addEventListener('click', () => {
    downloadBackup();
  });

  // ESC key for lightbox
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeLightbox();
    }
  });

  // Close lightbox click
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox || e.target.id === 'lightbox-close') {
      closeLightbox();
    }
  });
}

// Check if Node.js server is available
async function checkServerStatus() {
  try {
    const res = await fetch('/api/save-database', { method: 'OPTIONS' });
    isServerOnline = res.status === 204 || res.status === 200;
  } catch (e) {
    isServerOnline = false;
  }

  const dot = connectionStatus.querySelector('.status-dot');
  const text = connectionStatus.querySelector('.status-text');

  if (isServerOnline) {
    dot.className = 'status-dot online';
    text.textContent = 'Server Connected';
  } else {
    dot.className = 'status-dot offline';
    text.textContent = 'Local File Mode';
  }
}

// Load both V1 and V2 databases
async function loadDatabases() {
  assignerLoading.style.display = 'flex';
  syllabusLoading.style.display = 'flex';
  
  try {
    const [resV1, resV2] = await Promise.all([
      fetch('questions_db.json?t=' + Date.now()),
      fetch('questions_db_v2.json?t=' + Date.now())
    ]);

    if (!resV1.ok || !resV2.ok) {
      throw new Error(`Failed to load databases. (V1: ${resV1.status}, V2: ${resV2.status})`);
    }

    dbV1 = await resV1.json();
    dbV2 = await resV2.json();

    // Keep deep copies of original state to check if modified
    originalDbV1 = JSON.parse(JSON.stringify(dbV1));
    originalDbV2 = JSON.parse(JSON.stringify(dbV2));

    showToast('Success', 'Databases loaded successfully!', 'success');
    
    // Setup views
    buildTopicHelpers();
    populateFilters();
    applyFilters();
    renderSyllabus();
    updateStats();

  } catch (e) {
    console.error(e);
    showToast('Error Loading Database', e.message, 'danger');
    assignerLoading.innerHTML = `<span class="text-danger">Failed to load database. Ensure the JSON files exist in the same directory.</span>`;
  } finally {
    assignerLoading.style.display = 'none';
    syllabusLoading.style.display = 'none';
  }
}

// Build flat lookup list of topics
function buildTopicHelpers() {
  availableTopics = [];
  if (!dbV2 || !dbV2.chapters) return;

  dbV2.chapters.forEach(ch => {
    if (ch.topics) {
      ch.topics.forEach(t => {
        availableTopics.push({
          id: t.id,
          title: t.title,
          chapterTitle: ch.chapter_title,
          chapterNum: ch.chapter_num
        });
      });
    }
  });
}

// Populate Year and Topic filter dropdowns
function populateFilters() {
  // Years Filter
  const years = [...new Set(dbV2.questions.map(q => q.year))].sort((a, b) => b - a);
  filterYear.innerHTML = '<option value="all">All Years</option>';
  years.forEach(yr => {
    const opt = document.createElement('option');
    opt.value = yr;
    opt.textContent = yr;
    filterYear.appendChild(opt);
  });

  // Topics Filter
  filterTopic.innerHTML = '<option value="all">All Topics</option>';
  dbV2.chapters.forEach(ch => {
    const optGroup = document.createElement('optgroup');
    optGroup.label = `Chapter ${ch.chapter_num}: ${ch.chapter_title}`;
    
    if (ch.topics) {
      ch.topics.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `${t.id} - ${t.title}`;
        optGroup.appendChild(opt);
      });
    }
    filterTopic.appendChild(optGroup);
  });
}

// Update UI Statistics Panel
function updateStats() {
  if (!dbV2) return;
  const questions = dbV2.questions;
  const total = questions.length;
  
  // Calculate unclassified (those assigned to fallback topics or invalid topics)
  const validTopicIds = availableTopics.map(t => t.id);
  const unclassified = questions.filter(q => {
    return FALLBACK_TOPICS.includes(q.topic_id) || !validTopicIds.includes(q.topic_id);
  }).length;

  const classified = total - unclassified;

  statTotal.textContent = total;
  statClassified.textContent = classified;
  statUnclassified.textContent = unclassified;
  statChapters.textContent = dbV2.chapters.length;
}

// Tab Switching
function switchTab(tabId) {
  currentTab = tabId;
  
  // Update nav UI
  document.getElementById('tab-assigner').classList.toggle('active', tabId === 'assigner');
  document.getElementById('tab-syllabus').classList.toggle('active', tabId === 'syllabus');

  // Show/hide workspaces
  document.getElementById('sec-assigner').classList.toggle('active', tabId === 'assigner');
  document.getElementById('sec-syllabus').classList.toggle('active', tabId === 'syllabus');
  
  if (tabId === 'syllabus') {
    renderSyllabus();
  } else {
    // Re-sync filters in case syllabus structure changed
    const prevSelectedTopic = filterTopic.value;
    populateFilters();
    filterTopic.value = prevSelectedTopic;
    if (!filterTopic.value) filterTopic.value = 'all';
    applyFilters();
  }
}

// Mark Database state as modified (Dirty)
function markDirty() {
  isDirty = true;
  unsavedBadge.style.display = 'flex';
  btnUndo.disabled = false;
  
  if (isServerOnline) {
    btnSave.disabled = false;
  }
}

// Reset edits back to original loaded state
function resetEdits() {
  dbV1 = JSON.parse(JSON.stringify(originalDbV1));
  dbV2 = JSON.parse(JSON.stringify(originalDbV2));

  isDirty = false;
  unsavedBadge.style.display = 'none';
  btnUndo.disabled = true;
  btnSave.disabled = true;

  buildTopicHelpers();
  populateFilters();
  applyFilters();
  renderSyllabus();
  updateStats();
  
  showToast('Undo Successful', 'All edits have been discarded.', 'info');
}

// Apply Search & Filters to Question List
function applyFilters() {
  if (!dbV2) return;

  const searchVal = qSearch.value.trim().toLowerCase();
  const paperVal = filterPaper.value;
  const yearVal = filterYear.value;
  const topicVal = filterTopic.value;
  const statusVal = filterStatus.value;

  const validTopicIds = availableTopics.map(t => t.id);

  filteredQuestions = dbV2.questions.filter(q => {
    // Search
    if (searchVal) {
      const idMatch = q.id.toLowerCase().includes(searchVal);
      const textMatch = q.text.toLowerCase().includes(searchVal);
      const labelMatch = q.num_label.toLowerCase().includes(searchVal);
      const yearMatch = String(q.year).includes(searchVal);
      const paperMatch = q.paper.toLowerCase().includes(searchVal);
      if (!idMatch && !textMatch && !labelMatch && !yearMatch && !paperMatch) {
        return false;
      }
    }

    // Paper Filter
    if (paperVal !== 'all' && q.paper !== paperVal) return false;

    // Year Filter
    if (yearVal !== 'all' && String(q.year) !== yearVal) return false;

    // Topic Filter
    if (topicVal !== 'all' && q.topic_id !== topicVal) return false;

    // Status Filter
    if (statusVal !== 'all') {
      const isUnassigned = FALLBACK_TOPICS.includes(q.topic_id) || !validTopicIds.includes(q.topic_id);
      if (statusVal === 'unassigned' && !isUnassigned) return false;
      if (statusVal === 'assigned' && isUnassigned) return false;
    }

    return true;
  });

  renderQuestions();
}

// Render Question Cards with Pagination
function renderQuestions() {
  assignerList.innerHTML = '';
  
  if (filteredQuestions.length === 0) {
    assignerList.innerHTML = '<div class="no-results">No questions match your current filters.</div>';
    paginationInfo.textContent = 'Showing 0-0 of 0';
    pagPrev.disabled = true;
    pagNext.disabled = true;
    return;
  }

  // Calculate pages
  const totalItems = filteredQuestions.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  if (currentPage > totalPages) currentPage = Math.max(1, totalPages);

  const startIdx = (currentPage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, totalItems);

  paginationInfo.textContent = `Showing ${startIdx + 1}-${endIdx} of ${totalItems}`;
  pagCurrent.textContent = `Page ${currentPage} of ${totalPages}`;

  pagPrev.disabled = currentPage === 1;
  pagNext.disabled = currentPage === totalPages;

  const pageQuestions = filteredQuestions.slice(startIdx, endIdx);
  
  // Pre-generate dropdown options HTML for efficiency
  const dropdownOptionsHtml = buildTopicDropdownHtml();

  pageQuestions.forEach(q => {
    const card = document.createElement('div');
    card.className = 'question-card';
    card.dataset.id = q.id;

    // Images parsing
    let imagesHtml = '';
    if (q.images_q && q.images_q.length > 0) {
      q.images_q.forEach(img => {
        // Replace backslashes
        const normalizedImg = img.replace(/\\/g, '/');
        imagesHtml += `
          <div class="img-container" onclick="openLightbox('${normalizedImg}', '${q.id} - ${q.num_label}')">
            <img src="${normalizedImg}" alt="Question Image">
            <span class="img-zoom-hint">Click to Zoom</span>
          </div>
        `;
      });
    }

    // Determine current assignment style class
    const validTopicIds = availableTopics.map(t => t.id);
    const isFallback = FALLBACK_TOPICS.includes(q.topic_id) || !validTopicIds.includes(q.topic_id);
    const selectClass = isFallback ? 'fallback-selected' : 'custom-selected';

    card.innerHTML = `
      <div class="card-header">
        <div class="card-meta">
          <span class="badge badge-paper">${q.paper}</span>
          <span class="badge badge-year">${q.year}</span>
          <span class="badge badge-session">${q.session} (${q.variant})</span>
          <span class="card-qid">${q.id}</span>
        </div>
        <div class="card-marks">${q.marks ? `${q.marks} Marks` : ''}</div>
      </div>
      <div class="card-body">
        <div class="question-text">${q.text}</div>
        ${imagesHtml ? `<div class="question-images">${imagesHtml}</div>` : ''}
      </div>
      <div class="card-footer">
        <span class="card-qid">Label: <strong>${q.num_label}</strong></span>
        <div class="assignment-controls">
          <label>Topical Chapter & Topic:</label>
          <select class="topic-select-picker ${selectClass}" data-qid="${q.id}" onchange="changeQuestionTopic(this)">
            ${dropdownOptionsHtml}
          </select>
        </div>
      </div>
    `;

    // Set value in dropdown
    const selectEl = card.querySelector('.topic-select-picker');
    selectEl.value = q.topic_id;
    // Fallback if the saved topic ID is not in syllabus
    if (selectEl.value !== q.topic_id) {
      const fallbackOpt = document.createElement('option');
      fallbackOpt.value = q.topic_id;
      fallbackOpt.textContent = `[INVALID] ${q.topic_id} (Unmapped)`;
      selectEl.appendChild(fallbackOpt);
      selectEl.value = q.topic_id;
    }

    assignerList.appendChild(card);
  });
}

// Generate categorised select list grouped by chapter
function buildTopicDropdownHtml() {
  let html = '';
  if (!dbV2 || !dbV2.chapters) return html;

  dbV2.chapters.forEach(ch => {
    html += `<optgroup label="Chapter ${ch.chapter_num}: ${ch.chapter_title}">`;
    if (ch.topics) {
      ch.topics.forEach(t => {
        html += `<option value="${t.id}">${t.id} - ${t.title}</option>`;
      });
    }
    html += `</optgroup>`;
  });
  return html;
}

// Pagination Controls
function prevPage() {
  if (currentPage > 1) {
    currentPage--;
    renderQuestions();
    assignerList.parentElement.scrollTop = 0;
  }
}

function nextPage() {
  const totalItems = filteredQuestions.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  if (currentPage < totalPages) {
    currentPage++;
    renderQuestions();
    assignerList.parentElement.scrollTop = 0;
  }
}

// Handle assignment picker change in UI
function changeQuestionTopic(selectElement) {
  const qid = selectElement.getAttribute('data-qid');
  const newTopicId = selectElement.value;
  
  // 1. Update working copy dbV2
  const questionV2 = dbV2.questions.find(q => q.id === qid);
  if (!questionV2) return;
  
  const originalTopicId = originalDbV2.questions.find(q => q.id === qid).topic_id;
  questionV2.topic_id = newTopicId;

  // 2. Synchronize to dbV1 matching by metadata
  // Get identifying credentials of the question
  const { year, session, paper, variant, num_label } = questionV2;
  const questionV1 = dbV1.questions.find(q => {
    return q.year === year &&
           q.session === session &&
           q.paper === paper &&
           q.variant === variant &&
           q.num_label === num_label;
  });

  if (questionV1) {
    questionV1.topic_id = newTopicId;
  }

  // 3. CSS UI Updates
  const validTopicIds = availableTopics.map(t => t.id);
  const isFallback = FALLBACK_TOPICS.includes(newTopicId) || !validTopicIds.includes(newTopicId);
  selectElement.className = `topic-select-picker ${isFallback ? 'fallback-selected' : 'custom-selected'}`;

  // Check if dirty
  if (newTopicId !== originalTopicId) {
    markDirty();
  } else {
    // Recalculate global dirty by comparison of all question assignments
    checkIfStateIsDirty();
  }

  updateStats();
}

// Check if memory matches original copy to toggle dirty buttons
function checkIfStateIsDirty() {
  let dirty = false;
  
  // Check chapters structure
  if (JSON.stringify(dbV2.chapters) !== JSON.stringify(originalDbV2.chapters)) {
    dirty = true;
  }
  
  // Check question topic assignments
  if (!dirty) {
    for (let i = 0; i < dbV2.questions.length; i++) {
      if (dbV2.questions[i].topic_id !== originalDbV2.questions[i].topic_id) {
        dirty = true;
        break;
      }
    }
  }

  isDirty = dirty;
  unsavedBadge.style.display = isDirty ? 'flex' : 'none';
  btnUndo.disabled = !isDirty;
  btnSave.disabled = !isDirty || !isServerOnline;
}

// ==========================================================================
// SYLLABUS MANAGER LOGIC
// ==========================================================================

function renderSyllabus() {
  syllabusTree.innerHTML = '';
  if (!dbV2 || !dbV2.chapters) return;

  dbV2.chapters.forEach((ch, chIdx) => {
    const chapterCard = document.createElement('div');
    chapterCard.className = 'chapter-node';
    chapterCard.dataset.index = chIdx;

    // Topics list container HTML
    let topicsHtml = '';
    if (ch.topics && ch.topics.length > 0) {
      ch.topics.forEach((t, tIdx) => {
        let tagsHtml = '';
        if (t.keywords) {
          t.keywords.forEach((kw, kwIdx) => {
            tagsHtml += `
              <span class="keyword-tag" data-kw-idx="${kwIdx}">
                <span>${kw}</span>
                <button class="remove-tag-btn" onclick="removeKeyword(${chIdx}, ${tIdx}, ${kwIdx})">&times;</button>
              </span>
            `;
          });
        }

        topicsHtml += `
          <div class="topic-node" data-index="${tIdx}">
            <div class="topic-row-main">
              <div class="topic-meta-edit">
                <input type="text" class="topic-id-input" value="${t.id}" onchange="editTopicId(${chIdx}, ${tIdx}, this)" title="Edit Topic Code ID (must be unique)">
                <input type="text" class="topic-title-input" value="${t.title}" onchange="editTopicTitle(${chIdx}, ${tIdx}, this)" placeholder="Topic Title..." title="Edit Topic Title">
              </div>
              <button class="btn-icon delete-btn" onclick="deleteTopic(${chIdx}, ${tIdx})" title="Delete Topic">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
              </button>
            </div>
            
            <div class="keywords-area">
              <span class="keywords-label">Keywords for Automatic Classifier</span>
              <div class="keywords-tags">
                ${tagsHtml}
                <div class="add-tag-box">
                  <input type="text" class="add-tag-input" placeholder="New keyword..." onkeypress="handleKeywordKeyPress(event, ${chIdx}, ${tIdx})">
                  <button class="add-tag-btn" onclick="addKeyword(${chIdx}, ${tIdx}, this.previousElementSibling)">Add</button>
                </div>
              </div>
            </div>
          </div>
        `;
      });
    }

    chapterCard.innerHTML = `
      <div class="chapter-header" onclick="toggleChapterCollapse(this.parentElement)">
        <div class="chapter-info" onclick="event.stopPropagation()">
          <span class="chapter-number">Ch ${ch.chapter_num}</span>
          <input type="text" class="chapter-title-input" value="${ch.chapter_title}" onchange="editChapterTitle(${chIdx}, this)" placeholder="Chapter Title...">
        </div>
        <div class="chapter-actions-inline" onclick="event.stopPropagation()">
          <button class="action-btn secondary-btn" style="padding: 4px 8px; font-size:0.75rem;" onclick="addNewTopic(${chIdx})" title="Add Topic inside this Chapter">
            + Add Topic
          </button>
          <button class="btn-icon delete-btn" onclick="deleteChapter(${chIdx})" title="Delete Chapter">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          </button>
          <span class="btn-icon chapter-toggle-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </span>
        </div>
      </div>
      <div class="chapter-content">
        <div class="topic-list">
          ${topicsHtml || '<div style="font-size:0.85rem; color:var(--text-muted); text-align:center; padding:12px 0;">No topics in this chapter yet.</div>'}
        </div>
      </div>
    `;

    syllabusTree.appendChild(chapterCard);
  });
}

function toggleChapterCollapse(chapterNode) {
  chapterNode.classList.toggle('collapsed');
}

// Edit Chapter Title
function editChapterTitle(chIdx, inputElement) {
  const newTitle = inputElement.value.trim();
  if (!newTitle) return;
  dbV2.chapters[chIdx].chapter_title = newTitle;
  buildTopicHelpers();
  markDirty();
}

// Add New Chapter
function addNewChapter() {
  const nextChNum = dbV2.chapters.reduce((max, c) => Math.max(max, c.chapter_num), 0) + 1;
  const newCh = {
    chapter_num: nextChNum,
    chapter_title: `New Chapter ${nextChNum}`,
    topics: []
  };
  
  dbV2.chapters.push(newCh);
  buildTopicHelpers();
  renderSyllabus();
  markDirty();
  
  // Auto scroll to bottom
  const container = document.querySelector('.syllabus-tree-container');
  container.scrollTop = container.scrollHeight;
}

// Delete Chapter
function deleteChapter(chIdx) {
  const chapter = dbV2.chapters[chIdx];
  const topicIds = chapter.topics.map(t => t.id);

  // Check if questions are assigned to any topics in this chapter
  const affectedQCount = dbV2.questions.filter(q => topicIds.includes(q.topic_id)).length;
  
  let msg = `Are you sure you want to delete Chapter ${chapter.chapter_num}: "${chapter.chapter_title}"?`;
  if (affectedQCount > 0) {
    msg += `\n\nWARNING: There are ${affectedQCount} questions currently assigned to topics within this chapter. If deleted, they will fall back to default classification.`;
  }

  if (confirm(msg)) {
    // Delete
    dbV2.chapters.splice(chIdx, 1);
    buildTopicHelpers();
    renderSyllabus();
    markDirty();
    updateStats();
    showToast('Chapter Deleted', 'Chapter removed successfully.', 'warning');
  }
}

// Add New Topic inside Chapter
function addNewTopic(chIdx) {
  const chapter = dbV2.chapters[chIdx];
  const topicsCount = chapter.topics.length;
  
  // Try to generate unique ID, e.g. "ChNum.TopicIndex"
  let newTopicId = `${chapter.chapter_num}.${topicsCount + 1}`;
  
  // Make sure topic ID doesn't already exist
  const existingIds = availableTopics.map(t => t.id);
  let counter = 1;
  while (existingIds.includes(newTopicId)) {
    newTopicId = `${chapter.chapter_num}.${topicsCount + counter}`;
    counter++;
  }

  const newTopic = {
    id: newTopicId,
    title: `New Topic ${newTopicId}`,
    keywords: []
  };

  chapter.topics.push(newTopic);
  buildTopicHelpers();
  renderSyllabus();
  markDirty();

  // Highlight and focus the new topic title
  setTimeout(() => {
    const chCards = document.querySelectorAll('.chapter-node');
    const newChCard = chCards[chIdx];
    // Expand if collapsed
    newChCard.classList.remove('collapsed');
    const inputs = newChCard.querySelectorAll('.topic-title-input');
    const lastInput = inputs[inputs.length - 1];
    if (lastInput) {
      lastInput.focus();
      lastInput.select();
    }
  }, 100);
}

// Edit Topic ID Code
function editTopicId(chIdx, tIdx, inputElement) {
  const oldId = dbV2.chapters[chIdx].topics[tIdx].id;
  const newId = inputElement.value.trim();
  
  if (!newId) {
    inputElement.value = oldId;
    return;
  }

  // Ensure unique ID
  const otherTopicIds = availableTopics.filter(t => t.id !== oldId).map(t => t.id);
  if (otherTopicIds.includes(newId)) {
    showToast('Duplicate ID', `The topic ID "${newId}" is already in use. Please choose a unique ID.`, 'danger');
    inputElement.value = oldId;
    return;
  }

  // Confirm changes if questions are affected
  const affectedQCount = dbV2.questions.filter(q => q.topic_id === oldId).length;
  if (affectedQCount > 0) {
    if (!confirm(`Changing ID from "${oldId}" to "${newId}" will update topic references in ${affectedQCount} questions. Proceed?`)) {
      inputElement.value = oldId;
      return;
    }
    
    // Update references in working DB copies
    dbV2.questions.forEach(q => { if (q.topic_id === oldId) q.topic_id = newId; });
    dbV1.questions.forEach(q => { if (q.topic_id === oldId) q.topic_id = newId; });
  }

  dbV2.chapters[chIdx].topics[tIdx].id = newId;
  buildTopicHelpers();
  markDirty();
  updateStats();
  
  // Re-sync input UI
  inputElement.value = newId;
}

// Edit Topic Title
function editTopicTitle(chIdx, tIdx, inputElement) {
  const newTitle = inputElement.value.trim();
  if (!newTitle) return;
  dbV2.chapters[chIdx].topics[tIdx].title = newTitle;
  buildTopicHelpers();
  markDirty();
}

// Delete Topic
function deleteTopic(chIdx, tIdx) {
  const chapter = dbV2.chapters[chIdx];
  const topic = chapter.topics[tIdx];
  
  const affectedQCount = dbV2.questions.filter(q => q.topic_id === topic.id).length;
  let msg = `Are you sure you want to delete Topic ${topic.id}: "${topic.title}"?`;
  if (affectedQCount > 0) {
    msg += `\n\nWARNING: There are ${affectedQCount} questions assigned to this topic. They will fall back to default classification.`;
  }

  if (confirm(msg)) {
    chapter.topics.splice(tIdx, 1);
    buildTopicHelpers();
    renderSyllabus();
    markDirty();
    updateStats();
    showToast('Topic Deleted', 'Topic removed successfully.', 'warning');
  }
}

// Tags handling - Remove Keyword
function removeKeyword(chIdx, tIdx, kwIdx) {
  const topic = dbV2.chapters[chIdx].topics[tIdx];
  topic.keywords.splice(kwIdx, 1);
  renderSyllabus();
  markDirty();
}

// Tags handling - Key Press
function handleKeywordKeyPress(event, chIdx, tIdx) {
  if (event.key === 'Enter') {
    addKeyword(chIdx, tIdx, event.target);
  }
}

// Tags handling - Add Keyword
function addKeyword(chIdx, tIdx, inputElement) {
  const val = inputElement.value.trim().toLowerCase();
  if (!val) return;
  
  const topic = dbV2.chapters[chIdx].topics[tIdx];
  if (!topic.keywords) topic.keywords = [];

  // Prevent duplicates
  if (topic.keywords.includes(val)) {
    showToast('Duplicate Keyword', 'Keyword already exists.', 'warning');
    inputElement.value = '';
    return;
  }

  topic.keywords.push(val);
  inputElement.value = '';
  renderSyllabus();
  markDirty();
}

// ==========================================================================
// PERSISTENCE AND BACKUP SYSTEM
// ==========================================================================

// Save JSON databases to Node.js local storage
async function saveDatabaseToServer() {
  if (!isDirty || !isServerOnline) return;

  btnSave.disabled = true;
  const originalText = btnSave.innerHTML;
  btnSave.innerHTML = `<span>Saving...</span>`;

  // Deep sync chapters before writing
  dbV1.chapters = JSON.parse(JSON.stringify(dbV2.chapters));

  try {
    const response = await fetch('/api/save-database', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        v1: dbV1,
        v2: dbV2
      })
    });

    const result = await response.json();
    if (result.success) {
      showToast('Database Saved!', 'Database JSON files updated on disk.', 'success');
      
      // Update original benchmark copy
      originalDbV1 = JSON.parse(JSON.stringify(dbV1));
      originalDbV2 = JSON.parse(JSON.stringify(dbV2));
      
      isDirty = false;
      unsavedBadge.style.display = 'none';
      btnUndo.disabled = true;
    } else {
      throw new Error(result.error || 'Server rejected changes');
    }

  } catch (err) {
    console.error(err);
    showToast('Save Failed', err.message, 'danger');
    btnSave.disabled = false;
  } finally {
    btnSave.innerHTML = originalText;
  }
}

// Download local JSON files fallback
function downloadBackup() {
  // Deep sync chapters
  dbV1.chapters = JSON.parse(JSON.stringify(dbV2.chapters));

  // Trigger two individual browser downloads
  downloadFile(dbV1, 'questions_db.json');
  
  setTimeout(() => {
    downloadFile(dbV2, 'questions_db_v2.json');
  }, 300);

  showToast('Download Started', 'Downloading DB JSON backups to Downloads folder.', 'info');
}

function downloadFile(jsonObject, filename) {
  const blob = new Blob([JSON.stringify(jsonObject, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ==========================================================================
// LIGHTBOX / IMAGES ZOOM SYSTEM
// ==========================================================================

function openLightbox(src, title) {
  lightboxImg.src = src;
  document.getElementById('lightbox-caption').textContent = title;
  lightbox.style.display = 'flex';
}

function closeLightbox() {
  lightbox.style.display = 'none';
}

// ==========================================================================
// TOAST NOTIFICATIONS HELPER
// ==========================================================================

function showToast(title, message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  toast.innerHTML = `
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;
  
  container.appendChild(toast);
  
  // Trigger transition
  setTimeout(() => toast.classList.add('show'), 10);
  
  // Auto remove after 4 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
