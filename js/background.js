try {
  importScripts('api_js.js', 'ai_integration.js');
  console.log('Modules loaded successfully');
} catch (e) {
  console.error('Error loading modules:', e);
}

// Variables
let settings = {
  apiKey: '',
  showNotifications: true,
  highlightText: true
};

// Initialize AIFactChecker if available
let historyPilotChecker = null;

// Function to parse and clean AI results
function parseAndCleanAIResult(rawResult) {
  // If already contains isFake and explanation, return as is (sources always array)
  if (
    typeof rawResult === 'object' &&
    (typeof rawResult.isFake === 'boolean' || rawResult.isFake === null) &&
    typeof rawResult.explanation === 'string'
  ) {
    if (!Array.isArray(rawResult.sources)) {
      rawResult.sources = [];
    }
    return rawResult;
  }

  console.log('Raw result from AI:', rawResult);

  let cleanResult = rawResult;

  // If explanation is a JSON string
  if (typeof rawResult.explanation === 'string' && rawResult.explanation.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(rawResult.explanation);
      cleanResult = {
        ...rawResult,
        isFake: parsed.isFake || rawResult.isFake,
        explanation: parsed.explanation || rawResult.explanation,
        sources: parsed.sources || rawResult.sources || []
      };
    } catch (e) {
      console.log('Error parsing JSON from explanation:', e);
    }
  }

  // If explanation contains embedded JSON
  if (typeof cleanResult.explanation === 'string' && cleanResult.explanation.includes('{"isFake"')) {
    try {
      const jsonMatch = cleanResult.explanation.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        cleanResult = {
          ...cleanResult,
          isFake: parsed.isFake || cleanResult.isFake,
          explanation: parsed.explanation || cleanResult.explanation,
          sources: parsed.sources || cleanResult.sources || []
        };
      }
    } catch (e) {
      console.log('Error extracting JSON from explanation:', e);
    }
  }

  // Ensure sources is always an array
  if (!Array.isArray(cleanResult.sources)) {
    cleanResult.sources = [];
  }

  console.log('Clean result:', cleanResult);
  return cleanResult;
}

// Function to load settings from storage
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({
      apiKey: '',
      aiModel: 'mistralai/mistral-small-3.2-24b-instruct-2506:free',
      showNotifications: true,
      highlightText: true
    }, function(items) {
      settings = items;
      console.log('Settings loaded:', {
        ...settings,
        apiKey: settings.apiKey ? '[PRESENT]' : '[MISSING]'
      });
      resolve();
    });
  });
}

// Function to save the analysis to history
async function saveToHistory(selectedText, result, pageContext) {
  try {
    // Retrieve existing history
    const historyData = await chrome.storage.local.get(['analysisHistory']);
    const history = historyData.analysisHistory || [];
    // Create a new history item
    const historyItem = {
      id: Date.now().toString(), // Unique ID based on timestamp
      timestamp: new Date().toISOString(),
      selectedText: selectedText,
      result: result,
      pageContext: {
        url: pageContext.url,
        title: pageContext.title,
        domain: pageContext.url ? new URL(pageContext.url).hostname : 'Unknown'
      }
    };
    // Add to the beginning of the array (most recent first)
    history.unshift(historyItem);
    // Keep only the last 1000 analyses to avoid storage issues
    if (history.length > 1000) {
      history.splice(1000);
    }
    // Save updated history
    await chrome.storage.local.set({ analysisHistory: history });
    console.log('Analysis saved to history:', historyItem.id);
  } catch (error) {
    console.error('Error saving history:', error);
  }
}

// On extension load
chrome.runtime.onInstalled.addListener(async () => {
  // Create context menu entry
  chrome.contextMenus.create({
    id: "analyzeWithHistoryPilot",
    title: "Analyze with HistoryPilot",
    contexts: ["selection"]
  });
  // Load settings and initialize analyzer
  await initializeExtension();
});

// On restart of extension (service worker reactivated)
chrome.runtime.onStartup.addListener(async () => {
  await initializeExtension();
});

// Function to initialize the extension
async function initializeExtension() {
  // Load settings
  await loadSettings();
  
  // Initialize analyzer with API key if class is available
  if (typeof HistoryPilotAIChecker !== 'undefined' && settings.apiKey) {
    try {
      historyPilotChecker = new HistoryPilotAIChecker(settings.apiKey, settings.aiModel);
      console.log('Analyzer initialized with API key');
    } catch (error) {
      console.error('Error initializing:', error);
      historyPilotChecker = null;
    }
  } else {
    console.log('Analyzer not available or API key missing');
  }
}

// Listen for context menu events
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "analyzeWithHistoryPilot" && info.selectionText) {
    const selectedText = info.selectionText;
    
    // ALWAYS reload settings before each check
    await loadSettings();
    
    // Check if API key is configured
    if (!settings.apiKey || settings.apiKey.trim() === '') {
      // Show error message for missing API key
      const errorResult = {
        isFake: null,
        explanation: 'API key not configured. Go to settings to enter a valid API key to use historical analysis.',
        sources: [],
        confidence: 0,
        error: 'API_KEY_MISSING',
        analysisMethod: "Configuration error"
      };
      
      chrome.storage.local.set({ lastVerification: errorResult });
      
      chrome.runtime.sendMessage({
        action: "updateResults",
        data: errorResult
      }).catch(() => {
        console.log('Popup not open');
      });
      
      if (settings.showNotifications) {
        showNotification(null, "API key required", "Configure the API key in the settings");
      }
      
      return;
    }
    
    // Inform the popup that analysis is in progress
    chrome.runtime.sendMessage({
      action: "showLoading"
    }).catch(() => {
      console.log('Popup not open');
    });
    
    // Gather page information
    chrome.tabs.sendMessage(tab.id, { action: "getPageContext" })
      .then((pageContext) => {
        const context = pageContext || { url: tab.url, title: tab.title };
        analyzeContent(selectedText, context, tab.id);
      })
      .catch(() => {
        // Content script may not be loaded
        const context = { url: tab.url, title: tab.title };
        analyzeContent(selectedText, context, tab.id);
      });
  }
});

// Function to analyze selected content
async function analyzeContent(text, pageContext, tabId) {
  try {
    // Ensure settings are always fresh
    await loadSettings();
    
    // Check again if API key is present after loading
    if (!settings.apiKey || settings.apiKey.trim() === '') {
      throw new Error('API key not configured');
    }
    
    // Always recreate the analyzer with the current API key
    if (typeof HistoryPilotAIChecker !== 'undefined' && settings.apiKey) {
      historyPilotChecker = new HistoryPilotAIChecker(settings.apiKey, settings.aiModel);
    } else {
      throw new Error('AI modules not available');
    }
    
    // Preprocess text
    const processedText = historyPilotChecker.preprocessText(text);
    
    console.log('Running AI analysis with API key');
    const rawResult = await historyPilotChecker.analyzeContent(processedText, pageContext);
    console.log('AI analysis completed, raw result:', rawResult);
    
    // Clean and parse the result
    let result = parseAndCleanAIResult(rawResult);
    console.log('Clean result saved:', result);
    
    // Save results to local storage
    chrome.storage.local.set({ lastVerification: result });
    
    // NEW: Save analysis to history
    await saveToHistory(text, result, pageContext);
    
    // Send results to popup if open
    chrome.runtime.sendMessage({
      action: "updateResults",
      data: result
    }).catch(() => {
      console.log('Popup not open');
    });
    
    // Show notification to user if enabled
    if (settings.showNotifications) {
      if (result.error) {
        showNotification(null, result.analysisMethod || "Analysis error", "Analysis failed: an error occurred during verification.");
      } else {
        showNotification(result.isFake, result.analysisMethod);
      }
    }
    
    // Highlight text on page if enabled (CORRECT VERSION)
    if (settings.highlightText) {
      // Add a small delay to allow the popup to update
      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, {
          action: "highlightText",
          result: result,
          selectedText: text // Also pass the selected text
        }).then(response => {
          if (response && response.success) {
            console.log('Highlight applied successfully');
          } else {
            console.log('Highlight failed');
          }
        }).catch(error => {
          console.log('Content script not available for highlighting:', error);
        });
      }, 500);
    }
    
  } catch (error) {
    console.error("Error during analysis:", error);
    
    let errorMessage = "An error occurred during content analysis.";
    let errorType = "Generic error";
    
    if (error.message.includes('API key')) {
      errorMessage = "API key not configured or invalid. Go to settings to enter a valid API key.";
      errorType = "Configuration error";
    } else if (error.message.includes('connessione') || error.message.includes('network')) {
      errorMessage = "Connection error. Check your internet connection.";
      errorType = "Connection error";
    } else if (error.message.includes('Moduli AI non disponibili')) {
      errorMessage = "AI modules were not loaded correctly. Try reloading the extension.";
      errorType = "Module error";
    }
    
    const errorResult = {
      isFake: null,
      explanation: errorMessage,
      sources: [],
      confidence: 0,
      analysisMethod: errorType,
      error: error.message
    };
    
    chrome.storage.local.set({ lastVerification: errorResult });
    
    // NEW: Also save errors to history for completeness
    await saveToHistory(text, errorResult, pageContext).catch(console.error);
    
    chrome.runtime.sendMessage({
      action: "updateResults",
      data: errorResult
    }).catch(() => {
      console.log('Popup not open');
    });
    
    if (settings.showNotifications) {
      showNotification(null, errorType, errorMessage || "Analysis failed: an error occurred during verification.");
    }
  }
}

// Function to show a notification to the user
function showNotification(isFake, analysisMethod = "Analysis completed", customMessage = null) {
  if (!settings.showNotifications) return;
  
  let message;
  if (customMessage) {
    message = customMessage;
  } else if (isFake === true) {
    message = "The analyzed content does not appear to be historically accurate.";
  } else if (isFake === false) {
    message = "The analyzed content appears to be historically accurate.";
  } else if (isFake === null) {
    message = "The analysis was inconclusive. Manual verification is recommended.";
  } else {
    message = "Analysis completed with an unknown result.";
  }

  // Use a consistent ID to prevent multiple notifications from stacking up.
  const notificationId = "historyPilotAnalysisResult";

  chrome.notifications.create(notificationId, {
    type: "basic",
    iconUrl: "images/icon128.png",
    title: "HistoryPilot - " + analysisMethod,
    message: message,
    priority: 2
  }, () => {
    if (chrome.runtime.lastError) {
      console.error(
        `Notification error: ${chrome.runtime.lastError.message}. ` +
        `This often means the "notifications" permission is missing from your manifest.json file.`
      );
    }
  });
}

// Listen for messages from other extension components
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === "settingsUpdated") {
    console.log('Received settings update');
    
    // Reload settings synchronously
    await loadSettings();
    
    // Reinitialize analyzer with new API key if available
    if (typeof HistoryPilotAIChecker !== 'undefined' && settings.apiKey) {
      try {
        historyPilotChecker = new HistoryPilotAIChecker(settings.apiKey, settings.aiModel);
        console.log('Analyzer reinitialized with new settings');
      } catch (error) {
        console.error('Error reinitializing:', error);
        historyPilotChecker = null;
      }
    } else {
      historyPilotChecker = null;
    }
    
    console.log('Settings reloaded:', {
      ...settings,
      apiKey: settings.apiKey ? '[PRESENT]' : '[MISSING]'
    });
    
    // Send confirmation to sender
    sendResponse({ success: true });
  }
  
  // NEW: Handles opening history page
  if (message.action === "openHistory") {
    try {
      chrome.tabs.create({
        url: chrome.runtime.getURL('history.html')
      });
      sendResponse({ success: true });
    } catch (error) {
      console.error('Error opening history:', error);
      sendResponse({ success: false, error: error.message });
    }
  }
  
  return true;
});

// Listen for changes in settings and update background
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.apiKey) {
    const newApiKey = changes.apiKey.newValue;
    console.log('API key changed, reinitializing analyzer...');
    settings.apiKey = newApiKey;
    
    // Reinitialize analyzer with new API key if available
    if (typeof HistoryPilotAIChecker !== 'undefined' && newApiKey) {
      historyPilotChecker = new HistoryPilotAIChecker(newApiKey, settings.aiModel);
      console.log('Analyzer reinitialized with new settings');
    }
  }
});