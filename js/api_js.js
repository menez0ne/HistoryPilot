// history-analyzer-api.js - Module for communication with the AI historical analysis API

/**
 * Class that manages communication with an AI historical analysis service
 */
class HistoryPilotCheckerAPI {
  constructor(apiKey, model) {
    this.apiKey = apiKey;
    this.baseUrl = "https://openrouter.ai/api/v1/chat/completions";
    this.model = model;
    this.yourSiteUrl = "http://localhost:3000"; // Enter your site URL here or leave localhost for development
  }

  /**
   * Checks content via AI historical analysis API
   * @param {string} text - The text to check
   * @returns {Promise<Object>} - Analysis result
   */
  async checkContent(text) {
    // Check that the API key is available
    if (!this.apiKey || this.apiKey.trim() === '') {
      throw new Error('API key not configured. Go to settings to enter a valid API key.');
    }
    try {
      // Prepare the prompt for historical analysis
      const prompt = this.createFactCheckPrompt(text);
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": this.yourSiteUrl
        },
        body: JSON.stringify({
          "model": this.model,
          "messages": [
            {
              "role": "system",
              "content": "You are a professional fact-checker. Your task is to analyze a provided text, that could be in any language, to assess its accuracy. Always provide an objective, fact-based evaluation and be coherent.Don't focus too much on details . Respond ONLY with a valid JSON object, with no explanation, no code blocks, no markdown, and no extra text before or after. Do not include any code formatting or text outside the JSON. The entire response, including all keys and values in the JSON, must be in English.", 
            },
            {
              "role": "user",
              "content": prompt
            }
          ],
          "temperature": 0.1, // Lowered for more consistency
          "max_tokens": 1500
        })
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${response.statusText}. Details: ${errorText}`);
      }
      const data = await response.json();
      console.log('Full API data:', data);
      // Extract the AI response with more detailed checks
      let aiResponse = null;
      if (data && data.choices && Array.isArray(data.choices) && data.choices.length > 0) {
        aiResponse = data.choices[0]?.message?.content?.trim();
      }
      if (!aiResponse) {
        console.error('Unexpected API data structure:', data);
        throw new Error(`Malformed API response. Structure received: ${JSON.stringify(data)}`);
      }
      console.log('Raw AI response:', aiResponse);
      // Clean the response to extract only the JSON
      const cleanedResponse = this.extractJSON(aiResponse);
      // Try to parse the JSON response
      try {
        const parsedResponse = JSON.parse(cleanedResponse);
        return this.formatAIResponse(parsedResponse);
      } catch (parseError) {
        console.warn('JSON parsing error:', parseError);
        console.warn('Cleaned response:', cleanedResponse);
        // Fallback with more robust analysis
        return this.createFallbackResponse(aiResponse, text);
      }
    } catch (error) {
      console.error("Error during AI verification:", error);
      // More detailed logging for debugging
      if (error.message.includes('Malformed API response')) {
        console.error("Problem with API response structure");
      } else if (error.message.includes('API key')) {
        console.error("Problem with API key");
      } else if (error.message.includes('API error:')) {
        console.error("HTTP error from API");
      }
      // More user-friendly fallback response
      return {
        isFake: null,
        explanation: 'The service may be temporarily unavailable. Manual verification is strongly recommended.',
        sources: [],
        reasons: ["Technical error: " + error.message.substring(0, 100)],
        error: true
      };
    }
  }

  /**
   * Extracts JSON from a response that may contain extra text
   * @param {string} response - Full response
   * @returns {string} - Only the JSON part
   */
  extractJSON(response) {
    // Rimuove eventuali blocchi di codice markdown (es: ```json ... ```)
    let cleaned = response.trim();
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch) {
      cleaned = codeBlockMatch[1].trim();
    }
    // Trova il primo { e l'ultimo }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return cleaned.substring(firstBrace, lastBrace + 1);
    }
    // Se non trova le parentesi, restituisce la risposta originale
    return cleaned;
  }

  /**
   * Creates the prompt for historical analysis
   * @param {string} text - Text to analyze
   * @returns {string} - Formatted prompt
   */
  createFactCheckPrompt(text) {
    return `Act as a professional fact checker. Analyze the text selected by the user, focusing on the main fact and the overall context. Avoid being overly attached to minor details or irrelevant specifics.

Return your analysis ONLY in valid JSON format, following this structure and using EXACTLY these keys in English:

{
  "isFake": true/false/null,
  "explanation": "A brief, clear, and non-repetitive explanation of the evaluation, specifying any inaccuracies or errors found, always focusing on the main fact and the general context. The explanation MUST be consistent with the value of isFake.",
  "sources": [
    "URL or reference of source 1",
    "URL or reference of source 2"
  ]
}

- Set isFake to true ONLY if the main fact is actually false or misleading.
- Set isFake to false if the main fact is correct, even if there are minor inaccuracies or irrelevant details.
- Set isFake to null if it is not possible to determine the truth of the main fact.
- If the main fact is correct, clearly state this in the explanation and do NOT invent errors or issues that are not present in the text.
- The explanation MUST justify and be consistent with the value of isFake.
- Do NOT repeat the same information or contradict yourself.
- Do NOT focus on minor details or repeat information.

Example for a correct fact:
Input: "Donald John Trump (New York, June 14, 1946) is an American politician, businessman, and television personality."
Output:
{
  "isFake": false,
  "explanation": "The main fact is correct. Donald John Trump was born on June 14, 1946, in New York and is an American politician, businessman, and television personality.",
  "sources": ["https://en.wikipedia.org/wiki/Donald_Trump"]
}

DO NOT add text, code blocks, or markdown before or after the JSON. Respond ONLY with the JSON object. The entire response must be in English.

Text to analyze:
"${text}"
`;
  }

  /**
   * Formats the AI response in the format required by the extension
   * @param {Object} aiResponse - Already parsed AI response
   * @returns {Object} - Formatted response
   */
  formatAIResponse(aiResponse) {
    return {
      isFake: Boolean(aiResponse.isFake),
      explanation: aiResponse.explanation || "Historical analysis completed by AI",
      sources: Array.isArray(aiResponse.sources) && aiResponse.sources.length > 0 ? aiResponse.sources : [
        "Check with academic historical sources",
        "Consult reliable historical encyclopedias",
        "Look for consensus in the historiographical community"
      ],
      reasons: Array.isArray(aiResponse.reasons) && aiResponse.reasons.length > 0 ? aiResponse.reasons : ["General analysis completed"]
    };
  }

  /**
   * Creates a fallback response when JSON parsing fails
   * @param {string} textResponse - AI text response
   * @param {string} originalText - Original analyzed text
   * @returns {Object} - Analysis result
   */
  createFallbackResponse(textResponse, originalText) {
    const lowerResponse = textResponse.toLowerCase();
    // Look for indicators of historical inaccuracy in the response
    const fakeIndicators = [
      'not accurate', 'historically false', 'wrong', 'anachronistic', 'decontextualized',
      'propaganda', 'myth', 'legend', 'biased interpretation', 'not supported by sources',
      'non accurato', 'storicamente falso', 'errato', 'anacronistico', 'decontestualizzato',
      'propaganda', 'mito', 'leggenda', 'interpretazione di parte', 'non supportato da fonti'
    ];
    const realIndicators = [
      'historically accurate', 'correct', 'well documented', 'consistent with sources',
      'reliable', 'plausible', 'historiographical consensus', 'supported by evidence',
      'storicamente accurato', 'corretto', 'ben documentato', 'coerente con le fonti',
      'attendibile', 'plausibile', 'consenso storiografico', 'supportato da prove'
    ];
    const fakeScore = fakeIndicators.filter(word => lowerResponse.includes(word)).length;
    const realScore = realIndicators.filter(word => lowerResponse.includes(word)).length;
    // Extract sentences from the response as reasons
    const sentences = textResponse.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const reasons = sentences.slice(0, 3).map(s => s.trim());
    return {
      isFake: null,
      explanation: 'The service may be temporarily unavailable. Manual verification is strongly recommended.',
      sources: [],
      reasons: reasons.length > 0 ? reasons : [
        fakeScore > realScore ? 
        "Possible indicators of historical inaccuracy detected" : 
        "The content appears generally historically plausible"
      ],
      error: true
    };
  }
}

// Make the class globally available for use in service workers
if (typeof globalThis !== 'undefined') {
  globalThis.HistoryPilotCheckerAPI = HistoryPilotCheckerAPI;
} else if (typeof self !== 'undefined') {
  self.HistoryPilotCheckerAPI = HistoryPilotCheckerAPI;
}