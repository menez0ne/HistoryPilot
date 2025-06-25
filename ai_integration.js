/**
 * Class that manages AI integration for fact checking
 */
class HistoryPilotAIChecker {
  constructor(apiKey = null) {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('API key required for the extension to work');
    }
    // Check that HistoryPilotCheckerAPI is available
    if (typeof HistoryPilotCheckerAPI === 'undefined') {
      throw new Error('HistoryPilotCheckerAPI not available');
    }
    this.api = new HistoryPilotCheckerAPI(apiKey);
    this.contextData = {};
    this.apiKey = apiKey;
  }

  /**
   * Analyzes content to verify its historical accuracy
   * @param {string} content - The text to analyze
   * @param {Object} pageContext - Web page information
   * @returns {Promise<Object>} - Analysis result
   */
  async analyzeContent(content, pageContext = {}) {
    try {
      this.contextData = pageContext;
      const result = await this.api.checkContent(content);
      // Standardize keys to English
      if (result && typeof result === 'object') {
        if ('valutazione' in result) {
          result.isFake = result.valutazione === 'falso' ? true : (result.valutazione === 'vero' ? false : null);
          delete result.valutazione;
        }
        if ('spiegazione' in result) {
          result.explanation = result.spiegazione;
          delete result.spiegazione;
        }
        if ('fonti' in result) {
          result.sources = result.fonti;
          delete result.fonti;
        }
      }
      return this.enhanceResult(result);
    } catch (error) {
      console.error('Error during AI analysis:', error);
      // Return a specific error result
      if (error.message.includes('API key')) {
        return {
          isFake: null,
          explanation: 'API key not configured or invalid. Go to settings to enter a valid API key.',
          sources: [],
          error: 'API_KEY_MISSING'
        };
      }
      return {
        isFake: null,
        explanation: 'Unable to complete the analysis due to a connection or AI service error: ' + error.message,
        sources: [],
        error: 'API_ERROR'
      };
    }
  }

  /**
   * Processes text for more effective analysis
   * @param {string} text - Original text
   * @returns {string} - Processed text
   */
  preprocessText(text) {
    // Remove excess spaces
    let processed = text.trim();
    // Remove special characters that may interfere with analysis
    processed = processed.replace(/[^\w\s.,;:!?"'()\-]/g, ' ');
    // Remove multiple spaces
    processed = processed.replace(/\s+/g, ' ');
    return processed;
  }

  /**
   * Enriches the analysis result with additional information
   * @param {Object} result - Analysis result
   * @returns {Object} - Enriched result
   */
  enhanceResult(result) {
    let cleanResult = {
      isFake: result.isFake,
      explanation: result.explanation || 'Analysis completed by artificial intelligence.',
      sources: result.sources || [],
    };

    // If explanation is a JSON string, parse it
    if (typeof cleanResult.explanation === 'string') {
      if (cleanResult.explanation.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(cleanResult.explanation);
          cleanResult = {
            ...cleanResult,
            isFake: parsed.isFake !== undefined ? parsed.isFake : cleanResult.isFake,
            explanation: parsed.explanation || cleanResult.explanation,
            sources: parsed.sources || cleanResult.sources
          };
        } catch (e) {
          // Ignore parse error
        }
      }
      // If explanation contains embedded JSON
      if (cleanResult.explanation.includes('{"isFake"')) {
        const jsonMatch = cleanResult.explanation.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            cleanResult = {
              ...cleanResult,
              isFake: parsed.isFake !== undefined ? parsed.isFake : cleanResult.isFake,
              explanation: parsed.explanation || cleanResult.explanation,
              sources: parsed.sources || cleanResult.sources
            };
          } catch (e) {
            // Remove only the JSON from the text
            cleanResult.explanation = cleanResult.explanation.replace(jsonMatch[0], '').trim();
          }
        }
      }
    }

    // Ensure explanation is not empty
    if (!cleanResult.explanation || cleanResult.explanation.trim().length < 10) {
      cleanResult.explanation = 'Analysis completed by advanced artificial intelligence.';
    }

    // Filter sources to remove empty or generic ones
    if (Array.isArray(cleanResult.sources)) {
      cleanResult.sources = cleanResult.sources.filter(source =>
        source &&
        typeof source === 'string' &&
        source.trim().length > 0
      );
    } else {
      cleanResult.sources = [];
    }

    // Add domain warning if needed (keep this logic)
    if (this.contextData && this.contextData.domain) {
      const knownFakeDomains = [
        'fakenews24.it', 'notiziefalse.com', 'ilgiornalefake.it',
        'bufale.net', 'disinformazione.it', 'clickbait24.com'
      ];
      if (knownFakeDomains.some(domain =>
          this.contextData.domain.includes(domain))) {
        cleanResult.domainWarning = 'This site is known for spreading false or misleading content.';
      }
    }

    return cleanResult;
  }

  /**
   * Checks if the API key is properly configured
   * @returns {boolean} - True if the API key is present
   */
  isConfigured() {
    return this.apiKey && this.apiKey.trim() !== '';
  }
}

// Make the class globally available for use in service workers
if (typeof globalThis !== 'undefined') {
  globalThis.HistoryPilotAIChecker = HistoryPilotAIChecker;
} else if (typeof self !== 'undefined') {
  self.HistoryPilotAIChecker = HistoryPilotAIChecker;
}