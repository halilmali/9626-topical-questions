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
let pendingRemovedImages = new Set();

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
const statMissingMs = document.getElementById('stat-missing-ms');
const statConfirmed = document.getElementById('stat-confirmed');
const statUnclassifiedDetail = document.getElementById('stat-unclassified-detail');

const filterPaper = document.getElementById('filter-paper');
const filterYear = document.getElementById('filter-year');
const filterTopic = document.getElementById('filter-topic');
const filterStatus = document.getElementById('filter-status');
const filterMs = document.getElementById('filter-ms');
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
const VALID_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];

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
  filterMs.addEventListener('change', () => { currentPage = 1; applyFilters(); });
  
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
    if (e.key === 'Escape' && lightbox && lightbox.style.display === 'flex') {
      closeLightbox();
    }
  });

  // Lightbox dragging and wheel scroll zoom
  let wasDragged = false;
  let downX = 0, downY = 0;
  const content = document.getElementById('lightbox-content');

  if (content && lightboxImg) {
    content.addEventListener('mousedown', (e) => {
      if (zoomState.mode === 'fit') return;
      e.preventDefault();
      
      isDragging = true;
      wasDragged = false;
      content.classList.add('dragging');
      
      downX = e.pageX;
      downY = e.pageY;
      startX = e.pageX - content.offsetLeft;
      startY = e.pageY - content.offsetTop;
      scrollLeft = content.scrollLeft;
      scrollTop = content.scrollTop;
    });

    content.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      e.preventDefault();
      
      const x = e.pageX - content.offsetLeft;
      const y = e.pageY - content.offsetTop;
      const walkX = x - startX;
      const walkY = y - startY;
      
      content.scrollLeft = scrollLeft - walkX;
      content.scrollTop = scrollTop - walkY;
      
      const dist = Math.hypot(e.pageX - downX, e.pageY - downY);
      if (dist > 5) {
        wasDragged = true;
      }
    });

    content.addEventListener('mouseup', () => {
      isDragging = false;
      content.classList.remove('dragging');
    });

    content.addEventListener('mouseleave', () => {
      isDragging = false;
      content.classList.remove('dragging');
    });

    // Touch events for mobile/tablet panning
    content.addEventListener('touchstart', (e) => {
      if (zoomState.mode === 'fit') return;
      isDragging = true;
      wasDragged = false;
      const touch = e.touches[0];
      downX = touch.pageX;
      downY = touch.pageY;
      startX = touch.pageX - content.offsetLeft;
      startY = touch.pageY - content.offsetTop;
      scrollLeft = content.scrollLeft;
      scrollTop = content.scrollTop;
    });

    content.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      const x = touch.pageX - content.offsetLeft;
      const y = touch.pageY - content.offsetTop;
      const walkX = x - startX;
      const walkY = y - startY;
      
      content.scrollLeft = scrollLeft - walkX;
      content.scrollTop = scrollTop - walkY;
      
      const dist = Math.hypot(touch.pageX - downX, touch.pageY - downY);
      if (dist > 5) {
        wasDragged = true;
      }
    });

    content.addEventListener('touchend', () => {
      isDragging = false;
    });


  }

  if (lightboxImg) {
    lightboxImg.onclick = (e) => {
      e.stopPropagation();
      if (wasDragged) return; // Prevent zooming if we just finished a drag
      toggleImageZoom();
    };
  }

  // Floating Zoom Toolbar Handlers
  const zoomInBtn = document.getElementById('zoom-in-btn');
  const zoomOutBtn = document.getElementById('zoom-out-btn');
  const zoomResetBtn = document.getElementById('zoom-reset-btn');
  const closeBtn = document.getElementById('lightbox-close-btn');

  if (zoomInBtn) zoomInBtn.onclick = (e) => { e.stopPropagation(); zoomIn(); };
  if (zoomOutBtn) zoomOutBtn.onclick = (e) => { e.stopPropagation(); zoomOut(); };
  if (zoomResetBtn) zoomResetBtn.onclick = (e) => { e.stopPropagation(); zoomReset(); };
  if (closeBtn) closeBtn.onclick = (e) => { e.stopPropagation(); closeLightbox(); };

  if (lightbox) {
    lightbox.onclick = (e) => {
      if (wasDragged) return; // Ignore drag clicks
      // Close only if clicking the background, NOT on image, toolbar, or caption
      const clickedImage = e.target.closest('#lightbox-img');
      const clickedToolbar = e.target.closest('#lightbox-toolbar');
      const clickedCaption = e.target.closest('#lightbox-caption');
      
      if (!clickedImage && !clickedToolbar && !clickedCaption) {
        closeLightbox();
      }
    };
  }
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
  const unclassifiedQ = questions.filter(q => {
    return FALLBACK_TOPICS.includes(q.topic_id) || !validTopicIds.includes(q.topic_id);
  });
  const unclassified = unclassifiedQ.length;
  const classified = total - unclassified;

  // Missing MS Images count
  const missingMs = questions.filter(q => !(q.images_ms && q.images_ms.length > 0)).length;

  // Confirmed topic count
  const confirmed = questions.filter(q => q.topic_confirmed === true).length;

  statTotal.textContent = total;
  statClassified.textContent = classified;
  statUnclassified.textContent = unclassified;
  statMissingMs.textContent = missingMs;
  statChapters.textContent = dbV2.chapters.length;
  
  if (statConfirmed) statConfirmed.textContent = confirmed;
  
  // Unclassified breakdown by fallback topic
  const statFallbackRow = document.getElementById('stat-fallback-row');
  
  if (statUnclassifiedDetail) {
    const byTopic = {};
    unclassifiedQ.forEach(q => {
      byTopic[q.topic_id] = (byTopic[q.topic_id] || 0) + 1;
    });
    
    const sorted = Object.entries(byTopic).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      statUnclassifiedDetail.innerHTML = sorted.slice(0, 5).map(([tid, count]) => 
        `<span class="stat-fallback-chip">${tid}: ${count}</span>`
      ).join(' ');
      statUnclassifiedDetail.style.display = 'block';
      if (statFallbackRow) statFallbackRow.style.display = 'flex';
    } else {
      statUnclassifiedDetail.style.display = 'none';
      if (statFallbackRow) statFallbackRow.style.display = 'none';
    }
  } else if (statFallbackRow) {
    statFallbackRow.style.display = 'none';
  }
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
  pendingRemovedImages.clear();

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
  const msVal = filterMs.value;

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
      if (statusVal === 'confirmed' && q.topic_confirmed !== true) return false;
      if (statusVal === 'unconfirmed' && q.topic_confirmed === true) return false;
    }

    // MS Status Filter
    if (msVal !== 'all') {
      const hasMs = q.images_ms && q.images_ms.length > 0;
      if (msVal === 'present' && !hasMs) return false;
      if (msVal === 'missing' && hasMs) return false;
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

  // Helper to escape strings for HTML attribute use
  const escAttr = (str) => str.replace(/'/g, "&apos;").replace(/"/g, "&quot;");

  pageQuestions.forEach(q => {
    const card = document.createElement('div');
    card.className = 'question-card';
    card.dataset.id = q.id;

    // Images parsing - with edit controls for both question and mark scheme images
    let imagesHtml = '';
    
    // Question Images
    if (q.images_q && q.images_q.length > 0) {
      imagesHtml += `<div class="img-edit-group"><div class="img-edit-label">Question Images:</div><div class="img-edit-grid">`;
      q.images_q.forEach((img, idx) => {
        const normalizedImg = img.replace(/\\/g, '/');
        imagesHtml += `
          <div class="img-edit-item">
            <div class="img-container" onclick="openLightbox('${escAttr(normalizedImg)}', '${escAttr(q.year + ' ' + q.session + ' ' + q.paper + ' (Var ' + q.variant + ') - Q' + q.num_label)}')">
              <img src="${escAttr(normalizedImg)}" alt="Question Image">
              <span class="img-zoom-hint">Click to Zoom</span>
            </div>
            <button class="img-remove-btn" onclick="removeImage('${q.id}','images_q',${idx})" title="Remove this image">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        `;
      });
      imagesHtml += `</div></div>`;
    }
    
    // Mark Scheme Images
    if (q.images_ms && q.images_ms.length > 0) {
      imagesHtml += `<div class="img-edit-group"><div class="img-edit-label">Mark Scheme Images:</div><div class="img-edit-grid">`;
      q.images_ms.forEach((img, idx) => {
        const normalizedImg = img.replace(/\\/g, '/');
        imagesHtml += `
          <div class="img-edit-item">
            <div class="img-container" onclick="openLightbox('${escAttr(normalizedImg)}', '${escAttr(q.year + ' ' + q.session + ' ' + q.paper + ' (Var ' + q.variant + ') - Q' + q.num_label + ' - MS')}')">
              <img src="${escAttr(normalizedImg)}" alt="Mark Scheme Image">
              <span class="img-zoom-hint">Click to Zoom</span>
            </div>
            <button class="img-remove-btn" onclick="removeImage('${q.id}','images_ms',${idx})" title="Remove this image">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        `;
      });
      imagesHtml += `</div></div>`;
    }
    
    // Add image controls
    imagesHtml += `
      <div class="img-add-controls">
        <div class="img-add-row">
          <span class="img-add-label">Add Question Image:</span>
          <input type="text" class="img-add-input" placeholder="Path to image file..." data-qid="${q.id}" data-type="images_q">
          <button class="img-add-btn" onclick="addImageFromInput(this.previousElementSibling)">Add</button>
        </div>
        <div class="img-add-row">
          <span class="img-add-label">Add Mark Scheme Image:</span>
          <input type="text" class="img-add-input" placeholder="Path to image file..." data-qid="${q.id}" data-type="images_ms">
          <button class="img-add-btn" onclick="addImageFromInput(this.previousElementSibling)">Add</button>
        </div>
      </div>
    `;

    // Paper links (QP & MS PDF)
    const qpUrl = q.qp_path ? (q.qp_path + (q.qp_page ? `#page=${q.qp_page}` : '')) : null;
    const msUrl = q.ms_path ? (q.ms_path + (q.ms_page ? `#page=${q.ms_page}` : '')) : null;
    
    let paperLinksHtml = `
      <div class="paper-links-section">
        <div class="paper-links-bar">
          ${qpUrl ? `<a href="${escAttr(qpUrl)}" target="_blank" class="paper-link" title="Open question paper PDF">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            QP PDF</a>` : `<span class="paper-link disabled">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            QP PDF</span>`}
          ${msUrl ? `<a href="${escAttr(msUrl)}" target="_blank" class="paper-link" title="Open mark scheme PDF">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            MS PDF</a>` : `<span class="paper-link disabled">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            MS PDF</span>`}
        </div>
        <div class="paper-edit-fields">
          <div class="paper-field-row">
            <span class="paper-field-label">QP Path:</span>
            <input type="text" class="paper-field-input" value="${escAttr(q.qp_path || '')}" placeholder="Path to QP PDF..." data-qid="${q.id}" data-field="qp_path" onchange="updatePaperLink(this)">
            <span class="paper-field-label">Page:</span>
            <input type="number" class="paper-field-input paper-field-page" value="${q.qp_page !== null && q.qp_page !== undefined ? q.qp_page : ''}" placeholder="-" data-qid="${q.id}" data-field="qp_page" onchange="updatePaperLink(this)" min="1">
          </div>
          <div class="paper-field-row">
            <span class="paper-field-label">MS Path:</span>
            <input type="text" class="paper-field-input" value="${escAttr(q.ms_path || '')}" placeholder="Path to MS PDF..." data-qid="${q.id}" data-field="ms_path" onchange="updatePaperLink(this)">
            <span class="paper-field-label">Page:</span>
            <input type="number" class="paper-field-input paper-field-page" value="${q.ms_page !== null && q.ms_page !== undefined ? q.ms_page : ''}" placeholder="-" data-qid="${q.id}" data-field="ms_page" onchange="updatePaperLink(this)" min="1">
          </div>
        </div>
      </div>
    `;

    // Determine current assignment style class
    const validTopicIds = availableTopics.map(t => t.id);
    const isFallback = FALLBACK_TOPICS.includes(q.topic_id) || !validTopicIds.includes(q.topic_id);
    const selectClass = isFallback ? 'fallback-selected' : 'custom-selected';
    
    // Determine confirm status
    const isConfirmed = q.topic_confirmed === true;
    const confirmBtnClass = isConfirmed ? 'confirm-btn confirmed' : 'confirm-btn';
    const confirmBtnHtml = isConfirmed 
      ? `<span class="confirm-btn confirmed" title="Topic confirmed - click to unconfirm">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          Confirmed
         </span>`
      : `<button class="confirm-btn" onclick="confirmTopic('${q.id}')" title="Mark this topic assignment as confirmed">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          Confirm Topic
         </button>`;

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
        <div class="footer-left">
          <span class="card-qid">Label: <strong>${q.num_label}</strong></span>
          ${paperLinksHtml}
        </div>
        <div class="assignment-controls">
          <label>Topic:</label>
          <select class="topic-select-picker ${selectClass}" data-qid="${q.id}" onchange="changeQuestionTopic(this)">
            ${dropdownOptionsHtml}
          </select>
          ${confirmBtnHtml}
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
  
  // Auto-clear confirmation when topic changes
  if (questionV2.topic_confirmed === true) {
    questionV2.topic_confirmed = false;
  }

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

// ==========================================================================
// TOPIC CONFIRMATION SYSTEM
// ==========================================================================

// Confirm a question's topic assignment
function confirmTopic(qid) {
  const q = dbV2.questions.find(x => x.id === qid);
  if (!q) return;
  
  q.topic_confirmed = true;
  
  // Sync to dbV1
  const v1q = dbV1.questions.find(x => {
    return x.year === q.year && x.session === q.session && x.paper === q.paper &&
           x.variant === q.variant && x.num_label === q.num_label;
  });
  if (v1q) v1q.topic_confirmed = true;
  
  markDirty();
  applyFilters();
  showToast('Topic Confirmed', 'Topic assignment marked as confirmed.', 'success');
}

// ==========================================================================
// PAPER LINK MANAGEMENT
// ==========================================================================

// Update a paper link field (qp_path, qp_page, ms_path, ms_page)
function updatePaperLink(inputEl) {
  const qid = inputEl.getAttribute('data-qid');
  const field = inputEl.getAttribute('data-field');
  const value = inputEl.value.trim();
  
  const question = dbV2.questions.find(q => q.id === qid);
  if (!question) return;
  
  const oldValue = question[field];
  
  // Parse numeric fields appropriately
  if (field === 'qp_page' || field === 'ms_page') {
    const parsed = value ? parseInt(value, 10) : null;
    if (parsed !== null && isNaN(parsed)) {
      showToast('Invalid Page', 'Page number must be a numeric value.', 'warning');
      inputEl.value = oldValue !== null && oldValue !== undefined ? oldValue : '';
      return;
    }
    question[field] = parsed;
  } else {
    question[field] = value || null;
  }
  
  // Skip if value didn't actually change
  if (question[field] === oldValue) return;
  
  // Sync to dbV1
  const { year, session, paper, variant, num_label } = question;
  const questionV1 = dbV1.questions.find(q => {
    return q.year === year &&
           q.session === session &&
           q.paper === paper &&
           q.variant === variant &&
           q.num_label === num_label;
  });
  if (questionV1) {
    questionV1[field] = question[field];
  }
  
  markDirty();
  
  // Only show toast for path changes (page number changes are minor)
  if (field === 'qp_path' || field === 'ms_path') {
    showToast('Link Updated', `${field} has been updated for this question.`, 'info');
  }
}

// ==========================================================================
// IMAGE MANAGEMENT
// ==========================================================================

// Remove an image from a question's image array
function removeImage(qid, type, index) {
  if (!confirm('Remove this image from the question and archive the file when changes are saved?')) return;
  
  const question = dbV2.questions.find(q => q.id === qid);
  if (!question || !question[type]) return;
  
  // Remove the reference now and archive the source file on save.
  const [removedImage] = question[type].splice(index, 1);
  if (removedImage) pendingRemovedImages.add(removedImage);
  
  // Sync to dbV1
  const { year, session, paper, variant, num_label } = question;
  const questionV1 = dbV1.questions.find(q => {
    return q.year === year &&
           q.session === session &&
           q.paper === paper &&
           q.variant === variant &&
           q.num_label === num_label;
  });
  if (questionV1) {
    questionV1[type] = [...question[type]];
  }
  
  markDirty();
  applyFilters(); // Re-render to update UI
  showToast('Image Removed', 'Image will be archived when changes are saved.', 'info');
}

// Add a new image from the input field
function addImageFromInput(inputEl) {
  const qid = inputEl.getAttribute('data-qid');
  const type = inputEl.getAttribute('data-type');
  const path = inputEl.value.trim();
  
  if (!path) {
    showToast('No Path', 'Please enter a file path for the image.', 'warning');
    return;
  }
  
  // Validate file extension
  const hasValidExtension = VALID_IMAGE_EXTS.some(ext => path.toLowerCase().endsWith(ext));
  if (!hasValidExtension) {
    showToast('Invalid Path', 'Please enter a path to an image file (jpg, png, gif, webp, etc.).', 'warning');
    return;
  }
  
  const question = dbV2.questions.find(q => q.id === qid);
  if (!question) return;
  
  // Initialize array if needed
  if (!question[type]) question[type] = [];
  
  // Normalize path separators to backslashes (consistent with existing data)
  const normalizedPath = path.replace(/\//g, '\\');
  pendingRemovedImages.delete(normalizedPath);
  
  // Add the image path
  question[type].push(normalizedPath);
  
  // Sync to dbV1
  const { year, session, paper, variant, num_label } = question;
  const questionV1 = dbV1.questions.find(q => {
    return q.year === year &&
           q.session === session &&
           q.paper === paper &&
           q.variant === variant &&
           q.num_label === num_label;
  });
  if (questionV1) {
    if (!questionV1[type]) questionV1[type] = [];
    questionV1[type] = [...question[type]];
  }
  
  markDirty();
  inputEl.value = ''; // Clear input
  applyFilters(); // Re-render to update UI
  showToast('Image Added', 'Image path has been added to the question.', 'success');
}

// Check if memory matches original copy to toggle dirty buttons
function checkIfStateIsDirty() {
  let dirty = false;
  
  // Check chapters structure
  if (JSON.stringify(dbV2.chapters) !== JSON.stringify(originalDbV2.chapters)) {
    dirty = true;
  }
  
  // Check question properties (topic_id, images, paper links, and confirmation)
  if (!dirty) {
    for (let i = 0; i < dbV2.questions.length; i++) {
      const curr = dbV2.questions[i];
      const orig = originalDbV2.questions[i];
      if (curr.topic_id !== orig.topic_id ||
          JSON.stringify(curr.images_q) !== JSON.stringify(orig.images_q) ||
          JSON.stringify(curr.images_ms) !== JSON.stringify(orig.images_ms) ||
          curr.qp_path !== orig.qp_path ||
          curr.qp_page !== orig.qp_page ||
          curr.ms_path !== orig.ms_path ||
          curr.ms_page !== orig.ms_page ||
          curr.topic_confirmed !== orig.topic_confirmed) {
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

    // Count missing MS images for this chapter
    const chapterTopicIds = (ch.topics || []).map(t => t.id);
    const chapterQuestions = dbV2.questions.filter(q => chapterTopicIds.includes(q.topic_id));
    const chapterTotal = chapterQuestions.length;
    const chapterMissingMs = chapterQuestions.filter(q => !(q.images_ms && q.images_ms.length > 0)).length;

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
          ${chapterMissingMs > 0 ? `<span class="chapter-ms-stat">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            ${chapterMissingMs}/${chapterTotal} missing MS
          </span>` : ''}
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
        v2: dbV2,
        removedImages: [...pendingRemovedImages]
      })
    });

    const result = await response.json();
    if (result.success) {
      const archivedCount = result.archivedImages?.length || 0;
      const message = archivedCount
        ? `Database updated and ${archivedCount} image${archivedCount === 1 ? '' : 's'} archived.`
        : 'Database JSON files updated on disk.';
      showToast('Database Saved!', message, 'success');
      
      // Update original benchmark copy
      originalDbV1 = JSON.parse(JSON.stringify(dbV1));
      originalDbV2 = JSON.parse(JSON.stringify(dbV2));
      pendingRemovedImages.clear();
      
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

let zoomState = { mode: 'fit', scale: 1.0 };
let isDragging = false;
let startX, startY;
let scrollLeft, scrollTop;

function openLightbox(src, title) {
  const content = document.getElementById('lightbox-content');
  const caption = document.getElementById('lightbox-caption');
  
  // Reset zoom state on open
  zoomState.mode = 'fit';
  zoomState.scale = 1.0;
  updateLightboxZoom();
  
  if (content) {
    content.scrollLeft = 0;
    content.scrollTop = 0;
    content.classList.remove('dragging');
  }
  isDragging = false;
  
  lightboxImg.src = src;
  if (caption) {
    if (title) {
      caption.innerHTML = `<strong>${title}</strong> • Click image to toggle zoom • Drag to pan`;
    } else {
      caption.textContent = 'Click image to toggle zoom • Drag to pan';
    }
  }
  lightbox.style.display = 'flex';
  
  // Small delay to trigger smooth transition
  setTimeout(() => {
    lightbox.classList.add('active');
  }, 10);
}

function closeLightbox() {
  lightbox.classList.remove('active');
  setTimeout(() => {
    lightbox.style.display = 'none';
  }, 250);
}

function updateLightboxZoom() {
  const img = document.getElementById('lightbox-img');
  const levelText = document.getElementById('zoom-level-text');
  if (!img || !levelText) return;
  
  if (zoomState.mode === 'fit') {
    img.classList.remove('zoomed');
    img.style.width = '';
    img.style.height = '';
    levelText.textContent = 'Fit';
  } else {
    img.classList.add('zoomed');
    const baseWidth = img.naturalWidth || 1000;
    const targetWidth = baseWidth * zoomState.scale;
    img.style.width = targetWidth + 'px';
    img.style.height = 'auto';
    levelText.textContent = Math.round(zoomState.scale * 100) + '%';
  }
}

function toggleImageZoom() {
  if (zoomState.mode === 'fit') {
    zoomState.mode = 'actual';
    zoomState.scale = 1.0;
  } else {
    zoomState.mode = 'fit';
  }
  updateLightboxZoom();
}

function zoomIn() {
  if (zoomState.mode === 'fit') {
    zoomState.mode = 'actual';
    zoomState.scale = 1.0;
  } else {
    zoomState.scale = Math.min(3.0, zoomState.scale + 0.25);
  }
  updateLightboxZoom();
}

function zoomOut() {
  if (zoomState.mode === 'fit') return;
  zoomState.scale = Math.max(0.25, zoomState.scale - 0.25);
  updateLightboxZoom();
}

function zoomReset() {
  zoomState.mode = 'fit';
  zoomState.scale = 1.0;
  updateLightboxZoom();
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
