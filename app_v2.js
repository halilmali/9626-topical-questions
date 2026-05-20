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
  type: 'all' // 'all', 'theory', 'practical'
};

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
// LIGHTBOX VIEWER FUNCTIONS
// ==========================================================================
let zoomState = { mode: 'fit', scale: 1.0 };

function openLightbox(src) {
  const lightbox = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  if (!lightbox || !img) return;
  
  // Reset zoom state on open
  zoomState.mode = 'fit';
  zoomState.scale = 1.0;
  updateLightboxZoom();
  
  img.src = src;
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
      
      initYearFilters();
      renderSidebar();
      
      // Auto-select first topic on startup
      if (appData.chapters.length > 0 && appData.chapters[0].topics.length > 0) {
        selectTopic(appData.chapters[0].topics[0].id);
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
  
  const years = [...new Set(appData.questions.map(q => q.year))].sort((a, b) => b - a);
  
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
  
  appData.chapters.forEach(ch => {
    const chapterNum = ch.chapter_num;
    if (currentFilters.level === 'as' && chapterNum > 11) return;
    if (currentFilters.level === 'a' && chapterNum <= 11) return;
    
    const details = document.createElement('details');
    details.className = 'chapter-details';
    details.id = `ch-${chapterNum}`;
    
    const hasActiveTopic = ch.topics.some(t => t.id === currentFilters.selectedTopicId);
    if (hasActiveTopic) {
      details.open = true;
    }
    
    const summary = document.createElement('summary');
    summary.className = 'chapter-summary';
    summary.innerHTML = `
      <span class="chapter-title-text" title="${chapterNum}. ${ch.chapter_title}">${chapterNum}. ${ch.chapter_title}</span>
      <svg class="chapter-icon" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
    `;
    
    details.appendChild(summary);
    
    const topicsList = document.createElement('div');
    topicsList.className = 'topics-list';
    
    ch.topics.forEach(topic => {
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
    card.dataset.id = q.id;
    
    const isBookmarked = appData.bookmarks.has(q.id);
    const marksDisplay = q.marks ? `${q.marks} Mark${q.marks > 1 ? 's' : ''}` : 'Practical Task';
    
    const qpUrl = q.qp_path ? (q.qp_path + (q.qp_page ? `#page=${q.qp_page}` : '')) : null;
    const msUrl = q.ms_path ? (q.ms_path + (q.ms_page ? `#page=${q.ms_page}` : '')) : null;
    
    const panelId = `ms-panel-${q.id}`;
    
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
    
    // Add event handlers directly to images inside the card for lightbox opening
    card.querySelectorAll('.q-screenshot, .ms-screenshot').forEach(img => {
      img.onclick = () => openLightbox(img.src);
    });
    
    container.appendChild(card);
  });
}

// ==========================================================================
// EVENT LISTENERS & SEARCH TRIGGER
// ==========================================================================
function setupEventListeners() {
  document.getElementById('theme-toggle-btn').onclick = toggleTheme;
  document.getElementById('show-bookmarks-btn').onclick = toggleBookmarksOnly;
  
  // Search & Filters Toggle
  initSearchFiltersToggle();
  
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
  
  if (lightboxImg) {
    lightboxImg.onclick = (e) => {
      e.stopPropagation();
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
