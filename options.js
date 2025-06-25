// Script to manage the extension options (AI mode only)
// On document load, initialize values from saved settings
document.addEventListener('DOMContentLoaded', function() {
  // Load saved settings
  loadSavedSettings();
  // Set up button listeners
  document.getElementById('saveApiKey').addEventListener('click', saveApiKey);
  document.getElementById('saveAll').addEventListener('click', saveAllSettings);
});
// Load saved settings from local storage
function loadSavedSettings() {
  chrome.storage.sync.get({
    // Default values (analysisMode and highlightText removed)
    apiKey: '',
    showNotifications: true
  }, function(items) {
    // Check for errors
    if (chrome.runtime.lastError) {
      console.error('Error loading settings:', chrome.runtime.lastError);
      return;
    }
    // Set values in form fields
    document.getElementById('apiKey').value = items.apiKey;
    // Set checkbox for notifications
    document.getElementById('showNotifications').checked = items.showNotifications;
  });
}
// Save only the API key
async function saveApiKey() {
  const apiKey = document.getElementById('apiKey').value.trim();
  // Save sincronamente e attendi conferma
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
    // Notifica il background script e attendi conferma
    await notifyBackgroundScript();
  } catch (error) {
    showStatus('Error saving API key: ' + error.message, 'error');
  }
}
// Save all settings
async function saveAllSettings() {
  // Get values from form fields
  const apiKey = document.getElementById('apiKey').value.trim();
  // Get checkbox values
  const showNotifications = document.getElementById('showNotifications').checked;
  try {
    // Save all settings synchronously
    await new Promise((resolve, reject) => {
      chrome.storage.sync.set({
        apiKey: apiKey,
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
    // Notify the background script and wait for confirmation
    await notifyBackgroundScript();
  } catch (error) {
    showStatus('Error saving settings: ' + error.message, 'error');
  }
}
// Separate function to notify the background script
async function notifyBackgroundScript() {
  try {
    // Check if chrome.runtime is available
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      // Send message and wait for response
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
    // Handle error silently if there is no listener
    console.log('Error notifying background script:', error.message);
    // Do not show error to user if it's just a communication problem
    // Settings are already saved correctly in storage
  }
}
// Show a status message to the user
function showStatus(message, type) {
  const statusElement = document.getElementById('status');
  statusElement.textContent = message;
  statusElement.className = 'status ' + type;
  statusElement.style.display = 'block';
  // Hide the message after 3 seconds
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
  // Prevent error from showing in browser console
  event.preventDefault();
});