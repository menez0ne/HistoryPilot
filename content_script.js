// Questo script viene iniettato nella pagina web per analizzare il contesto
// Potrebbe essere utilizzato per raccogliere informazioni aggiuntive sulla pagina

/**
 * Raccoglie informazioni sul contesto della pagina web attuale
 * @returns {Object} - Dati sul contesto della pagina
 */
function getPageContext() {
  // Raccoglie il titolo della pagina
  const pageTitle = document.title;
  
  // Raccoglie i metadati
  const metaTags = {};
  const metas = document.getElementsByTagName('meta');
  for (let i = 0; i < metas.length; i++) {
    const meta = metas[i];
    if (meta.name) {
      metaTags[meta.name] = meta.content;
    } else if (meta.property) {
      metaTags[meta.property] = meta.content;
    }
  }
  
  // Cerca informazioni sull'autore
  let author = '';
  
  // Cerca nelle meta
  if (metaTags['author'] || metaTags['article:author']) {
    author = metaTags['author'] || metaTags['article:author'];
  } else {
    // Cerca tag schema.org
    const authorTags = document.querySelectorAll('[itemtype*="schema.org/Person"]');
    if (authorTags.length > 0) {
      for (const tag of authorTags) {
        const nameTag = tag.querySelector('[itemprop="name"]');
        if (nameTag) {
          author = nameTag.textContent.trim();
          break;
        }
      }
    }
    
    // Cerca byline comuni
    if (!author) {
      const bylineSelectors = [
        '.byline', '.author', '.article-author', 
        '[rel="author"]', '.entry-author'
      ];
      
      for (const selector of bylineSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          author = elements[0].textContent.trim();
          break;
        }
      }
    }
  }
  
  // Cerca data di pubblicazione
  let publishDate = '';
  
  // Cerca nelle meta
  if (metaTags['article:published_time'] || metaTags['datePublished']) {
    publishDate = metaTags['article:published_time'] || metaTags['datePublished'];
  } else {
    // Cerca nei tag time
    const timeElements = document.querySelectorAll('time[datetime]');
    if (timeElements.length > 0) {
      publishDate = timeElements[0].getAttribute('datetime');
    } else {
      // Cerca in schemi comuni
      const dateSelectors = [
        '[itemprop="datePublished"]',
        '.published-date',
        '.article-date',
        '.post-date'
      ];
      
      for (const selector of dateSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          publishDate = elements[0].textContent.trim();
          break;
        }
      }
    }
  }
  
  // Informazioni sul dominio
  const domain = window.location.hostname;
  
  return {
    title: pageTitle,
    url: window.location.href,
    domain: domain,
    author: author,
    publishDate: publishDate,
    metaTags: metaTags
  };
}

// 1. MIGLIORA la gestione della selezione (sostituisci la sezione esistente)
let currentSelection = null;
let lastSelectedText = '';

// Cattura la selezione in modo più robusto
document.addEventListener('mouseup', function(e) {
  setTimeout(() => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    if (selectedText.length > 5) { // Minimo 5 caratteri
      try {
        currentSelection = {
          text: selectedText,
          range: selection.getRangeAt(0).cloneRange(),
          timestamp: Date.now(),
          // Salva anche informazioni sui nodi per un recupero più affidabile
          startContainer: selection.getRangeAt(0).startContainer,
          startOffset: selection.getRangeAt(0).startOffset,
          endContainer: selection.getRangeAt(0).endContainer,
          endOffset: selection.getRangeAt(0).endOffset
        };
        lastSelectedText = selectedText;
        console.log('✅ Selezione salvata:', selectedText.substring(0, 30) + '...');
      } catch (e) {
        console.log('❌ Errore nel salvare la selezione:', e);
        currentSelection = null;
      }
    }
  }, 100); // Aumenta il delay per maggiore affidabilità
});

// 3. NUOVA funzione per cercare testo nella pagina
function findTextInPage(searchText) {
  if (!searchText || searchText.length < 5) return null;
  
  try {
    // Usa l'API di ricerca del browser se disponibile
    if (window.find) {
      // Resetta eventuali ricerche precedenti
      window.getSelection().removeAllRanges();
      
      // Cerca il testo
      const found = window.find(searchText, false, false, false, false);
      if (found) {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          console.log('✅ Testo trovato con window.find');
          return selection.getRangeAt(0);
        }
      }
    }
    
    // Metodo alternativo: TreeWalker
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          // Salta script, style e elementi già evidenziati
          const parent = node.parentElement;
          if (!parent || 
              parent.tagName === 'SCRIPT' || 
              parent.tagName === 'STYLE' ||
              parent.classList.contains('fact-checker-highlight')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    
    let node;
    while (node = walker.nextNode()) {
      const nodeText = node.textContent;
      const index = nodeText.indexOf(searchText);
      
      if (index !== -1) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + searchText.length);
        console.log('✅ Testo trovato con TreeWalker');
        return range;
      }
    }
    
    console.log('❌ Testo non trovato nella pagina');
    return null;
    
  } catch (e) {
    console.log('❌ Errore nella ricerca del testo:', e);
    return null;
  }
}

// 4. MIGLIORA la funzione di applicazione dell'evidenziazione
function applyHighlight(range, result) {
  try {
    // Rimuovi evidenziazioni precedenti
    removeExistingHighlights();
    
    // Crea l'elemento di evidenziazione
    const span = document.createElement('span');
    span.className = `fact-checker-highlight ${result.isFake ? 'fake' : 'real'}`;
    
    // Stili migliorati
    const backgroundColor = result.isFake ? 
      'rgba(255, 77, 77, 0.25)' : 'rgba(46, 204, 113, 0.25)';
    const borderColor = result.isFake ? 
      'rgba(255, 77, 77, 0.8)' : 'rgba(46, 204, 113, 0.8)';
    
    Object.assign(span.style, {
      backgroundColor: backgroundColor,
      padding: '2px 4px',
      borderRadius: '4px',
      border: `2px solid ${borderColor}`,
      transition: 'all 0.3s ease',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      position: 'relative',
      animation: 'factCheckerPulse 0.6s ease-out'
    });
    
    // Aggiunge l'animazione CSS se non esiste
    if (!document.getElementById('factCheckerStyles')) {
      const style = document.createElement('style');
      style.id = 'factCheckerStyles';
      style.textContent = `
        @keyframes factCheckerPulse {
          0% { transform: scale(1); box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
          50% { transform: scale(1.03); box-shadow: 0 4px 16px rgba(0,0,0,0.25); }
          100% { transform: scale(1); box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
        }
      `;
      document.head.appendChild(style);
    }
    
    // Tooltip migliorato
    span.title = result.isFake ? 
      `⚠️ Informazione potenzialmente non accurata\nClicca per dettagli` : 
      `✅ Contenuto attendibile\nClicca per dettagli`;
    
    // Applica l'evidenziazione
    try {
      range.surroundContents(span);
      console.log('✅ Evidenziazione applicata con successo');
    } catch (e) {
      // Metodo alternativo per range complessi
      console.log('🔄 Usando metodo alternativo per range complesso');
      const contents = range.extractContents();
      span.appendChild(contents);
      range.insertNode(span);
    }
    
    // Aggiunge click handler per mostrare dettagli
    span.addEventListener('click', function(e) {
      e.preventDefault();
      chrome.runtime.sendMessage({
        action: 'showPopup'
      });
    });
    
    // Programma la rimozione
    scheduleHighlightRemoval(span);
    
    // Scroll verso l'elemento evidenziato
    span.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'center' 
    });
    
    return true;
    
  } catch (e) {
    console.error('❌ Errore durante l\'applicazione dell\'evidenziazione:', e);
    return false;
  }
}

// 5. MIGLIORA la rimozione delle evidenziazioni
function removeExistingHighlights() {
  const existingHighlights = document.querySelectorAll('.fact-checker-highlight');
  existingHighlights.forEach(highlight => {
    try {
      const parent = highlight.parentNode;
      if (parent) {
        // Animazione di dissolvenza
        highlight.style.opacity = '0';
        highlight.style.transform = 'scale(0.95)';
        
        setTimeout(() => {
          while (highlight.firstChild) {
            parent.insertBefore(highlight.firstChild, highlight);
          }
          if (parent.contains(highlight)) {
            parent.removeChild(highlight);
          }
        }, 300);
      }
    } catch (e) {
      console.log('Errore nella rimozione di un highlight:', e);
    }
  });
}

// Funzione per programmare la rimozione dell'evidenziazione
function scheduleHighlightRemoval(span) {
  // Verifica le impostazioni per la durata
  chrome.storage.sync.get(['highlightText'], function(settings) {
    if (settings.highlightText !== false) {
      // Rimuove l'evidenziazione dopo 8 secondi
      setTimeout(() => {
        try {
          const parent = span.parentNode;
          if (parent && span.parentNode) {
            // Animazione di dissolvenza
            span.style.opacity = '0';
            span.style.transform = 'scale(0.98)';
            
            setTimeout(() => {
              while (span.firstChild) {
                parent.insertBefore(span.firstChild, span);
              }
              parent.removeChild(span);
            }, 300);
          }
        } catch (e) {
          console.error('Errore nella rimozione dell\'evidenziazione:', e);
        }
      }, 8000);
    }
  });
}

// 2. MIGLIORA la funzione di evidenziazione (sostituisci quella esistente)
function highlightSelection(result) {
  console.log('🎯 Tentativo di evidenziazione con risultato:', result);
  
  let range = null;
  const selection = window.getSelection();
  
  // Strategia 1: Usa la selezione corrente se disponibile
  if (selection.rangeCount > 0 && selection.toString().trim().length > 0) {
    range = selection.getRangeAt(0);
    console.log('📝 Usando selezione corrente:', selection.toString().substring(0, 30));
  }
  // Strategia 2: Ricostruisci la selezione salvata
  else if (currentSelection) {
    console.log('🔄 Tentativo di ricostruire selezione salvata');
    try {
      // Verifica che i nodi esistano ancora
      if (document.contains(currentSelection.startContainer) && 
          document.contains(currentSelection.endContainer)) {
        
        range = document.createRange();
        range.setStart(currentSelection.startContainer, currentSelection.startOffset);
        range.setEnd(currentSelection.endContainer, currentSelection.endOffset);
        
        // Verifica che il testo corrisponda
        const reconstructedText = range.toString().trim();
        if (reconstructedText === currentSelection.text) {
          selection.removeAllRanges();
          selection.addRange(range);
          console.log('✅ Selezione ricostruita con successo');
        } else {
          console.log('❌ Testo ricostruito non corrisponde');
          range = null;
        }
      } else {
        console.log('❌ Nodi della selezione non più validi');
        currentSelection = null;
      }
    } catch (e) {
      console.log('❌ Errore nella ricostruzione:', e);
      range = null;
    }
  }
  // Strategia 3: Cerca il testo nella pagina
  else if (lastSelectedText) {
    console.log('🔍 Ricerca del testo nella pagina:', lastSelectedText.substring(0, 30));
    range = findTextInPage(lastSelectedText);
  }
  
  if (!range || range.collapsed) {
    console.log('❌ Nessun range valido trovato per l\'evidenziazione');
    return false;
  }
  
  // Applica l'evidenziazione
  return applyHighlight(range, result);
}

// 6. AGGIORNA il listener dei messaggi
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Messaggio ricevuto nel content script:', request.action);
  
  if (request.action === 'getPageContext') {
    const context = getPageContext();
    sendResponse(context);
  } 
  else if (request.action === 'highlightText') {
    console.log('🎯 Richiesta di evidenziazione ricevuta');
    const success = highlightSelection(request.result);
    sendResponse({ success: success });
  } 
  else if (request.action === 'getSelectedText') {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    sendResponse({ text: selectedText });
  }
  
  return true;
});

// Esporta funzioni per l'utilizzo in altri contesti
window.factCheckerTools = {
  getPageContext,
  highlightSelection
};