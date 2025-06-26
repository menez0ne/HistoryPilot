// Script to manage the extension options (AI mode only)

// On document load, initialize everything
document.addEventListener('DOMContentLoaded', async () => {
  // Set up button listeners first
  document.getElementById('saveApiKey').addEventListener('click', saveApiKey);
  document.getElementById('saveAll').addEventListener('click', saveAllSettings);

  // --- Populate Model Dropdown ---
  const modelSelect = document.getElementById('modelSelect');
  const url = 'https://openrouter.ai/api/v1/models';
  const options = { method: 'GET' };

  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    modelSelect.innerHTML = ''; // Clear any placeholders

    // Add a disabled, non-selectable default option
    const defaultOption = document.createElement('option');
    defaultOption.value = "";
    defaultOption.textContent = "Select a model";
    defaultOption.disabled = true;
    modelSelect.appendChild(defaultOption);

    // Populate with models from the API
    if (data && data.data) {
      data.data.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name;
        modelSelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Failed to fetch models:', error);
    modelSelect.innerHTML = '<option value="">Could not load models</option>';
  } finally {
    // CRITICAL: Load saved settings AFTER the model list is populated.
    // This ensures the saved model value can be correctly applied to the dropdown.
    loadSavedSettings();
  }
});

// Load saved settings from local storage
function loadSavedSettings() {
  chrome.storage.sync.get({
    // Default values
    apiKey: '',
    aiModel: 'mistralai/mistral-small-3.2-24b-instruct-2506:free',
    showNotifications: true
  }, function(items) {
    // Check for errors
    if (chrome.runtime.lastError) {
      console.error('Error loading settings:', chrome.runtime.lastError);
      return;
    }
    // Set values in form fields
    document.getElementById('apiKey').value = items.apiKey;
    document.getElementById('modelSelect').value = items.aiModel || ""; // Set saved model, fallback to empty
    document.getElementById('showNotifications').checked = items.showNotifications;
  });
}

// Save only the API key
async function saveApiKey() {
  const apiKey = document.getElementById('apiKey').value.trim();
  try {
    await new Promise((resolve, reject) => {
      chrome.storage.sync.set({
        apiKey: apiKey
      }, function() {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
    showStatus('API key saved successfully!', 'success');
    await notifyBackgroundScript();
  } catch (error) {
    showStatus('Error saving API key: ' + error.message, 'error');
  }
}

// Save all settings
async function saveAllSettings() {
  // Get values from form fields
  const apiKey = document.getElementById('apiKey').value.trim();
  const aiModel = document.getElementById('modelSelect').value; // Get the selected model
  const showNotifications = document.getElementById('showNotifications').checked;

  // Add validation to ensure a model is selected
  if (!aiModel) {
    showStatus('Please select a model before saving.', 'error');
    return; // Stop the function if no model is selected
  }

  try {
    // Save all settings synchronously
    await new Promise((resolve, reject) => {
      chrome.storage.sync.set({
        apiKey: apiKey,
        aiModel: aiModel, // Save the selected AI model
        showNotifications: showNotifications
      }, function() {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
    showStatus('All settings saved successfully!', 'success');
    await notifyBackgroundScript();
  } catch (error) {
    showStatus('Error saving settings: ' + error.message, 'error');
  }
}

// Separate function to notify the background script
async function notifyBackgroundScript() {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'settingsUpdated'
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
      console.log('Settings update notified to background script:', response);
    }
  } catch (error) {
    console.log('Error notifying background script:', error.message);
  }
}

// Show a status message to the user
function showStatus(message, type) {
  const statusElement = document.getElementById('status');
  statusElement.textContent = message;
  statusElement.className = 'status ' + type;
  statusElement.style.display = 'block';
  setTimeout(function() {
    statusElement.style.display = 'none';
  }, 3000);
}

// Global error handling to prevent uncaught errors
window.addEventListener('error', function(event) {
  console.error('Global error in options:', event.error);
});
window.addEventListener('unhandledrejection', function(event) {
  console.error('Unhandled promise rejection in options:', event.reason);
  event.preventDefault();
});