// Script for managing the analysis history

let allHistoryItems = [];
let filteredItems = [];

// Verifica se siamo in un contesto di estensione browser
const isExtensionContext = typeof chrome !== 'undefined' && chrome.storage;

document.addEventListener('DOMContentLoaded', function() {
  loadHistory();
  setupEventListeners();
});

// Load history from storage
async function loadHistory() {
  try {
    if (!isExtensionContext) {
      console.warn('Chrome storage API not available');
      allHistoryItems = [];
      updateStats();
      applyFilters();
      return;
    }
    const result = await chrome.storage.local.get(['analysisHistory']);
    allHistoryItems = result.analysisHistory || [];
    console.log('History loaded:', allHistoryItems.length, 'items');
    updateStats();
    applyFilters();
  } catch (error) {
    console.error('Error loading history:', error);
    showError('Error loading history');
  }
}

// Update statistics
function updateStats() {
  const totalAnalyses = allHistoryItems.length;
  const falseCount = allHistoryItems.filter(item => item.isFake && item.isFake === true).length;
  const trueCount = allHistoryItems.filter(item => item.isFake && item.isFake === false).length;
  const totalElement = document.getElementById('totalAnalyses');
  const falseElement = document.getElementById('fakeNewsCount');
  const trueElement = document.getElementById('realNewsCount');
  const totalItemsElement = document.getElementById('totalItems');
  if (totalElement) totalElement.textContent = totalAnalyses;
  if (falseElement) falseElement.textContent = falseCount;
  if (trueElement) trueElement.textContent = trueCount;
  if (totalItemsElement) totalItemsElement.textContent = `${totalAnalyses} items in history`;
}

// Apply filters
function applyFilters() {
  const filterTypeElement = document.getElementById('filterType');
  const filterDateElement = document.getElementById('filterDate');
  const searchTextElement = document.getElementById('searchText');
  
  const filterType = filterTypeElement ? filterTypeElement.value : 'all';
  const filterDate = filterDateElement ? filterDateElement.value : 'all';
  const searchText = searchTextElement ? searchTextElement.value.toLowerCase() : '';
  
  filteredItems = allHistoryItems.filter(item => {
    // Safety check for item.result
    if (!item.result) return false;
    
    // Filtro per tipo
    if (filterType !== 'all') {
      if (filterType === 'fake' && item.isFake !== true) return false;
      if (filterType === 'real' && item.isFake !== false) return false;
      if (filterType === 'error' && item.isFake !== null) return false;
    }
    
    // Filtro per data
    if (filterDate !== 'all') {
      const itemDate = new Date(item.timestamp);
      const now = new Date();
      const diffMs = now - itemDate;
      
      switch (filterDate) {
        case 'today':
          if (diffMs > 24 * 60 * 60 * 1000) return false;
          break;
        case 'week':
          if (diffMs > 7 * 24 * 60 * 60 * 1000) return false;
          break;
        case 'month':
          if (diffMs > 30 * 24 * 60 * 60 * 1000) return false;
          break;
      }
    }
    
    // Filtro per testo
    if (searchText && item.selectedText && !item.selectedText.toLowerCase().includes(searchText)) {
      return false;
    }
    
    return true;
  });
  
  displayHistory();
}

// Show history
function displayHistory() {
  const container = document.getElementById('historyContainer');
  const emptyState = document.getElementById('emptyState');
  
  if (!container || !emptyState) return;
  
  if (filteredItems.length === 0) {
    container.style.display = 'none';
    emptyState.style.display = 'block';
    
    if (allHistoryItems.length > 0) {
      // There are items but they are filtered
      const clearFiltersBtn = document.createElement('button');
      clearFiltersBtn.textContent = 'Remove Filters';
      clearFiltersBtn.style.cssText = `
        background: linear-gradient(135deg, #3498db, #2980b9);
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        margin-top: 10px;
      `;
      clearFiltersBtn.addEventListener('click', clearFilters);
      
      emptyState.innerHTML = `
        <div class="empty-icon">��</div>
        <h2>No results found</h2>
        <p>No items match the selected filters.</p>
      `;
      emptyState.appendChild(clearFiltersBtn);
    }
    return;
  }
  
  container.style.display = 'block';
  emptyState.style.display = 'none';
  
  // Sort by date (most recent first)
  filteredItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  container.innerHTML = filteredItems.map(item => createHistoryItemHTML(item)).join('');
  
  // Add event listeners for dynamic buttons
  setupDynamicEventListeners();
}

// Setup event listeners per elementi dinamici
function setupDynamicEventListeners() {
  // Event listeners per i pulsanti di eliminazione
  document.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', function() {
      const itemId = this.getAttribute('data-id');
      deleteHistoryItem(itemId);
    });
  });
}

// Create HTML for a history item
function createHistoryItemHTML(item) {
  if (!item.result) return '';
  
  const result = item.result;
  const date = new Date(item.timestamp);
  const formattedDate = formatDate(date);
  const formattedTime = formatTime(date);
  
  let resultClass = 'error';
  let resultText = '\u26a0\ufe0f Error';
  
  if (result.isFake === true) {
    resultClass = 'fake';
    resultText = '\u274c Not accurate';
  } else if (result.isFake === false) {
    resultClass = 'real';
    resultText = '\u2705 Reliable';
  }
  
  const selectedText = item.selectedText || '';
  const truncatedText = selectedText.length > 150 ? 
    selectedText.substring(0, 150) + '...' : 
    selectedText;
  
  return `
    <div class="history-item ${resultClass}" data-id="${item.id}">
      <div class="history-header">
        <div class="history-actions">
          <button class="action-btn" data-action="delete" data-id="${item.id}" title="Delete">
            \u274c Delete
          </button>
        </div>
        <div class="history-result ${resultClass}">${resultText}</div>
        <div class="history-date">
          ${formattedDate}<br>
          <span class="history-url">${formattedTime}</span>
          ${item.pageContext && item.pageContext.domain ? 
            `<br><span class="history-url">${item.pageContext.domain}</span>` : ''}
        </div>
      </div>
      
      <div class="history-text">"${escapeHtml(truncatedText)}"</div>
      
      <div class="history-explanation">
        ${escapeHtml(result.explanation && result.explanation.trim().length > 3 ? result.explanation : 'Analysis completed by artificial intelligence.')}
      </div>
    </div>
  `;
}

// Format date
function formatDate(date) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString('en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }
}

// Format time
function formatTime(date) {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Escape HTML per sicurezza
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Setup event listeners
function setupEventListeners() {
  // Filtri
  const filterType = document.getElementById('filterType');
  const filterDate = document.getElementById('filterDate');
  const searchText = document.getElementById('searchText');
  
  if (filterType) filterType.addEventListener('change', applyFilters);
  if (filterDate) filterDate.addEventListener('change', applyFilters);
  if (searchText) searchText.addEventListener('input', debounce(applyFilters, 300));
  
  // Pulsanti header
  const clearHistoryBtn = document.getElementById('clearHistory');
  const exportHistoryBtn = document.getElementById('exportHistory');
  const backToPopupBtn = document.getElementById('backToPopup');
  
  if (clearHistoryBtn) clearHistoryBtn.addEventListener('click', clearHistory);
  if (exportHistoryBtn) exportHistoryBtn.addEventListener('click', exportHistory);
  if (backToPopupBtn) backToPopupBtn.addEventListener('click', backToPopup);
}

// Debounce per la ricerca
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Clear all filters
function clearFilters() {
  const filterType = document.getElementById('filterType');
  const filterDate = document.getElementById('filterDate');
  const searchText = document.getElementById('searchText');
  
  if (filterType) filterType.value = 'all';
  if (filterDate) filterDate.value = 'all';
  if (searchText) searchText.value = '';
  
  applyFilters();
}

// Clear history
async function clearHistory() {
  if (!confirm('Are you sure you want to delete all history? This action cannot be undone.')) {
    return;
  }
  
  try {
    if (isExtensionContext) {
      await chrome.storage.local.set({ analysisHistory: [] });
    }
    allHistoryItems = [];
    updateStats();
    applyFilters();
    showSuccess('History successfully deleted');
  } catch (error) {
    console.error('Error deleting history:', error);
    showError('Error deleting history');
  }
}

// Export history
function exportHistory() {
  if (allHistoryItems.length === 0) {
    showError('No data to export');
    return;
  }
  
  try {
    const dataToExport = allHistoryItems.map(item => ({
      date: new Date(item.timestamp).toLocaleString('en-US'),
      text: item.selectedText || '',
      result: item.isFake === true ? 'Not accurate' : item.isFake === false ? 'Reliable' : 'Error',
      explanation: item.explanation || '',
      domain: item.pageContext?.domain || 'N/A'
    }));
    
    const csv = convertToCSV(dataToExport);
    downloadCSV(csv, 'historypilot-history.csv');
    showSuccess('History exported successfully');
  } catch (error) {
    console.error('Error exporting:', error);
    showError('Error exporting history');
  }
}

// Converti in CSV
function convertToCSV(data) {
  if (data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => headers.map(header => `"${String(row[header] || '').replace(/"/g, '""')}"`).join(','))
  ].join('\n');
  return csvContent;
}

// Download CSV
function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url); // Cleanup
  }
}

// Delete history item
async function deleteHistoryItem(itemId) {
  if (!confirm('Are you sure you want to delete this item?')) {
    return;
  }
  
  try {
    allHistoryItems = allHistoryItems.filter(item => item.id !== itemId);
    
    if (isExtensionContext) {
      await chrome.storage.local.set({ analysisHistory: allHistoryItems });
    }
    
    updateStats();
    applyFilters();
    showSuccess('Item successfully deleted');
  } catch (error) {
    console.error('Error deleting item:', error);
    showError('Error deleting item');
  }
}

// Torna al popup
function backToPopup() {
  // Chiude la finestra corrente per tornare al popup dell'estensione
  if (window.close) {
    window.close();
  } else {
    history.back();
  }
}

// Mostra messaggio di successo
function showSuccess(message) {
  showNotification(message, 'success');
}

// Mostra messaggio di errore
function showError(message) {
  showNotification(message, 'error');
}

// Sistema di notifiche
function showNotification(message, type = 'info') {
  // Rimuovi notifiche esistenti
  const existingNotifications = document.querySelectorAll('.notification');
  existingNotifications.forEach(notification => notification.remove());
  
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  
  // Stili per la notifica
  const baseStyles = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 20px;
    border-radius: 8px;
    color: white;
    font-weight: 500;
    z-index: 10000;
    max-width: 350px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    transform: translateX(100%);
    transition: transform 0.3s ease;
    cursor: pointer;
  `;
  
  let typeStyles = '';
  switch (type) {
    case 'success':
      typeStyles = 'background: linear-gradient(135deg, #27ae60, #2ecc71);';
      break;
    case 'error':
      typeStyles = 'background: linear-gradient(135deg, #e74c3c, #c0392b);';
      break;
    default:
      typeStyles = 'background: linear-gradient(135deg, #3498db, #2980b9);';
  }
  
  notification.style.cssText = baseStyles + typeStyles;
  
  document.body.appendChild(notification);
  
  // Animazione di entrata
  setTimeout(() => {
    notification.style.transform = 'translateX(0)';
  }, 100);
  
  // Auto-rimozione dopo 4 secondi
  const autoRemove = setTimeout(() => {
    removeNotification(notification);
  }, 4000);
  
  // Rimozione al click
  notification.addEventListener('click', () => {
    clearTimeout(autoRemove);
    removeNotification(notification);
  });
}

// Funzione helper per rimuovere notifiche
function removeNotification(notification) {
  if (notification && notification.parentNode) {
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }
}

// Funzione per aggiornare la cronologia in tempo reale
function refreshHistory() {
  loadHistory();
}

// Listener per aggiornamenti del storage
if (isExtensionContext) {
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.analysisHistory) {
      console.log('Cronologia aggiornata, ricaricamento...');
      refreshHistory();
    }
  });
}

function renderHistoryItem(item) {
  // Assicurati che le chiavi siano in inglese
  let isFake = item.isFake;
  let explanation = item.explanation;
  let sources = item.sources;
  // ... rendering ...
}

function parseHistoryItem(rawItem) {
  let item = rawItem;
  if ('valutazione' in rawItem) {
    item.isFake = rawItem.valutazione === 'falso' ? true : (rawItem.valutazione === 'vero' ? false : null);
    delete item.valutazione;
  }
  if ('spiegazione' in rawItem) {
    item.explanation = rawItem.spiegazione;
    delete item.spiegazione;
  }
  if ('fonti' in rawItem) {
    item.sources = rawItem.fonti;
    delete item.fonti;
  }
  return item;
}