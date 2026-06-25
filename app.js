// ==========================================================================
// APP STATE & GLOBAL VARIABLES
// ==========================================================================
let appData = {
  chapters: [],
  questions: [],
  bookmarks: new Set()
};

let currentFilters = {
  selectedTopicId: null,
  showBookmarksOnly: false,
  searchQuery: '',
  level: 'all', // 'all', 'as', 'a'
  years: new Set(),
  session: 'all', // 'all', 'June', 'November', 'March'
  type: 'all', // 'all', 'theory', 'practical'
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
  fetchData();
  setupEventListeners();
});

// ==========================================================================
// ACCORDION ANIMATION HELPER
// ==========================================================================
// We use a CSS Grid trick in index.css (grid-template-rows: 0fr -> 1fr). 
// This function toggles the class 'expanded' on the ms-panel.
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
  const saved = localStorage.getItem('bookmarks');
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
  localStorage.setItem('bookmarks', JSON.stringify([...appData.bookmarks]));
  updateBookmarkCountBadge();
  
  // Re-render if we are in bookmarks-only view
  if (currentFilters.showBookmarksOnly) {
    renderQuestions();
  } else {
    // Just update the card's bookmark button state
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
// DATA FETCHING
// ==========================================================================
function fetchData() {
  const loadingState = document.getElementById('loading-state');
  
  fetch('questions_db.json')
    .then(response => {
      if (!response.ok) {
        throw new Error('Database file not found. Ensure questions_db.json has been compiled.');
      }
      return response.json();
    })
    .then(data => {
      appData.chapters = data.chapters;
      appData.questions = data.questions;
      
      loadingState.style.display = 'none';
      
      const savedSubject = localStorage.getItem('selected_subject') || '9618';
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
      console.error('Error loading past papers:', error);
      loadingState.querySelector('h3').textContent = 'Error loading database';
      loadingState.querySelector('p').textContent = error.message;
      loadingState.querySelector('.loading-animation').style.display = 'none';
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
  
  // "All" chip
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
    // Remove active from 'all'
    container.querySelector('[data-year="all"]').classList.remove('active');
    
    // Toggle year
    if (currentFilters.years.has(yearVal)) {
      currentFilters.years.delete(yearVal);
      container.querySelector(`[data-year="${yearVal}"]`).classList.remove('active');
    } else {
      currentFilters.years.add(yearVal);
      container.querySelector(`[data-year="${yearVal}"]`).classList.add('active');
    }
    
    // If no individual years active, default back to all
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
  localStorage.setItem('selected_subject', subjectVal);

  updateSubjectSwitcherUI();
  updateHeaderTitles();

  currentFilters.searchQuery = '';
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';
  const clearSearchBtn = document.getElementById('clear-search-btn');
  if (clearSearchBtn) clearSearchBtn.style.display = 'none';

  currentFilters.level = 'all';
  document.querySelectorAll('.level-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.level === 'all');
  });

  currentFilters.years.clear();
  initYearFilters();

  currentFilters.showBookmarksOnly = false;
  document.getElementById('show-bookmarks-btn').classList.remove('active');

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

  document.title = is9626
    ? '9626 IT Topical Past Papers Explorer'
    : '9618 Computer Science Topical Past Papers Explorer';

  const sidebarTitle = document.getElementById('sidebar-title');
  if (sidebarTitle) {
    sidebarTitle.textContent = is9626 ? '9626 IT Explorer' : '9618 Computer Science Explorer';
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
  
  // Re-render sidebar to hide/show appropriate chapters
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
    
    // Keep it open if we have a selected topic inside it
    const hasActiveTopic = ch.topics.some(t => t.id === currentFilters.selectedTopicId);
    if (hasActiveTopic) {
      details.open = true;
    }
    
    const summary = document.createElement('summary');
    summary.className = 'chapter-summary';
    
    const titleSpan = document.createElement('span');
    titleSpan.className = 'chapter-title-text';
    titleSpan.title = `${chapterNum}. ${ch.chapter_title}`;
    titleSpan.textContent = `${chapterNum}. ${ch.chapter_title}`;
    
    // Chevron Icon SVG
    summary.innerHTML = `
      <span class="chapter-title-text" title="${chapterNum}. ${ch.chapter_title}">${chapterNum}. ${ch.chapter_title}</span>
      <svg class="chapter-icon" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
    `;
    
    details.appendChild(summary);
    
    const topicsList = document.createElement('div');
    topicsList.className = 'topics-list';
    
    ch.topics.forEach(topic => {
      // Calculate question count for this topic
      const count = appData.questions.filter(q => q.topic_id === topic.id).length;
      
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
        <span>${topic.id} ${topic.title}</span>
        <span class="topic-badge">${count}</span>
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
  
  // Deactivate bookmarks toggle display
  document.getElementById('show-bookmarks-btn').classList.remove('active');
  
  // Refresh sidebar active states
  document.querySelectorAll('.topic-item').forEach(btn => {
    btn.classList.remove('active');
    if (btn.querySelector('span').textContent.startsWith(topicId)) {
      btn.classList.add('active');
    }
  });
  
  // Scroll details into view and open if closed
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
    if (q.subject !== currentFilters.subject) return false;

    // 1. Topical or Bookmark base constraint
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
    
    // 4. Paper Type Filter (Theory vs Practical)
    if (currentFilters.type !== 'all') {
      const isPractical = q.paper.includes('Paper 2') || q.paper.includes('Paper 4');
      if (currentFilters.type === 'theory' && isPractical) return false;
      if (currentFilters.type === 'practical' && !isPractical) return false;
    }
    
    // 5. Keyword search filter
    if (currentFilters.searchQuery.trim() !== '') {
      const query = currentFilters.searchQuery.toLowerCase();
      const textMatch = q.text.toLowerCase().includes(query);
      const answerMatch = q.answers.some(ans => ans.toLowerCase().includes(query));
      const codeMatch = q.num_label.toLowerCase().includes(query) || q.paper.toLowerCase().includes(query);
      
      if (!textMatch && !answerMatch && !codeMatch) return false;
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
    
    // Find topic metadata
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
  
  // Update stats cards
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
  
  filtered.forEach((q, idx) => {
    const card = document.createElement('article');
    card.className = 'q-card';
    card.dataset.id = q.id;
    
    // Highlight bookmarks
    const isBookmarked = appData.bookmarks.has(q.id);
    
    // Generate card content HTML
    const marksDisplay = q.marks ? `${q.marks} Mark${q.marks > 1 ? 's' : ''}` : 'N/A Marks';
    
    // Normalizing paths (convert file:// to relative, handles standard server hosting)
    const qpUrl = q.qp_path ? (q.qp_path + (q.qp_page ? `#page=${q.qp_page}` : '')) : null;
    const msUrl = q.ms_path ? (q.ms_path + (q.ms_page ? `#page=${q.ms_page}` : '')) : null;
    
    // Format checkmark in MS text if present
    let formattedAnswer = 'No answer scheme available for this practical/theory part.';
    if (q.answers && q.answers.length > 0 && q.answers[0]) {
      formattedAnswer = q.answers[0]
        .replace(//g, '<span class="tick">✓</span>')
        .replace(/✓/g, '<span class="tick">✓</span>');
    }
    
    const panelId = `ms-panel-${q.id}`;
    
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
          <button class="bookmark-btn ${isBookmarked ? 'active' : ''}" onclick="toggleBookmark('${q.id}')" title="Bookmark Question">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
          </button>
        </div>
      </div>
      
      <div class="q-card-body">${q.text}</div>
      
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
          <div class="ms-content">${formattedAnswer}</div>
        </div>
      </div>
    `;
    
    container.appendChild(card);
  });
}

// ==========================================================================
// EVENT LISTENERS & SEARCH TRIGGER
// ==========================================================================
function setupEventListeners() {
  // Theme Toggle Button
  document.getElementById('theme-toggle-btn').onclick = toggleTheme;
  
  // Bookmarks Toggle display
  document.getElementById('show-bookmarks-btn').onclick = toggleBookmarksOnly;

  document.querySelectorAll('.subject-tab').forEach(tab => {
    tab.onclick = () => selectSubject(tab.dataset.subject);
  });
  
  // Search & Filters Toggle
  initSearchFiltersToggle();
  
  // Sidebar Tabs (All, AS, A Level)
  document.querySelectorAll('.level-tab').forEach(tab => {
    tab.onclick = () => selectLevelTab(tab.dataset.level, tab);
  });
  
  // Session Chips
  document.querySelectorAll('#session-filters .filter-chip').forEach(chip => {
    chip.onclick = () => selectSessionFilter(chip.dataset.session, chip);
  });
  
  // Paper Type Chips
  document.querySelectorAll('#type-filters .filter-chip').forEach(chip => {
    chip.onclick = () => selectTypeFilter(chip.dataset.type, chip);
  });
  
  // Search Inputs
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
}
