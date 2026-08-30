// ==========================================================================
// APP STATE & GLOBAL VARIABLES
// ==========================================================================
let appData = {
  chapters: [],
  questions: [],
  bookmarks: new Set(),
  doneQuestions: new Set(),
  examSelection: new Set()
};

let currentFilters = {
  selectedTopicId: null,
  showBookmarksOnly: false,
  searchQuery: '',
  level: 'all', // 'all', 'as', 'a'
  years: new Set(),
  session: 'all', // 'all', 'June', 'November', 'March'
  type: 'all', // 'all', 'theory', 'practical'
  sideBySide: false, // false = stacked (default), true = side-by-side
  subject: '9618' // '9618' or '9626'
};

function is9626Chapter(ch) {
  return ch.subject === '9626' || ch.chapter_num >= 21;
}

function getSubjectChapters(subject, level = 'all') {
  return appData.chapters.filter(ch => {
    const is9626 = is9626Chapter(ch);
    if (subject === '9626' ? !is9626 : is9626) return false;

    const chapterNum = ch.chapter_num;
    if (subject === '9618') {
      if (level === 'as' && chapterNum > 12) return false;
      if (level === 'a' && chapterNum <= 12) return false;
    } else if (subject === '9626') {
      if (level === 'as' && chapterNum > 31) return false;
      if (level === 'a' && chapterNum <= 31) return false;
    }
    return true;
  });
}

function getFirstTopicId(subject, level = 'all') {
  const chapters = getSubjectChapters(subject, level);
  for (const ch of chapters) {
    if (ch.topics.length > 0) return ch.topics[0].id;
  }
  return null;
}

// ==========================================================================
// INITIALIZATION
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadBookmarks();
  loadDoneQuestions();
  loadExamSelection();
  initSideBySideToggle();
  fetchData();
  setupEventListeners();
});

// ==========================================================================
// EXPANDABLE PANEL (MARK SCHEME)
// ==========================================================================
function toggleMarkScheme(btn, panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  
  const isExpanded = panel.classList.contains('expanded');
  if (isExpanded) {
    panel.classList.remove('expanded');
    btn.classList.remove('expanded');
    btn.querySelector('span').textContent = 'View Mark Scheme';
  } else {
    panel.classList.add('expanded');
    btn.classList.add('expanded');
    btn.querySelector('span').textContent = 'Hide Mark Scheme';
  }
}

// ==========================================================================
// THEME & BOOKMARK CONTROLS
// ==========================================================================
function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  const body = document.body;
  const sunIcon = document.getElementById('theme-toggle-btn').querySelector('.sun-icon');
  const moonIcon = document.getElementById('theme-toggle-btn').querySelector('.moon-icon');

  if (savedTheme === 'light') {
    body.classList.remove('dark-mode');
    sunIcon.style.display = 'none';
    moonIcon.style.display = 'block';
  } else {
    body.classList.add('dark-mode');
    sunIcon.style.display = 'block';
    moonIcon.style.display = 'none';
  }
}

function toggleTheme() {
  const body = document.body;
  const sunIcon = document.getElementById('theme-toggle-btn').querySelector('.sun-icon');
  const moonIcon = document.getElementById('theme-toggle-btn').querySelector('.moon-icon');
  
  // Prevent visual flashes during transitions
  body.classList.add('light-mode-transition');
  
  if (body.classList.contains('dark-mode')) {
    body.classList.remove('dark-mode');
    localStorage.setItem('theme', 'light');
    sunIcon.style.display = 'none';
    moonIcon.style.display = 'block';
  } else {
    body.classList.add('dark-mode');
    localStorage.setItem('theme', 'dark');
    sunIcon.style.display = 'block';
    moonIcon.style.display = 'none';
  }
  
  setTimeout(() => {
    body.classList.remove('light-mode-transition');
  }, 350);
}

function toggleSearchFilters() {
  const rightSidebar = document.getElementById('right-sidebar');
  const toggleBtn = document.getElementById('toggle-search-filters-btn');
  if (!rightSidebar || !toggleBtn) return;
  
  const isCollapsed = rightSidebar.classList.toggle('collapsed');
  localStorage.setItem('filters_collapsed', isCollapsed ? 'true' : 'false');
  
  if (isCollapsed) {
    toggleBtn.classList.add('collapsed-active');
    toggleBtn.querySelector('span').textContent = 'Show Filters';
  } else {
    toggleBtn.classList.remove('collapsed-active');
    toggleBtn.querySelector('span').textContent = 'Hide Filters';
  }
}

function initSearchFiltersToggle() {
  const rightSidebar = document.getElementById('right-sidebar');
  const toggleBtn = document.getElementById('toggle-search-filters-btn');
  if (!rightSidebar || !toggleBtn) return;
  
  const collapsedPref = localStorage.getItem('filters_collapsed') === 'true';
  if (collapsedPref) {
    rightSidebar.classList.add('collapsed');
    toggleBtn.classList.add('collapsed-active');
    toggleBtn.querySelector('span').textContent = 'Show Filters';
  } else {
    toggleBtn.querySelector('span').textContent = 'Hide Filters';
  }
  
  toggleBtn.onclick = toggleSearchFilters;
}


function loadBookmarks() {
  const saved = localStorage.getItem('bookmarks_v2');
  if (saved) {
    try {
      appData.bookmarks = new Set(JSON.parse(saved));
      updateBookmarkCountBadge();
    } catch (e) {
      console.error('Error loading bookmarks:', e);
    }
  }
}

function toggleBookmark(questionId) {
  if (appData.bookmarks.has(questionId)) {
    appData.bookmarks.delete(questionId);
  } else {
    appData.bookmarks.add(questionId);
  }
  localStorage.setItem('bookmarks_v2', JSON.stringify([...appData.bookmarks]));
  updateBookmarkCountBadge();
  
  if (currentFilters.showBookmarksOnly) {
    renderQuestions();
  } else {
    const btn = document.querySelector(`.q-card[data-id="${questionId}"] .bookmark-btn`);
    if (btn) {
      btn.classList.toggle('active');
    }
  }
}

function updateBookmarkCountBadge() {
  document.getElementById('bookmark-count').textContent = appData.bookmarks.size;
}

// ==========================================================================
// DONE / PROGRESS TRACKING
// ==========================================================================
function loadDoneQuestions() {
  const saved = localStorage.getItem('done_questions_v2');
  if (saved) {
    try {
      appData.doneQuestions = new Set(JSON.parse(saved));
    } catch (e) {
      console.error('Error loading done questions:', e);
    }
  }
}

function toggleDone(questionId) {
  const wasDone = appData.doneQuestions.has(questionId);
  if (wasDone) {
    appData.doneQuestions.delete(questionId);
  } else {
    appData.doneQuestions.add(questionId);
  }
  localStorage.setItem('done_questions_v2', JSON.stringify([...appData.doneQuestions]));

  // Update just this card's done button without a full re-render
  const card = document.querySelector(`.q-card[data-id="${questionId}"]`);
  if (card) {
    const btn = card.querySelector('.done-btn');
    if (btn) {
      btn.classList.toggle('active', !wasDone);
      btn.title = !wasDone ? 'Mark as Not Done' : 'Mark as Done';
      btn.querySelector('span').textContent = !wasDone ? 'Done' : 'Mark Done';
    }
    card.classList.toggle('is-done', !wasDone);
  }

  // Refresh sidebar progress bars for the current topic
  updateSidebarProgress();
}

function updateSidebarProgress() {
  // Efficiently update just the progress bars without rebuilding the whole sidebar
  appData.chapters.forEach(ch => {
    ch.topics.forEach(topic => {
      const topicQuestions = appData.questions.filter(q => q.topic_id === topic.id);
      const total = topicQuestions.length;
      const done = topicQuestions.filter(q => appData.doneQuestions.has(q.id)).length;

      const progressEl = document.querySelector(`.topic-progress[data-topic-id="${topic.id}"]`);
      if (progressEl) {
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        progressEl.querySelector('.progress-fill').style.width = pct + '%';
        progressEl.querySelector('.progress-text').textContent = `${done}/${total}`;
        progressEl.classList.toggle('complete', done === total && total > 0);
      }
    });
  });
}

// ==========================================================================
// SIDE-BY-SIDE VIEW TOGGLE
// ==========================================================================
function initSideBySideToggle() {
  const saved = localStorage.getItem('side_by_side_v2');
  currentFilters.sideBySide = saved === 'true';
  applySideBySideClass();
}

function toggleSideBySide() {
  currentFilters.sideBySide = !currentFilters.sideBySide;
  localStorage.setItem('side_by_side_v2', currentFilters.sideBySide ? 'true' : 'false');
  applySideBySideClass();
  updateSideBySideBtn();
  renderQuestions();
}

function applySideBySideClass() {
  document.getElementById('questions-list').classList.toggle('side-by-side-mode', currentFilters.sideBySide);
  document.querySelector('.questions-container').classList.toggle('side-by-side-active', currentFilters.sideBySide);
}

function updateSideBySideBtn() {
  const btn = document.getElementById('side-by-side-btn');
  if (!btn) return;
  if (currentFilters.sideBySide) {
    btn.classList.add('collapsed-active');
    btn.querySelector('span').textContent = 'Stacked View';
    btn.title = 'Switch to Stacked View';
  } else {
    btn.classList.remove('collapsed-active');
    btn.querySelector('span').textContent = 'Side-by-Side';
    btn.title = 'Switch to Side-by-Side View';
  }
}

// ==========================================================================
// LIGHTBOX VIEWER FUNCTIONS
// ==========================================================================
let zoomState = { mode: 'fit', scale: 1.0 };
let isDragging = false;
let startX, startY;
let scrollLeft, scrollTop;

function openLightbox(src, title) {
  const lightbox = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  const content = document.getElementById('lightbox-content');
  const caption = document.getElementById('lightbox-caption');
  if (!lightbox || !img) return;
  
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
  
  img.src = src;
  
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
  const lightbox = document.getElementById('lightbox');
  if (!lightbox) return;
  
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
    // Scale relative to naturalWidth. Fallback if naturalWidth is not loaded yet
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
// DATA FETCHING
// ==========================================================================
function fetchData() {
  const loadingState = document.getElementById('loading-state');
  
  fetch('questions_db_v2.json')
    .then(response => {
      if (!response.ok) {
        throw new Error('Visual database file not found. Wait for python pipeline to finish compilation.');
      }
      return response.json();
    })
    .then(data => {
      appData.chapters = data.chapters;
      appData.questions = data.questions;
      
      loadingState.style.display = 'none';
      
      const savedSubject = localStorage.getItem('selected_subject_v2') || '9618';
      currentFilters.subject = savedSubject;
      updateSubjectSwitcherUI();
      updateHeaderTitles();
      
      initYearFilters();

      const firstTopicId = getFirstTopicId(currentFilters.subject, 'all');
      currentFilters.selectedTopicId = firstTopicId;
      renderSidebar();
      if (firstTopicId) {
        renderQuestions();
      }
    })
    .catch(error => {
      console.error('Error loading visual database:', error);
      loadingState.querySelector('h3').textContent = 'Loading visual database...';
      loadingState.querySelector('p').textContent = 'The Python script is still compiling past paper crops. This page will auto-refresh in 5 seconds.';
      loadingState.querySelector('.loading-animation').style.display = 'flex';
      
      // Auto-retry in 5 seconds if not yet compiled
      setTimeout(fetchData, 5000);
    });
}

// ==========================================================================
// FILTER SETUP
// ==========================================================================
function initYearFilters() {
  const yearsContainer = document.getElementById('year-filters');
  yearsContainer.innerHTML = '';
  
  const subjectQuestions = appData.questions.filter(q => q.subject === currentFilters.subject);
  const years = [...new Set(subjectQuestions.map(q => q.year))].sort((a, b) => b - a);
  
  const allChip = document.createElement('button');
  allChip.className = 'filter-chip active';
  allChip.textContent = 'All';
  allChip.dataset.year = 'all';
  allChip.onclick = () => selectYearFilter('all');
  yearsContainer.appendChild(allChip);
  
  years.forEach(year => {
    const chip = document.createElement('button');
    chip.className = 'filter-chip';
    chip.textContent = year;
    chip.dataset.year = year;
    chip.onclick = () => selectYearFilter(year);
    yearsContainer.appendChild(chip);
  });
}

function selectYearFilter(yearVal) {
  const container = document.getElementById('year-filters');
  const chips = container.querySelectorAll('.filter-chip');
  
  if (yearVal === 'all') {
    currentFilters.years.clear();
    chips.forEach(c => c.classList.remove('active'));
    container.querySelector('[data-year="all"]').classList.add('active');
  } else {
    container.querySelector('[data-year="all"]').classList.remove('active');
    
    if (currentFilters.years.has(yearVal)) {
      currentFilters.years.delete(yearVal);
      container.querySelector(`[data-year="${yearVal}"]`).classList.remove('active');
    } else {
      currentFilters.years.add(yearVal);
      container.querySelector(`[data-year="${yearVal}"]`).classList.add('active');
    }
    
    if (currentFilters.years.size === 0) {
      container.querySelector('[data-year="all"]').classList.add('active');
    }
  }
  
  renderQuestions();
}

function selectSessionFilter(sessionVal, activeChip) {
  currentFilters.session = sessionVal;
  document.querySelectorAll('#session-filters .filter-chip').forEach(c => c.classList.remove('active'));
  activeChip.classList.add('active');
  renderQuestions();
}

function selectTypeFilter(typeVal, activeChip) {
  currentFilters.type = typeVal;
  document.querySelectorAll('#type-filters .filter-chip').forEach(c => c.classList.remove('active'));
  activeChip.classList.add('active');
  renderQuestions();
}

function selectSubject(subjectVal) {
  currentFilters.subject = subjectVal;
  localStorage.setItem('selected_subject_v2', subjectVal);
  
  updateSubjectSwitcherUI();
  updateHeaderTitles();
  
  // Clear search and other filters to prevent cross-subject filter pollution
  currentFilters.searchQuery = '';
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';
  const clearSearchBtn = document.getElementById('clear-search-btn');
  if (clearSearchBtn) clearSearchBtn.style.display = 'none';
  
  // Reset active level tab to 'all' on subject change
  currentFilters.level = 'all';
  document.querySelectorAll('.level-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.level === 'all');
  });

  // Reset year filter
  currentFilters.years.clear();
  initYearFilters();
  
  currentFilters.showBookmarksOnly = false;
  document.getElementById('show-bookmarks-btn').classList.remove('active');

  // Select first topic of All Levels for the chosen subject
  const firstTopicId = getFirstTopicId(subjectVal, 'all');
  currentFilters.selectedTopicId = firstTopicId;
  renderSidebar();
  renderQuestions();
}

function updateSubjectSwitcherUI() {
  document.querySelectorAll('.subject-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.subject === currentFilters.subject);
  });
}

function updateHeaderTitles() {
  const is9626 = currentFilters.subject === '9626';
  
  // Update browser document title
  document.title = is9626 
    ? '9626 IT Topical Past Papers Explorer (V2)' 
    : '9618 Computer Science Topical Past Papers Explorer (V2)';
    
  // Update sidebar titles
  const sidebarTitle = document.getElementById('sidebar-title');
  if (sidebarTitle) {
    sidebarTitle.textContent = is9626 ? '9626 IT Explorer v2' : '9618 Computer Science Explorer v2';
  }
  
  const sidebarSubtitle = document.getElementById('sidebar-subtitle');
  if (sidebarSubtitle) {
    sidebarSubtitle.textContent = is9626 ? '2025–2027 Syllabus Guide' : '2026 Syllabus Guide';
  }
}

function selectLevelTab(levelVal, activeTab) {
  currentFilters.level = levelVal;
  document.querySelectorAll('.level-tab').forEach(t => t.classList.remove('active'));
  activeTab.classList.add('active');
  
  renderSidebar();
}

// ==========================================================================
// SIDEBAR RENDERER
// ==========================================================================
function renderSidebar() {
  const nav = document.getElementById('syllabus-nav');
  nav.innerHTML = '';
  
  getSubjectChapters(currentFilters.subject, currentFilters.level).forEach(ch => {
    const chapterNum = ch.chapter_num;

    const details = document.createElement('details');
    details.className = 'chapter-details';
    details.id = `ch-${chapterNum}`;
    
    const hasActiveTopic = ch.topics.some(t => t.id === currentFilters.selectedTopicId);
    if (hasActiveTopic) {
      details.open = true;
    }
    
    // Chapter-level progress summary
    const chapterQuestions = appData.questions.filter(q =>
      ch.topics.some(t => t.id === q.topic_id)
    );
    const chapterDone = chapterQuestions.filter(q => appData.doneQuestions.has(q.id)).length;
    const chapterTotal = chapterQuestions.length;
    const chapterPct = chapterTotal > 0 ? Math.round((chapterDone / chapterTotal) * 100) : 0;
    
    const summary = document.createElement('summary');
    summary.className = 'chapter-summary';
    summary.innerHTML = `
      <span class="chapter-title-text" title="${chapterNum}. ${ch.chapter_title}">${chapterNum}. ${ch.chapter_title}</span>
      <div class="chapter-summary-right">
        ${chapterTotal > 0 ? `<span class="chapter-progress-text">${chapterDone}/${chapterTotal}</span>` : ''}
        <svg class="chapter-icon" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </div>
    `;
    
    details.appendChild(summary);
    
    const topicsList = document.createElement('div');
    topicsList.className = 'topics-list';
    
    ch.topics.forEach(topic => {
      const topicQuestions = appData.questions.filter(q => q.topic_id === topic.id);
      const total = topicQuestions.length;
      const done = topicQuestions.filter(q => appData.doneQuestions.has(q.id)).length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const isComplete = done === total && total > 0;
      
      const topicBtn = document.createElement('button');
      topicBtn.className = 'topic-item';
      if (topic.id === currentFilters.selectedTopicId && !currentFilters.showBookmarksOnly) {
        topicBtn.classList.add('active');
      }
      
      topicBtn.onclick = (e) => {
        e.preventDefault();
        selectTopic(topic.id);
      };
      
      topicBtn.innerHTML = `
        <div class="topic-item-main">
          <span class="topic-item-label">${topic.id} ${topic.title}</span>
          <span class="topic-badge">${total}</span>
        </div>
        ${total > 0 ? `
        <div class="topic-progress ${isComplete ? 'complete' : ''}" data-topic-id="${topic.id}">
          <div class="progress-bar-track">
            <div class="progress-fill" style="width: ${pct}%"></div>
          </div>
          <span class="progress-text">${done}/${total}</span>
        </div>` : ''}
      `;
      
      topicsList.appendChild(topicBtn);
    });
    
    details.appendChild(topicsList);
    nav.appendChild(details);
  });
}

function selectTopic(topicId) {
  currentFilters.selectedTopicId = topicId;
  currentFilters.showBookmarksOnly = false;
  
  document.getElementById('show-bookmarks-btn').classList.remove('active');
  
  document.querySelectorAll('.topic-item').forEach(btn => {
    btn.classList.remove('active');
    if (btn.querySelector('span').textContent.startsWith(topicId)) {
      btn.classList.add('active');
    }
  });
  
  const topicParts = topicId.split('.');
  const chDetails = document.getElementById(`ch-${topicParts[0]}`);
  if (chDetails && !chDetails.open) {
    chDetails.open = true;
  }
  
  renderQuestions();
}

function toggleBookmarksOnly() {
  currentFilters.showBookmarksOnly = !currentFilters.showBookmarksOnly;
  const bookmarksBtn = document.getElementById('show-bookmarks-btn');
  
  if (currentFilters.showBookmarksOnly) {
    bookmarksBtn.classList.add('active');
    document.querySelectorAll('.topic-item').forEach(btn => btn.classList.remove('active'));
  } else {
    bookmarksBtn.classList.remove('active');
    if (currentFilters.selectedTopicId) {
      selectTopic(currentFilters.selectedTopicId);
    }
  }
  
  renderQuestions();
}

// ==========================================================================
// FILTER LOGIC & SEARCH
// ==========================================================================
function getFilteredQuestions() {
  return appData.questions.filter(q => {
    // 0. Subject filter
    if (q.subject !== currentFilters.subject) return false;
    
    // 1. Topic/Bookmark filter
    if (currentFilters.showBookmarksOnly) {
      if (!appData.bookmarks.has(q.id)) return false;
    } else {
      if (q.topic_id !== currentFilters.selectedTopicId) return false;
    }
    
    // 2. Year Filter
    if (currentFilters.years.size > 0) {
      if (!currentFilters.years.has(q.year)) return false;
    }
    
    // 3. Session Filter
    if (currentFilters.session !== 'all') {
      if (q.session !== currentFilters.session) return false;
    }
    
    // 4. Paper Type Filter
    if (currentFilters.type !== 'all') {
      const isPractical = q.paper.includes('Paper 2') || q.paper.includes('Paper 4');
      if (currentFilters.type === 'theory' && isPractical) return false;
      if (currentFilters.type === 'practical' && !isPractical) return false;
    }
    
    // 5. Keyword search filter
    if (currentFilters.searchQuery.trim() !== '') {
      const query = currentFilters.searchQuery.toLowerCase();
      const textMatch = q.text ? q.text.toLowerCase().includes(query) : false;
      const msTextMatch = q.text_ms ? q.text_ms.toLowerCase().includes(query) : false;
      const codeMatch = q.num_label.toLowerCase().includes(query) || q.paper.toLowerCase().includes(query);
      
      if (!textMatch && !msTextMatch && !codeMatch) return false;
    }
    
    return true;
  });
}

// ==========================================================================
// MAIN QUESTIONS LIST RENDERER
// ==========================================================================
function renderQuestions() {
  const container = document.getElementById('questions-list');
  const emptyState = document.getElementById('empty-state');
  const topicHeader = document.getElementById('topic-header');
  
  container.innerHTML = '';
  
  // Set up topic header text
  if (currentFilters.showBookmarksOnly) {
    topicHeader.style.display = 'flex';
    document.getElementById('topic-title').textContent = 'Bookmarked Questions';
  } else if (currentFilters.selectedTopicId) {
    topicHeader.style.display = 'flex';
    
    let topicTitle = '';
    appData.chapters.forEach(ch => {
      const t = ch.topics.find(top => top.id === currentFilters.selectedTopicId);
      if (t) {
        topicTitle = t.title;
      }
    });
    
    document.getElementById('topic-title').textContent = topicTitle;
  } else {
    topicHeader.style.display = 'none';
  }
  
  const filtered = getFilteredQuestions();
  
  // Sort by year descending (recent first), then by session, paper, variant
  filtered.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    const sessionOrder = { 'November': 3, 'June': 2, 'March': 1 };
    const sa = sessionOrder[a.session] || 0;
    const sb = sessionOrder[b.session] || 0;
    if (sa !== sb) return sb - sa;
    const paperOrder = { 'Paper 4': 4, 'Paper 3': 3, 'Paper 2': 2, 'Paper 1': 1 };
    const pa = paperOrder[a.paper] || 0;
    const pb = paperOrder[b.paper] || 0;
    if (pa !== pb) return pb - pa;
    return parseInt(a.variant) - parseInt(b.variant);
  });
  
  if (filtered.length > 0) {
    emptyState.style.display = 'none';
    document.getElementById('stat-total-q').textContent = filtered.length;
    
    const validMarks = filtered.map(q => q.marks).filter(m => m !== null);
    const avg = validMarks.length > 0 ? (validMarks.reduce((a, b) => a + b, 0) / validMarks.length).toFixed(1) : 'N/A';
    document.getElementById('stat-avg-marks').textContent = avg;
  } else {
    emptyState.style.display = 'flex';
    document.getElementById('stat-total-q').textContent = '0';
    document.getElementById('stat-avg-marks').textContent = '0';
  }
  
  filtered.forEach((q) => {
    const card = document.createElement('article');
    card.className = 'q-card';
    if (appData.doneQuestions.has(q.id)) card.classList.add('is-done');
    card.dataset.id = q.id;
    
    const isBookmarked = appData.bookmarks.has(q.id);
    const isDone = appData.doneQuestions.has(q.id);
    const marksDisplay = q.marks ? `${q.marks} Mark${q.marks > 1 ? 's' : ''}` : 'Practical Task';
    
    const qpUrl = q.qp_path ? (q.qp_path + (q.qp_page ? `#page=${q.qp_page}` : '')) : null;
    const msUrl = q.ms_path ? (q.ms_path + (q.ms_page ? `#page=${q.ms_page}` : '')) : null;
    
    const panelId = `ms-panel-${q.id}`;
    const isSideBySide = currentFilters.sideBySide;
    
    // Generate markup for question image stack
    let questionImagesHtml = '';
    if (q.images_q && q.images_q.length > 0) {
      questionImagesHtml = q.images_q.map(img => {
        const cleanPath = img.replace(/\\/g, '/');
        return `
          <div class="shimmer-wrapper">
            <img src="${cleanPath}" class="q-screenshot" alt="Question Crop" onload="this.parentElement.classList.remove('shimmer-wrapper')">
          </div>
        `;
      }).join('');
    } else {
      questionImagesHtml = `<div class="q-card-body">${q.text}</div>`;
    }
    
    // Generate markup for mark scheme image stack
    let msImagesHtml = '';
    if (q.images_ms && q.images_ms.length > 0) {
      msImagesHtml = q.images_ms.map(img => {
        const cleanPath = img.replace(/\\/g, '/');
        return `
          <div class="shimmer-wrapper">
            <img src="${cleanPath}" class="ms-screenshot" alt="Mark Scheme Crop" onload="this.parentElement.classList.remove('shimmer-wrapper')">
          </div>
        `;
      }).join('');
    } else {
      msImagesHtml = `<p>No mark scheme image crop available for this question. Refer to MS PDF.</p>`;
    }

    // In side-by-side mode, render a two-column layout with MS always visible
    if (isSideBySide) {
      card.innerHTML = `
        <div class="q-card-header">
          <div class="q-meta-tags">
            <span class="meta-tag paper-tag">${q.year} ${q.session}</span>
            <span class="meta-tag paper-tag">${q.paper} (Var ${q.variant})</span>
            <span class="meta-tag">Q${q.num_label}</span>
            <span class="meta-tag marks-tag">${marksDisplay}</span>
            ${currentFilters.showBookmarksOnly ? `<span class="meta-tag topic-tag">Topic ${q.topic_id}</span>` : ''}
          </div>
          <div class="card-actions">
            <button class="exam-select-btn ${isInExam(q.id) ? 'active' : ''}" data-qid="${q.id}" onclick="toggleExamSelection('${q.id}')" title="${isInExam(q.id) ? 'Remove from Exam' : 'Add to Exam'}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
              <span>${isInExam(q.id) ? 'In Exam' : 'Add to Exam'}</span>
            </button>
            <button class="done-btn ${isDone ? 'active' : ''}" onclick="toggleDone('${q.id}')" title="${isDone ? 'Mark as Not Done' : 'Mark as Done'}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              <span>${isDone ? 'Done' : 'Mark Done'}</span>
            </button>
            <button class="bookmark-btn ${isBookmarked ? 'active' : ''}" onclick="toggleBookmark('${q.id}')" title="Bookmark Question">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            </button>
          </div>
        </div>
        
        <!-- Side-by-side body: question | mark scheme -->
        <div class="sbs-body">
          <div class="sbs-col sbs-question">
            <div class="sbs-col-label">Question</div>
            <div class="q-card-images">${questionImagesHtml}</div>
          </div>
          <div class="sbs-divider"></div>
          <div class="sbs-col sbs-ms">
            <div class="sbs-col-label ms-label">Mark Scheme</div>
            <div class="ms-content sbs-ms-content">${msImagesHtml}</div>
          </div>
        </div>

        <div class="q-card-footer">
          <div class="pdf-links">
            ${qpUrl ? `<a href="${qpUrl}" target="_blank" class="pdf-link"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>QP PDF</a>` : ''}
            ${msUrl ? `<a href="${msUrl}" target="_blank" class="pdf-link"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>MS PDF</a>` : ''}
          </div>
        </div>
      `;
    } else {
      // Default stacked layout
      card.innerHTML = `
        <div class="q-card-header">
          <div class="q-meta-tags">
            <span class="meta-tag paper-tag">${q.year} ${q.session}</span>
            <span class="meta-tag paper-tag">${q.paper} (Var ${q.variant})</span>
            <span class="meta-tag">Q${q.num_label}</span>
            <span class="meta-tag marks-tag">${marksDisplay}</span>
            ${currentFilters.showBookmarksOnly ? `<span class="meta-tag topic-tag">Topic ${q.topic_id}</span>` : ''}
          </div>
          <div class="card-actions">
            <button class="exam-select-btn ${isInExam(q.id) ? 'active' : ''}" data-qid="${q.id}" onclick="toggleExamSelection('${q.id}')" title="${isInExam(q.id) ? 'Remove from Exam' : 'Add to Exam'}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
              <span>${isInExam(q.id) ? 'In Exam' : 'Add to Exam'}</span>
            </button>
            <button class="done-btn ${isDone ? 'active' : ''}" onclick="toggleDone('${q.id}')" title="${isDone ? 'Mark as Not Done' : 'Mark as Done'}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              <span>${isDone ? 'Done' : 'Mark Done'}</span>
            </button>
            <button class="bookmark-btn ${isBookmarked ? 'active' : ''}" onclick="toggleBookmark('${q.id}')" title="Bookmark Question">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            </button>
          </div>
        </div>
        
        <!-- Visually rendered crops stack -->
        <div class="q-card-images">
          ${questionImagesHtml}
        </div>
        
        <div class="q-card-footer">
          <button class="view-ms-btn" onclick="toggleMarkScheme(this, '${panelId}')">
            <span>View Mark Scheme</span>
            <svg class="chevron-icon" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
          <div class="pdf-links">
            ${qpUrl ? `<a href="${qpUrl}" target="_blank" class="pdf-link"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>QP PDF</a>` : ''}
            ${msUrl ? `<a href="${msUrl}" target="_blank" class="pdf-link"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>MS PDF</a>` : ''}
          </div>
        </div>
        
        <!-- Expandable Mark Scheme Panel -->
        <div class="ms-panel" id="${panelId}">
          <div class="ms-content-wrapper">
            <div class="ms-content">
              ${msImagesHtml}
            </div>
          </div>
        </div>
      `;
    }
    
    // Add event handlers directly to images inside the card for lightbox opening
    card.querySelectorAll('.q-screenshot').forEach((img, idx, arr) => {
      const partText = arr.length > 1 ? ` (Part ${idx + 1})` : '';
      img.onclick = () => openLightbox(img.src, `${q.year} ${q.session} ${q.paper} (Var ${q.variant}) - Q${q.num_label} - Question${partText}`);
    });
    card.querySelectorAll('.ms-screenshot').forEach((img, idx, arr) => {
      const partText = arr.length > 1 ? ` (Part ${idx + 1})` : '';
      img.onclick = () => openLightbox(img.src, `${q.year} ${q.session} ${q.paper} (Var ${q.variant}) - Q${q.num_label} - Mark Scheme${partText}`);
    });

    container.appendChild(card);
  });

  updateExamButtonStates();
}

// ==========================================================================
// EXAM BUILDER
// ==========================================================================
const EXAM_STORAGE_KEY = 'exam_selection_v2';

function isInExam(questionId) {
  return appData.examSelection.has(questionId);
}

function loadExamSelection() {
  try {
    const saved = JSON.parse(localStorage.getItem(EXAM_STORAGE_KEY) || '[]');
    appData.examSelection = new Set(Array.isArray(saved) ? saved : []);
  } catch (e) {
    appData.examSelection = new Set();
  }
  updateExamCountBadge();
}

function saveExamSelection() {
  localStorage.setItem(EXAM_STORAGE_KEY, JSON.stringify([...appData.examSelection]));
  updateExamCountBadge();
}

function updateExamCountBadge() {
  const badge = document.getElementById('exam-count');
  if (badge) badge.textContent = appData.examSelection.size;
}

function toggleExamSelection(questionId) {
  if (appData.examSelection.has(questionId)) {
    appData.examSelection.delete(questionId);
  } else {
    appData.examSelection.add(questionId);
  }
  saveExamSelection();
  updateExamButtonStates();
}

function updateExamButtonStates() {
  document.querySelectorAll('.exam-select-btn').forEach(btn => {
    const active = isInExam(btn.dataset.qid);
    btn.classList.toggle('active', active);
    const label = btn.querySelector('span');
    if (label) label.textContent = active ? 'In Exam' : 'Add to Exam';
    btn.title = active ? 'Remove from Exam' : 'Add to Exam';
  });
}

function openExamBuilder() {
  const modal = document.getElementById('exam-modal');
  if (!modal) return;
  renderExamBuilderList();
  document.getElementById('exam-result').style.display = 'none';
  modal.style.display = 'flex';
}

function closeExamBuilder() {
  const modal = document.getElementById('exam-modal');
  if (modal) modal.style.display = 'none';
}

function getSelectedExamQuestions() {
  return [...appData.examSelection]
    .map(id => appData.questions.find(q => q.id === id))
    .filter(Boolean);
}

function renderExamBuilderList() {
  const list = document.getElementById('exam-list');
  const summary = document.getElementById('exam-summary');
  const totalEl = document.getElementById('exam-total-marks');
  const selected = getSelectedExamQuestions();
  const totalMarks = selected.reduce((sum, q) => sum + (q.marks || 0), 0);

  summary.textContent = `${selected.length} question${selected.length === 1 ? '' : 's'} selected`;
  totalEl.textContent = `Total Marks: ${totalMarks}`;
  document.getElementById('exam-create-btn').disabled = selected.length === 0;
  document.getElementById('exam-clear-btn').disabled = selected.length === 0;

  if (selected.length === 0) {
    list.innerHTML = `
      <div class="exam-empty">
        <p>No questions selected yet.</p>
        <p>Use the "Add to Exam" button on question cards to build your exam.</p>
      </div>`;
    return;
  }

  list.innerHTML = selected.map((q, idx) => `
    <div class="exam-list-row">
      <span class="exam-row-num">${idx + 1}</span>
      <div class="exam-row-info">
        <span class="exam-row-title">${q.year} ${q.session} &mdash; ${q.paper} (Var ${q.variant}) &mdash; Q${q.num_label}</span>
        <span class="exam-row-meta">Topic ${q.topic_id} &middot; ${q.marks !== null && q.marks !== undefined ? q.marks + ' marks' : 'marks N/A'}</span>
      </div>
      <button class="exam-row-remove" onclick="removeFromExam('${q.id}')" title="Remove from Exam">&times;</button>
    </div>
  `).join('');
}

function removeFromExam(questionId) {
  appData.examSelection.delete(questionId);
  saveExamSelection();
  updateExamButtonStates();
  renderExamBuilderList();
}

function clearExamSelection() {
  appData.examSelection.clear();
  saveExamSelection();
  updateExamButtonStates();
  renderExamBuilderList();
}

async function createExamFiles() {
  const nameInput = document.getElementById('exam-name-input');
  const resultBox = document.getElementById('exam-result');
  const createBtn = document.getElementById('exam-create-btn');
  const examName = nameInput.value.trim();

  resultBox.style.display = 'none';

  if (!examName) {
    resultBox.style.display = 'block';
    resultBox.className = 'exam-result exam-result-error';
    resultBox.textContent = 'Please give your exam a name first.';
    nameInput.focus();
    return;
  }

  const questionIds = [...appData.examSelection];
  if (questionIds.length === 0) {
    resultBox.style.display = 'block';
    resultBox.className = 'exam-result exam-result-error';
    resultBox.textContent = 'Select at least one question before generating the exam files.';
    return;
  }

  createBtn.disabled = true;
  createBtn.textContent = 'Generating...';
  let response = null;

  try {
    response = await fetch('/api/create-exam', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: examName, questionIds })
    });
    const data = await response.json();

    resultBox.style.display = 'block';
    if (data.success) {
      resultBox.className = 'exam-result exam-result-success';
      const pdfLinks = data.qpPdfUrl && data.msPdfUrl
        ? `<div class="exam-result-links exam-result-links-secondary">
             <a href="${data.qpPdfUrl}" class="pdf-link" download>Question Paper (PDF)</a>
             <a href="${data.msPdfUrl}" class="pdf-link" download>Mark Scheme (PDF)</a>
           </div>`
        : '';
      resultBox.innerHTML = `
        <p><strong>"${escapeHtml(examName)}"</strong> is ready (${data.questionCount} questions, ${data.totalMarks} marks):</p>
        <p class="exam-result-note">The PDF preserves the exact source layout. The Word version uses normal paragraphs, with source tables preserved as images for stable formatting.</p>
        <div class="exam-result-links">
          <a href="${data.qpUrl}" class="pdf-link" download>Download Question Paper (${data.format || 'Word'})</a>
          <a href="${data.msUrl}" class="pdf-link" download>Download Mark Scheme (${data.format || 'Word'})</a>
        </div>
        ${pdfLinks}
        `;
    } else {
      resultBox.className = 'exam-result exam-result-error';
      resultBox.textContent = data.error || 'Failed to create the exam.';
    }
  } catch (err) {
    resultBox.style.display = 'block';
    resultBox.className = 'exam-result exam-result-error';
    if (!response) {
      resultBox.textContent = 'Could not reach the server. Start it with "node server.js" and reload this page (http://localhost:8080).';
    } else {
      resultBox.textContent = `Exam creation failed (server responded with ${response.status}). If you just updated the code, restart server.js.`;
    }
  } finally {
    createBtn.disabled = false;
    createBtn.textContent = 'Generate Exam Files';
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ==========================================================================
// EVENT LISTENERS & SEARCH TRIGGER
// ==========================================================================
function setupEventListeners() {
  document.getElementById('theme-toggle-btn').onclick = toggleTheme;
  document.getElementById('show-bookmarks-btn').onclick = toggleBookmarksOnly;

  // Subject tabs
  document.querySelectorAll('.subject-tab').forEach(tab => {
    tab.onclick = () => selectSubject(tab.dataset.subject);
  });

  // Side-by-side toggle
  const sbsBtn = document.getElementById('side-by-side-btn');
  if (sbsBtn) {
    sbsBtn.onclick = toggleSideBySide;
    updateSideBySideBtn();
  }

  // Search & Filters Toggle
  initSearchFiltersToggle();

  // Exam Builder
  const examBuilderBtn = document.getElementById('exam-builder-btn');
  if (examBuilderBtn) examBuilderBtn.onclick = openExamBuilder;

  const examModalCloseBtn = document.getElementById('exam-modal-close-btn');
  if (examModalCloseBtn) examModalCloseBtn.onclick = closeExamBuilder;

  const examModal = document.getElementById('exam-modal');
  if (examModal) {
    examModal.addEventListener('click', (e) => {
      if (e.target === examModal) closeExamBuilder();
    });
  }

  const examClearBtn = document.getElementById('exam-clear-btn');
  if (examClearBtn) examClearBtn.onclick = clearExamSelection;

  const examCreateBtn = document.getElementById('exam-create-btn');
  if (examCreateBtn) examCreateBtn.onclick = createExamFiles;

  const examNameInput = document.getElementById('exam-name-input');
  if (examNameInput) {
    examNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') createExamFiles();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeExamBuilder();
  });

  document.querySelectorAll('.level-tab').forEach(tab => {
    tab.onclick = () => selectLevelTab(tab.dataset.level, tab);
  });

  document.querySelectorAll('#session-filters .filter-chip').forEach(chip => {
    chip.onclick = () => selectSessionFilter(chip.dataset.session, chip);
  });
  
  document.querySelectorAll('#type-filters .filter-chip').forEach(chip => {
    chip.onclick = () => selectTypeFilter(chip.dataset.type, chip);
  });
  
  const searchInput = document.getElementById('search-input');
  const clearSearchBtn = document.getElementById('clear-search-btn');
  
  searchInput.oninput = (e) => {
    currentFilters.searchQuery = e.target.value;
    if (e.target.value.trim() !== '') {
      clearSearchBtn.style.display = 'block';
    } else {
      clearSearchBtn.style.display = 'none';
    }
    renderQuestions();
  };
  
  clearSearchBtn.onclick = () => {
    searchInput.value = '';
    currentFilters.searchQuery = '';
    clearSearchBtn.style.display = 'none';
    renderQuestions();
  };

  // Lightbox Events & Zoom Controls
  const lightbox = document.getElementById('lightbox');
  const closeBtn = document.getElementById('lightbox-close-btn');
  const lightboxImg = document.getElementById('lightbox-img');
  
  if (closeBtn) {
    closeBtn.onclick = closeLightbox;
  }
  
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
  
  if (zoomInBtn) zoomInBtn.onclick = (e) => { e.stopPropagation(); zoomIn(); };
  if (zoomOutBtn) zoomOutBtn.onclick = (e) => { e.stopPropagation(); zoomOut(); };
  if (zoomResetBtn) zoomResetBtn.onclick = (e) => { e.stopPropagation(); zoomReset(); };

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
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightbox && lightbox.style.display === 'flex') {
      closeLightbox();
    }
  });
}
