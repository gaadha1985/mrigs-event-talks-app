// --- App State ---
let releasesData = [];
let filters = {
  search: '',
  type: 'all',
  sort: 'desc'
};
let selectedUpdate = null;
let originalTweetText = '';

// --- DOM Elements ---
const refreshBtn = document.getElementById('refresh-btn');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search-btn');
const pillButtons = document.querySelectorAll('.pill');
const sortSelect = document.getElementById('sort-select');
const alertBanner = document.getElementById('alert-banner');
const alertMsg = document.getElementById('alert-msg');
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');

const statTotal = document.getElementById('stat-total');
const statFeatures = document.getElementById('stat-features');
const statIssues = document.getElementById('stat-issues');
const statOther = document.getElementById('stat-other');

const feedContainer = document.getElementById('feed-container');
const feedLoading = document.getElementById('feed-loading');
const feedEmpty = document.getElementById('feed-empty');

// Tweet Modal Elements
const tweetModal = document.getElementById('tweet-modal');
const sourcePreviewDate = document.getElementById('source-preview-date');
const sourcePreviewType = document.getElementById('source-preview-type');
const sourcePreviewText = document.getElementById('source-preview-text');
const tweetTextarea = document.getElementById('tweet-textarea');
const charCounter = document.getElementById('char-counter');
const progressRingCircle = document.getElementById('progress-ring-circle');
const resetTweetBtn = document.getElementById('reset-tweet-btn');
const copyTweetBtn = document.getElementById('copy-tweet-btn');
const publishTweetBtn = document.getElementById('publish-tweet-btn');
const toastContainer = document.getElementById('toast-container');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  // Fetch initial data
  fetchReleases();

  // Setup Event Listeners
  refreshBtn.addEventListener('click', () => fetchReleases(true));
  
  // Search
  searchInput.addEventListener('input', handleSearchInput);
  clearSearchBtn.addEventListener('click', clearSearch);
  
  // Type Filters
  pillButtons.forEach(button => {
    button.addEventListener('click', () => {
      pillButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      filters.type = button.getAttribute('data-filter');
      renderFeed();
    });
  });
  
  // Sort
  sortSelect.addEventListener('change', (e) => {
    filters.sort = e.target.value;
    renderFeed();
  });
  
  // Tweet Modal Event Listeners
  tweetTextarea.addEventListener('input', updateCharCount);
  resetTweetBtn.addEventListener('click', resetTweetDraft);
  copyTweetBtn.addEventListener('click', copyTweetDraft);
  publishTweetBtn.addEventListener('click', publishTweet);

  // Close modal when clicking outside content (on backdrop)
  tweetModal.addEventListener('click', (e) => {
    const rect = tweetModal.getBoundingClientRect();
    const isInDialog = (rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX && e.clientX <= rect.left + rect.width);
    if (!isInDialog) {
      tweetModal.close();
    }
  });

  // Support native command event handling (Invoker commands fallback/setup)
  tweetModal.addEventListener('command', (e) => {
    const command = e.command || e.detail?.command;
    if (command === 'close') {
      tweetModal.close();
    }
  });
});

// --- API Calls ---
async function fetchReleases(forceRefresh = false) {
  toggleLoadingState(true);
  hideAlert();
  
  const url = `/api/releases${forceRefresh ? '?refresh=true' : ''}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Server returned status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.status === 'success') {
      releasesData = data.entries || [];
      
      // Update Cache Status Badge
      updateStatusBadge(data.from_cache, data.fetched_at);
      
      // Show warning banner if there is a warning (e.g. server down, serving cache)
      if (data.warning) {
        showAlert(data.warning);
      } else if (forceRefresh) {
        showToast('Successfully fetched latest release notes!', 'success');
      }
      
      // Compute Stats & Render
      calculateStats();
      renderFeed();
    } else {
      throw new Error(data.message || 'Unknown server error');
    }
  } catch (error) {
    console.error('Fetch error:', error);
    showToast(`Failed to fetch release notes: ${error.message}`, 'error');
    showAlert(`Could not connect to the release feed: ${error.message}. Please try refreshing.`);
    
    // Set UI to empty
    releasesData = [];
    calculateStats();
    renderFeed();
  } finally {
    toggleLoadingState(false);
  }
}

// --- Helper Functions ---
function toggleLoadingState(isLoading) {
  if (isLoading) {
    refreshBtn.classList.add('loading');
    refreshBtn.disabled = true;
    feedLoading.style.display = 'flex';
    feedContainer.style.display = 'none';
    feedEmpty.style.display = 'none';
  } else {
    refreshBtn.classList.remove('loading');
    refreshBtn.disabled = false;
    feedLoading.style.display = 'none';
    feedContainer.style.display = 'block';
  }
}

function updateStatusBadge(isFromCache, fetchedAt) {
  const date = new Date(fetchedAt);
  const formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const pulseDot = statusBadge.querySelector('.pulse-dot');
  
  if (isFromCache) {
    pulseDot.classList.add('warning');
    statusText.innerText = `Cached (Fetched at ${formattedTime})`;
  } else {
    pulseDot.classList.remove('warning');
    statusText.innerText = `Live (Refreshed at ${formattedTime})`;
  }
}

function showAlert(msg) {
  alertMsg.innerText = msg;
  alertBanner.style.display = 'flex';
}

function hideAlert() {
  alertBanner.style.display = 'none';
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  // Choose Icon
  let iconSvg = '';
  if (type === 'success') {
    iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  } else if (type === 'error') {
    iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
  } else {
    iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
  }
  
  toast.innerHTML = `${iconSvg}<span>${message}</span>`;
  toastContainer.appendChild(toast);
  
  // Remove from DOM after animation finishes (3.5s total duration)
  setTimeout(() => {
    toast.remove();
  }, 3500);
}

// --- Search & Filtering Logic ---
function handleSearchInput(e) {
  filters.search = e.target.value.toLowerCase().trim();
  if (filters.search.length > 0) {
    clearSearchBtn.style.display = 'block';
  } else {
    clearSearchBtn.style.display = 'none';
  }
  renderFeed();
}

function clearSearch() {
  searchInput.value = '';
  filters.search = '';
  clearSearchBtn.style.display = 'none';
  renderFeed();
}

function calculateStats() {
  let total = 0;
  let features = 0;
  let issues = 0;
  let other = 0;
  
  releasesData.forEach(entry => {
    entry.updates.forEach(update => {
      total++;
      if (update.type === 'Feature') {
        features++;
      } else if (update.type === 'Issue') {
        issues++;
      } else {
        other++;
      }
    });
  });
  
  statTotal.innerText = total;
  statFeatures.innerText = features;
  statIssues.innerText = issues;
  statOther.innerText = other;
}

// --- Rendering ---
function renderFeed() {
  feedContainer.innerHTML = '';
  
  // Sort Day Groups
  let sortedEntries = [...releasesData];
  sortedEntries.sort((a, b) => {
    const dateA = new Date(a.updated || a.date);
    const dateB = new Date(b.updated || b.date);
    return filters.sort === 'desc' ? dateB - dateA : dateA - dateB;
  });
  
  let visibleGroupsCount = 0;
  
  sortedEntries.forEach(entry => {
    // Filter updates in this day group
    const filteredUpdates = entry.updates.filter(update => {
      // 1. Filter by Type
      if (filters.type !== 'all') {
        if (filters.type === 'other') {
          if (['Feature', 'Issue', 'Resolved'].includes(update.type)) {
            return false;
          }
        } else if (update.type !== filters.type) {
          return false;
        }
      }
      
      // 2. Filter by Search Query
      if (filters.search.length > 0) {
        const textMatch = update.text.toLowerCase().includes(filters.search);
        const typeMatch = update.type.toLowerCase().includes(filters.search);
        const dateMatch = entry.date.toLowerCase().includes(filters.search);
        return textMatch || typeMatch || dateMatch;
      }
      
      return true;
    });
    
    // If no updates in this day match filters, don't show the day group
    if (filteredUpdates.length === 0) return;
    
    visibleGroupsCount++;
    
    // Create Day Group elements
    const dayGroup = document.createElement('div');
    dayGroup.className = 'day-group';
    
    const dayHeader = document.createElement('div');
    dayHeader.className = 'day-header';
    
    const dayDate = document.createElement('div');
    dayDate.className = 'day-date';
    dayDate.innerText = entry.date;
    
    const dayLink = document.createElement('a');
    dayLink.className = 'day-link';
    dayLink.href = entry.link;
    dayLink.target = '_blank';
    dayLink.rel = 'noopener noreferrer';
    dayLink.title = 'View original release notes page';
    dayLink.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
        <polyline points="15 3 21 3 21 9"></polyline>
        <line x1="10" y1="14" x2="21" y2="3"></line>
      </svg>
    `;
    
    dayHeader.appendChild(dayDate);
    dayHeader.appendChild(dayLink);
    dayGroup.appendChild(dayHeader);
    
    const updatesList = document.createElement('div');
    updatesList.className = 'day-updates-list';
    
    filteredUpdates.forEach(update => {
      const updateItem = document.createElement('div');
      updateItem.className = `update-item card type-${update.type.toLowerCase()}`;
      
      // Determine badge class
      let badgeClass = 'badge-default';
      const typeLower = update.type.toLowerCase();
      if (typeLower === 'feature') badgeClass = 'badge-feature';
      else if (typeLower === 'issue') badgeClass = 'badge-issue';
      else if (typeLower === 'resolved') badgeClass = 'badge-resolved';
      else if (typeLower === 'deprecation') badgeClass = 'badge-deprecation';
      
      updateItem.innerHTML = `
        <div class="update-header">
          <span class="badge ${badgeClass} update-type-badge">${update.type}</span>
        </div>
        <div class="update-body">
          ${update.html}
        </div>
        <div class="update-footer">
          <button class="btn btn-outline btn-tweet btn-small" data-update-id="${update.id}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="margin-right: 4px;">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path>
            </svg>
            Tweet Update
          </button>
        </div>
      `;
      
      // Bind Tweet button
      const tweetBtn = updateItem.querySelector('.btn-tweet');
      tweetBtn.addEventListener('click', () => {
        openTweetModal(entry, update);
      });
      
      updatesList.appendChild(updateItem);
    });
    
    dayGroup.appendChild(updatesList);
    feedContainer.appendChild(dayGroup);
  });
  
  // Toggle empty state
  if (visibleGroupsCount === 0) {
    feedEmpty.style.display = 'flex';
  } else {
    feedEmpty.style.display = 'none';
  }
}

// --- Tweet Modal Logic ---
function openTweetModal(entry, update) {
  selectedUpdate = { entry, update };
  
  // Set preview content in dialog
  sourcePreviewDate.innerText = entry.date;
  sourcePreviewType.innerText = update.type;
  sourcePreviewType.className = `badge badge-${update.type.toLowerCase()}`;
  sourcePreviewText.innerText = update.text;
  
  // Generate initial tweet draft
  generateInitialTweet(entry, update);
  
  // Open dialog (native modal)
  tweetModal.showModal();
}

function generateInitialTweet(entry, update) {
  const date = entry.date;
  const type = update.type.toUpperCase();
  const link = entry.link;
  
  // Construct parts
  const header = `📢 BigQuery (${date}) - ${type}:\n`;
  const footer = `\n\nDetails: ${link}\n#BigQuery #GoogleCloud`;
  
  // Calculate max length available for body text (limit to 280 total literal characters)
  const maxBodyLen = 280 - header.length - footer.length - 3; // -3 for ellipsis '...'
  
  let bodyText = update.text;
  if (bodyText.length > maxBodyLen) {
    bodyText = bodyText.substring(0, maxBodyLen) + '...';
  }
  
  originalTweetText = `${header}${bodyText}${footer}`;
  tweetTextarea.value = originalTweetText;
  
  updateCharCount();
}

function updateCharCount() {
  const text = tweetTextarea.value;
  const length = text.length;
  const remaining = 280 - length;
  
  charCounter.innerText = remaining;
  
  // Progress Ring logic (Radius = 11, Circumference = 69.115)
  const circumference = 2 * Math.PI * 11;
  let strokeColor = 'var(--primary-color)';
  
  // Update classes and circle stroke colors
  if (remaining < 0) {
    charCounter.className = 'char-counter exceeded';
    strokeColor = 'var(--color-deprecation)';
  } else if (remaining <= 20) {
    charCounter.className = 'char-counter warning';
    strokeColor = 'var(--color-issue)';
  } else {
    charCounter.className = 'char-counter';
    strokeColor = 'var(--primary-color)';
  }
  
  progressRingCircle.style.stroke = strokeColor;
  
  // Calculate stroke offset
  const ratio = Math.max(0, Math.min(1, length / 280));
  const strokeOffset = circumference - (ratio * circumference);
  progressRingCircle.style.strokeDashoffset = strokeOffset;
}

function resetTweetDraft() {
  if (originalTweetText) {
    tweetTextarea.value = originalTweetText;
    updateCharCount();
    showToast('Reset draft to original template', 'info');
  }
}

async function copyTweetDraft() {
  try {
    await navigator.clipboard.writeText(tweetTextarea.value);
    showToast('Draft copied to clipboard!', 'success');
  } catch (err) {
    console.error('Clipboard copy failed:', err);
    showToast('Failed to copy text. Please select manually.', 'error');
  }
}

function publishTweet() {
  const text = encodeURIComponent(tweetTextarea.value);
  const xUrl = `https://x.com/intent/tweet?text=${text}`;
  
  window.open(xUrl, '_blank', 'noopener,noreferrer');
  
  showToast('Opening X / Twitter...', 'success');
  tweetModal.close();
}
