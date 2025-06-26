// Main script that manages the extension popup (AI mode only)
// CSP-compliant version with auto-deletion of results after 30 seconds

document.addEventListener('DOMContentLoaded', function() {
  // Recupera gli ultimi risultati di verifica dalle storage
  chrome.storage.local.get(['lastVerification'], function(result) {
    if (result.lastVerification) {
      displayResults(result.lastVerification);
      // Avvia il timer di auto-eliminazione dopo 30 secondi
      startAutoDeleteTimer();
    } else {
      // Mostra il messaggio di istruzioni se non ci sono risultati precedenti
      showInstructions();
    }
  });
  
  // Gestisce il pulsante delle opzioni
  setupOptionsButton();
  
  // Gestisce il pulsante della cronologia
  setupHistoryButton();
  
  // Gestisce tutte le icone
  setupAllIcons();
  
  // Imposta la gestione dell'auto-eliminazione alla chiusura del popup
  setupAutoCleanup();
});

// Global timer for auto-deletion
let autoDeleteTimer = null;

// Function to start the auto-delete timer after 30 seconds
function startAutoDeleteTimer() {
  // Clear previous timer if exists
  if (autoDeleteTimer) {
    clearTimeout(autoDeleteTimer);
  }
  // Start new timer
  autoDeleteTimer = setTimeout(function() {
    console.log('Auto-deletion triggered after 30 seconds');
    // Delete results and show instructions
    clearLastVerificationResults();
    // Hide results and show instructions
    const resultContainer = document.getElementById('result-container');
    const loading = document.getElementById('loading');
    if (resultContainer) {
      resultContainer.style.display = 'none';
    }
    if (loading) {
      loading.style.display = 'none';
    }
    // Clear timer
    autoDeleteTimer = null;
    console.log('Results automatically deleted after 30 seconds');
  }, 30000); // 30 seconds
}

// Funzione per cancellare il timer di auto-eliminazione
function cancelAutoDeleteTimer() {
  if (autoDeleteTimer) {
    clearTimeout(autoDeleteTimer);
    autoDeleteTimer = null;
    console.log('Timer di auto-eliminazione cancellato');
  }
}

// Funzione per impostare l'auto-eliminazione dei risultati alla chiusura
function setupAutoCleanup() {
  // Gestisce la chiusura del popup
  window.addEventListener('beforeunload', function() {
    cancelAutoDeleteTimer();
    clearLastVerificationResults();
  });
  
  // Fallback per alcuni browser che potrebbero non supportare beforeunload nei popup
  window.addEventListener('unload', function() {
    cancelAutoDeleteTimer();
    clearLastVerificationResults();
  });
  
  // Gestisce anche la perdita di focus (quando l'utente clicca fuori dal popup)
  window.addEventListener('blur', function() {
    // Piccolo delay per evitare cancellazioni accidentali durante il normale utilizzo
    setTimeout(function() {
      // Verifica se il popup è ancora visibile/attivo
      if (document.hidden || !document.hasFocus()) {
        cancelAutoDeleteTimer();
        clearLastVerificationResults();
      }
    }, 100);
  });
  
  // Ascolta anche il messaggio di chiusura dal background script se implementato
  chrome.runtime.onMessage.addListener(function(message) {
    if (message.action === 'popupClosed') {
      cancelAutoDeleteTimer();
      clearLastVerificationResults();
    }
  });
}

// Funzione per eliminare solo i risultati temporanei del popup
function clearLastVerificationResults() {
  try {
    // Elimina solo i risultati temporanei, NON la cronologia
    chrome.storage.local.remove(['lastVerification'], function() {
      if (chrome.runtime.lastError) {
        console.log('Errore nella pulizia dei risultati temporanei:', chrome.runtime.lastError);
      } else {
        console.log('Risultati temporanei eliminati');
      }
    });
  } catch (error) {
    console.error('Errore durante la pulizia automatica:', error);
  }
}

// Funzione per creare elementi HTML in modo sicuro
function createSafeElement(tag, content, className) {
  const element = document.createElement(tag);
  if (content) {
    element.textContent = content;
  }
  if (className) {
    element.className = className;
  }
  return element;
}

// Funzione per impostare HTML in modo sicuro
function setSafeHTML(element, content) {
  // Pulisce l'elemento
  element.textContent = '';
  
  // Se il contenuto contiene <br>, lo gestiamo manualmente
  if (content.includes('<br>')) {
    const parts = content.split('<br>');
    parts.forEach((part, index) => {
      if (index > 0) {
        element.appendChild(document.createElement('br'));
      }
      const textNode = document.createTextNode(part);
      element.appendChild(textNode);
    });
  } else if (content.includes('<em>') || content.includes('<strong>')) {
    // Gestione sicura di tag specifici
    const tempDiv = document.createElement('div');
    tempDiv.textContent = content.replace(/<em>/g, '').replace(/<\/em>/g, '').replace(/<strong>/g, '').replace(/<\/strong>/g, '');
    element.appendChild(tempDiv);
  } else {
    element.textContent = content;
  }
}

// Funzione per creare link sicuri
function createSafeLink(href, text) {
  const link = document.createElement('a');
  link.href = href;
  link.textContent = text;
  link.target = '_blank';
  link.style.color = '#3498db';
  link.style.textDecoration = 'none';
  return link;
}

// Function to show instructions when there are no results
function showInstructions() {
  const resultContainer = document.getElementById('result-container');
  const loading = document.getElementById('loading');
  loading.style.display = 'none';
  resultContainer.style.display = 'none';
  // Instructions are already visible in the HTML
}

// Function to parse the AI response JSON if it is a string
function parseAIResponse(data) {
  console.log('Data received for parsing:', data);
  // Case 1: If data.spiegazione contains a JSON as string, try to parse it
  if (typeof data.spiegazione === 'string' && data.spiegazione.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(data.spiegazione);
      console.log('JSON parsed from spiegazione:', parsed);
      return {
        ...data,
        valutazione: parsed.valutazione !== undefined ? parsed.valutazione : data.valutazione,
        spiegazione: parsed.spiegazione || data.spiegazione,
        fonti: parsed.fonti || data.fonti || [],
        confidence: parsed.confidence || data.confidence,
        analysisMethod: parsed.analysisMethod || data.analysisMethod,
        reasons: parsed.reasons || []
      };
    } catch (e) {
      console.log('Error parsing JSON from spiegazione:', e);
    }
  }
  // Case 2: If the entire data is a JSON string
  if (typeof data === 'string' && data.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(data);
      console.log('JSON parsed from entire data:', parsed);
      return parsed;
    } catch (e) {
      console.log('Error parsing JSON from entire data:', e);
    }
  }
  // Case 3: If data.spiegazione contains text followed by JSON
  if (typeof data.spiegazione === 'string' && data.spiegazione.includes('{"valutazione"')) {
    try {
      // Find JSON inside the text
      const jsonMatch = data.spiegazione.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log('JSON extracted from text:', parsed);
        return {
          ...data,
          valutazione: parsed.valutazione !== undefined ? parsed.valutazione : data.valutazione,
          spiegazione: parsed.spiegazione || 'Analysis completed by advanced AI.',
          fonti: parsed.fonti || [],
          confidence: parsed.confidence || data.confidence,
          analysisMethod: parsed.analysisMethod || data.analysisMethod,
          reasons: parsed.reasons || []
        };
      }
    } catch (e) {
      console.log('Error extracting JSON from text:', e);
    }
  }
  return data;
}

// Function to clean and format the AI explanation
function formatExplanation(rawExplanation) {
  if (rawExplanation && rawExplanation.trim().length > 3) {
    return rawExplanation.trim();
  }
  return 'Analysis completed by artificial intelligence.';
}

// Function to create the sources section safely
function createSourcesSection(data) {
  const sourcesContainer = document.createElement('div');
  const title = createSafeElement('strong', "Sources used by AI:");
  sourcesContainer.appendChild(title);
  sourcesContainer.appendChild(document.createElement('br'));
  const hasRealSources = data.sources && Array.isArray(data.sources) && data.sources.length > 0;
  if (hasRealSources) {
    const realSources = data.sources.filter(source =>
      source &&
      source.trim().length > 0 &&
      !source.includes('Informazioni biografiche standard') &&
      !source.includes('Nessuna affermazione straordinaria') &&
      !source.includes('Coerente con fatti noti')
    );
    if (realSources.length > 0) {
      const ul = document.createElement('ul');
      ul.style.paddingLeft = '18px';
      ul.style.margin = '8px 0';
      realSources.forEach(source => {
        const li = document.createElement('li');
        li.style.wordBreak = 'break-all';
        li.style.overflowWrap = 'anywhere';
        if (source.startsWith('http')) {
          const displayUrl = source.length > 60 ? source.substring(0, 60) + '...' : source;
          const link = createSafeLink(source, displayUrl);
          li.appendChild(link);
        } else {
          li.textContent = source;
        }
        ul.appendChild(li);
      });
      sourcesContainer.appendChild(ul);
    } else {
      const defaultText = document.createTextNode("The AI analyzed the content based on its general knowledge");
      sourcesContainer.appendChild(defaultText);
      sourcesContainer.appendChild(document.createElement('br'));
    }
  } else {
    const defaultText = document.createTextNode("The AI analyzed the content based on its general knowledge");
    sourcesContainer.appendChild(defaultText);
    sourcesContainer.appendChild(document.createElement('br'));
  }
  return sourcesContainer;
}

// Function to show the results in the popup (CSP-compliant)
function displayResults(rawData) {
  const resultContainer = document.getElementById('result-container');
  const verificationResult = document.getElementById('verification-result');
  const explanation = document.getElementById('explanation');
  const sources = document.getElementById('sources');
  const loading = document.getElementById('loading');
  const disclaimer = document.getElementById('disclaimer');

  // Hide loader
  loading.style.display = 'none';
  // Show results container
  resultContainer.style.display = 'block';

  // Hide disclaimer by default
  if (disclaimer) {
    disclaimer.style.display = 'none';
  }

  // Parse AI response if needed
  const data = parseAIResponse(rawData);
  // Handle error cases
  if (data.error || data.valutazione === null) {
    verificationResult.innerHTML = '<span class="result-icon">\u26a0\ufe0f</span> Analysis error';
    verificationResult.className = 'result-header result-error';
    if (data.error === 'API_KEY_MISSING') {
      // Create error content safely
      explanation.textContent = '';
      explanation.appendChild(document.createTextNode('API key not configured.'));
      explanation.appendChild(document.createElement('br'));
      explanation.appendChild(document.createElement('br'));
      explanation.appendChild(document.createTextNode('To use HistoryPilot, you need to configure an API key in the settings.'));
      explanation.appendChild(document.createElement('br'));
      explanation.appendChild(document.createTextNode('Click the "Settings" button below to configure it.'));
      // Hide or clear sources section on error
      sources.textContent = '';
      sources.classList.add('hidden');
    } else {
      const cleanExplanation = formatExplanation(data.explanation);
      setSafeHTML(explanation, cleanExplanation);
      // Hide or clear sources section on error
      sources.textContent = '';
      sources.classList.add('hidden');
    }
    return;
  } else {
    // Show sources section if not error
    sources.classList.remove('hidden');
  }
  // Set verification result for successful analysis
  if (data.isFake === true) {
    verificationResult.innerHTML = '<span class="result-icon">❌</span> Potential Fake News';
    verificationResult.className = 'result-header result-fake';
    if (disclaimer) disclaimer.style.display = 'block';
  } else if (data.isFake === false) {
    verificationResult.innerHTML = '<span class="result-icon">✅</span> Reliable Content';
    verificationResult.className = 'result-header result-real';
    if (disclaimer) disclaimer.style.display = 'block';
  } else {
    verificationResult.innerHTML = '<span class="result-icon">⚠️</span> Error';
    verificationResult.className = 'result-header result-error';
  }
  // Format explanation safely
  const cleanExplanation = formatExplanation(data.explanation);
  setSafeHTML(explanation, cleanExplanation);
  // Create sources safely
  sources.textContent = '';
  // Mostra la sezione delle fonti solo se ci sono fonti reali e non siamo in errore
  if (!data.error && Array.isArray(data.sources) && data.sources.length > 0) {
    const sourcesSection = createSourcesSection(data);
    sources.appendChild(sourcesSection);
  }
  // Add warning for suspicious domains if present
  if (data.domainWarning) {
    sources.appendChild(document.createElement('br'));
    const warningStrong = createSafeElement('strong', '\u26a0\ufe0f Warning:');
    sources.appendChild(warningStrong);
    sources.appendChild(document.createTextNode(` ${data.domainWarning}`));
    sources.appendChild(document.createElement('br'));
  }
  // Add analysis reasons if useful and not generic
  if (data.reasons && Array.isArray(data.reasons) && data.reasons.length > 0) {
    const meaningfulReasons = data.reasons.filter(reason => 
      reason && 
      reason.length > 10 && 
      !reason.includes('Informazioni biografiche standard') &&
      !reason.includes('Nessuna affermazione straordinaria')
    );
    if (meaningfulReasons.length > 0) {
      sources.appendChild(document.createElement('br'));
      const detailsTitle = createSafeElement('strong', 'Analysis details:');
      sources.appendChild(detailsTitle);
      sources.appendChild(document.createElement('br'));
      meaningfulReasons.forEach(reason => {
        sources.appendChild(document.createTextNode(`\u2022 ${reason}`));
        sources.appendChild(document.createElement('br'));
      });
    }
  }
}

// Ascolta i messaggi dal background script
chrome.runtime.onMessage.addListener(function(message) {
  if (message.action === 'showLoading') {
    // Cancella il timer esistente quando inizia una nuova analisi
    cancelAutoDeleteTimer();
    showLoading();
  } else if (message.action === 'updateResults') {
    displayResults(message.data);
    // Avvia il timer dopo aver mostrato i nuovi risultati
    startAutoDeleteTimer();
  }
});

// Mostra lo stato di caricamento
function showLoading() {
  const loading = document.getElementById('loading');
  const resultContainer = document.getElementById('result-container');
  
  loading.style.display = 'block';
  resultContainer.style.display = 'none';
}

// Configura il pulsante delle opzioni 
function setupOptionsButton() {
  const optionsButton = document.getElementById('openOptions');
  if (optionsButton) {
    optionsButton.addEventListener('click', function() {
      if (chrome.runtime.openOptionsPage) {
        // Metodo standard per Chrome 42+
        chrome.runtime.openOptionsPage();
      } else {
        // Fallback per versioni precedenti
        window.open(chrome.runtime.getURL('options.html'));
      }
    });
  }
}

// Configura il pulsante della cronologia
function setupHistoryButton() {
  const historyButton = document.getElementById('openHistory');
  if (historyButton) {
    historyButton.addEventListener('click', function() {
      // Apre la pagina della cronologia in una nuova tab
      chrome.tabs.create({
        url: chrome.runtime.getURL('history.html')
      });
    });
  }
}

// Gestisce tutte le icone dell'interfaccia
function setupAllIcons() {
  // Gestisce l'icona delle impostazioni
  const settingsIcon = document.getElementById('settingsIcon');
  if (settingsIcon) {
    settingsIcon.addEventListener('error', function() {
      // Nascondi l'icona se non riesce a caricare
      this.style.display = 'none';
    });
  }
  
  // Gestisce l'icona della cronologia
  const historyIcon = document.getElementById('historyIcon');
  if (historyIcon) {
    historyIcon.addEventListener('error', function() {
      // Nascondi l'icona se non riesce a caricare
      this.style.display = 'none';
    });
  }
  
  // Gestisce l'icona del logo
  const logoIcon = document.getElementById('logoIcon');
  if (logoIcon) {
    logoIcon.addEventListener('error', function() {
      // Nascondi l'icona se non riesce a caricare
      this.style.display = 'none';
    });
  }
}

// Gestione degli errori globali
window.addEventListener('error', function(event) {
  console.error('Errore globale nel popup:', event.error);
});

window.addEventListener('unhandledrejection', function(event) {
  console.error('Promise rejection non gestita nel popup:', event.reason);
  event.preventDefault();
});

function renderResult(result) {
  // Assicurati che le chiavi siano in inglese
  let isFake = result.isFake;
  let explanation = result.explanation;
  let sources = result.sources;
  // ... rendering ...
}

function handleAIResponse(aiResult) {
  // Assicurati che le chiavi siano in inglese
  let result = aiResult;
  if ('valutazione' in aiResult) {
    result.isFake = aiResult.valutazione === 'falso' ? true : (aiResult.valutazione === 'vero' ? false : null);
    delete result.valutazione;
  }
  if ('spiegazione' in aiResult) {
    result.explanation = aiResult.spiegazione;
    delete result.spiegazione;
  }
  if ('fonti' in aiResult) {
    result.sources = aiResult.fonti;
    delete result.fonti;
  }
  renderResult(result);
}
