import config from '../config/env.js';

/**
 * Service to interact with the Sybill API
 */

/**
 * Parse inline or newline-separated speaker turns (e.g., "Speaker 1 00:00:02\nSo Greg...")
 */
export function parseTranscriptTurns(rawText, baseTime) {
  if (!rawText || typeof rawText !== 'string') return null;

  // Regex 1: Matches "Speaker 1 00:00:02" or "Speaker 1 (00:00:02)" or "Speaker 1: 00:00:02"
  const plaudSpeakerTimeRegex = /(?:^|[\r\n\s]+)(Speaker\s*\d+|[A-Z][a-zA-Z0-9_ -]{1,25}?)(?:[:\s]+|\s*\()(\d{1,2}:\d{2}:\d{2}|\d{2}:\d{2})\)?[:\s]*/g;

  const matches = [];
  let m;
  while ((m = plaudSpeakerTimeRegex.exec(rawText)) !== null) {
    const speakerCandidate = m[1].trim();
    if (/^speaker\s*\d+$/i.test(speakerCandidate) || (/^speaker/i.test(speakerCandidate) && speakerCandidate.length < 20)) {
      matches.push({
        index: m.index + m[0].indexOf(m[1]),
        speaker: speakerCandidate,
        timeStr: m[2],
        fullMatchLength: m[0].length - m[0].indexOf(m[1]),
      });
    }
  }

  // Regex 2: Bracketed timestamps e.g. "[00:00:02] Speaker 1:" or "00:00:02 Speaker 1:"
  if (matches.length === 0) {
    const bracketedRegex = /(?:^|[\r\n\s]+)(?:\[?(\d{1,2}:\d{2}:\d{2}|\d{2}:\d{2})\]?[:\s]+)(Speaker\s*\d+|[A-Z][a-zA-Z0-9_ -]{1,25}?)[:\s]*/g;
    while ((m = bracketedRegex.exec(rawText)) !== null) {
      matches.push({
        index: m.index,
        speaker: m[2].trim(),
        timeStr: m[1],
        fullMatchLength: m[0].length,
      });
    }
  }

  if (matches.length === 0) return null;

  const segments = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const textStart = cur.index + cur.fullMatchLength;
    const textEnd = i + 1 < matches.length ? matches[i + 1].index : rawText.length;
    const utterance = rawText.substring(textStart, textEnd).trim();

    if (!utterance) continue;

    const timeParts = cur.timeStr.split(':').map((n) => parseInt(n, 10));
    let offsetSeconds = 0;
    if (timeParts.length === 3) {
      offsetSeconds = timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
    } else if (timeParts.length === 2) {
      offsetSeconds = timeParts[0] * 60 + timeParts[1];
    }

    const startSec = i === 0 && offsetSeconds <= 3 ? 0.0 : Number(offsetSeconds.toFixed(1));
    const wordCount = utterance.split(/\s+/).length;

    // Calculate endTime based on next turn's startTime or utterance length
    let endSec;
    if (i + 1 < matches.length) {
      const nextParts = matches[i + 1].timeStr.split(':').map((n) => parseInt(n, 10));
      let nextOffset = 0;
      if (nextParts.length === 3) {
        nextOffset = nextParts[0] * 3600 + nextParts[1] * 60 + nextParts[2];
      } else if (nextParts.length === 2) {
        nextOffset = nextParts[0] * 60 + nextParts[1];
      }
      if (nextOffset > offsetSeconds) {
        endSec = Number(nextOffset.toFixed(1));
      } else {
        endSec = Number((startSec + Math.max(1.0, wordCount * 0.35)).toFixed(1));
      }
    } else {
      endSec = Number((startSec + Math.max(2.0, wordCount * 0.35)).toFixed(1));
    }

    const timestampIso = new Date(baseTime + offsetSeconds * 1000).toISOString();
    segments.push({
      speaker: cur.speaker,
      text: utterance,
      startTime: startSec,
      endTime: endSec,
      speaker_name: cur.speaker,
      speakerName: cur.speaker,
      timestamp: timestampIso,
    });
  }

  return segments.length > 0 ? segments : null;
}

/**
 * Format raw transcript into Sybill's required array structure:
 * Array<{ speaker: string, text: string, startTime: number, endTime: number, timestamp: string, speaker_name: string }>
 */
export function formatTranscriptForSybill(rawTranscript, startTimeIso, defaultSpeakerName = 'Speaker') {
  if (!rawTranscript) return undefined;

  const baseTime = startTimeIso ? new Date(startTimeIso).getTime() : Date.now();

  // If passed as an array
  if (Array.isArray(rawTranscript)) {
    // If array has 1 item, check if its text contains embedded speaker/timestamp turns
    if (rawTranscript.length === 1) {
      const singleItem = rawTranscript[0];
      const textToParse = typeof singleItem === 'string' ? singleItem : singleItem.text || singleItem.content || '';
      const parsed = parseTranscriptTurns(textToParse, baseTime);
      if (parsed && parsed.length > 1) {
        return parsed;
      }
    }

    // Check if any element in array needs parsing for embedded turns
    const hasEmbeddedTurns = rawTranscript.some((t) => {
      const text = typeof t === 'string' ? t : t.text || t.content || '';
      return /Speaker\s*\d+\s+\d{1,2}:\d{2}/i.test(text);
    });

    if (hasEmbeddedTurns) {
      const allText = rawTranscript
        .map((t) => (typeof t === 'string' ? t : t.text || t.content || ''))
        .join('\n');
      const parsed = parseTranscriptTurns(allText, baseTime);
      if (parsed && parsed.length > 0) {
        return parsed;
      }
    }

    // Otherwise standard array mapping
    return rawTranscript.map((t, idx) => {
      const speakerName = t.speaker || t.speaker_name || t.speakerName || defaultSpeakerName;
      let startSec = idx * 5.0;
      if (t.startTime !== undefined && t.startTime !== null) {
        startSec = Number(t.startTime);
      }
      let endSec = startSec + 4.5;
      if (t.endTime !== undefined && t.endTime !== null) {
        endSec = Number(t.endTime);
      }
      const timestamp = t.timestamp ? new Date(t.timestamp).toISOString() : new Date(baseTime + startSec * 1000).toISOString();

      return {
        speaker: speakerName,
        text: t.text || t.content || String(t),
        startTime: Number(startSec.toFixed(1)),
        endTime: Number(endSec.toFixed(1)),
        speaker_name: speakerName,
        speakerName: speakerName,
        timestamp,
      };
    });
  }

  // If rawTranscript is a string
  if (typeof rawTranscript === 'string') {
    // Try our speaker-turn parser first
    const parsed = parseTranscriptTurns(rawTranscript, baseTime);
    if (parsed && parsed.length > 0) {
      return parsed;
    }

    // Split on standalone timestamp lines (e.g. "00:00:00\nText...\n00:00:58\nText...")
    const lines = rawTranscript.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const segments = [];
    let currentOffsetMs = 0;
    let currentSpeaker = defaultSpeakerName;
    let currentText = [];

    const timeRegex = /^(?:(\d{1,2}):)?(\d{2}):(\d{2})$/;
    const speakerLineRegex = /^(Speaker\s*\d+|[A-Z][a-zA-Z0-9_\s-]{1,25}):$/i;

    for (const line of lines) {
      const timeMatch = line.match(timeRegex);
      const speakerMatch = line.match(speakerLineRegex);

      if (timeMatch) {
        if (currentText.length > 0) {
          const wordCount = currentText.join(' ').split(/\s+/).length;
          const startSec = Number((currentOffsetMs / 1000).toFixed(1));
          const hours = parseInt(timeMatch[1] || '0', 10);
          const minutes = parseInt(timeMatch[2] || '0', 10);
          const seconds = parseInt(timeMatch[3] || '0', 10);
          const nextOffsetMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
          const endSec = Number(Math.max(startSec + 1.0, nextOffsetMs / 1000).toFixed(1));

          segments.push({
            speaker: currentSpeaker,
            text: currentText.join(' '),
            startTime: startSec,
            endTime: endSec,
            speaker_name: currentSpeaker,
            speakerName: currentSpeaker,
            timestamp: new Date(baseTime + currentOffsetMs).toISOString(),
          });
          currentText = [];
        }
        const hours = parseInt(timeMatch[1] || '0', 10);
        const minutes = parseInt(timeMatch[2] || '0', 10);
        const seconds = parseInt(timeMatch[3] || '0', 10);
        currentOffsetMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
      } else if (speakerMatch) {
        if (currentText.length > 0) {
          const wordCount = currentText.join(' ').split(/\s+/).length;
          const startSec = Number((currentOffsetMs / 1000).toFixed(1));
          const endSec = Number((startSec + Math.max(1.0, wordCount * 0.35)).toFixed(1));

          segments.push({
            speaker: currentSpeaker,
            text: currentText.join(' '),
            startTime: startSec,
            endTime: endSec,
            speaker_name: currentSpeaker,
            speakerName: currentSpeaker,
            timestamp: new Date(baseTime + currentOffsetMs).toISOString(),
          });
          currentText = [];
          currentOffsetMs += 5000;
        }
        currentSpeaker = speakerMatch[1];
      } else if (!/^\d+$/.test(line)) {
        currentText.push(line);
      }
    }

    if (currentText.length > 0) {
      const wordCount = currentText.join(' ').split(/\s+/).length;
      const startSec = Number((currentOffsetMs / 1000).toFixed(1));
      const endSec = Number((startSec + Math.max(2.0, wordCount * 0.35)).toFixed(1));

      segments.push({
        speaker: currentSpeaker,
        text: currentText.join(' '),
        startTime: startSec,
        endTime: endSec,
        speaker_name: currentSpeaker,
        speakerName: currentSpeaker,
        timestamp: new Date(baseTime + currentOffsetMs).toISOString(),
      });
    }

    // Fallback for single text block without timestamps
    if (segments.length === 0 && rawTranscript.trim()) {
      const wordCount = rawTranscript.trim().split(/\s+/).length;
      segments.push({
        speaker: defaultSpeakerName,
        text: rawTranscript.trim(),
        startTime: 0.0,
        endTime: Number(Math.max(5.0, wordCount * 0.35).toFixed(1)),
        speaker_name: defaultSpeakerName,
        speakerName: defaultSpeakerName,
        timestamp: new Date(baseTime).toISOString(),
      });
    }

    return segments.length > 0 ? segments : undefined;
  }

  return undefined;
}

/**
 * Create a new conversation in Sybill
 * @param {Object} conversationData
 * @param {string} conversationData.id - Unique external ID (e.g. Plaud meeting ID)
 * @param {string} [conversationData.sourceId] - Sybill source ID
 * @param {string} conversationData.displayName - Meeting title
 * @param {string} conversationData.createdAt - ISO timestamp
 * @param {string} conversationData.startedAt - ISO timestamp
 * @param {string} [conversationData.endedAt] - ISO timestamp
 * @param {Array<{ email: string, name: string }>} conversationData.participants
 * @param {string} [conversationData.recordingUrl]
 * @param {string|Array} [conversationData.transcript]
 * @param {boolean} [conversationData.public]
 * @param {string[]} conversationData.ownerEmails
 * @returns {Promise<{ success: boolean, statusCode: number, data?: any, error?: string }>}
 */
export async function createSybillConversation(conversationData) {
  const rawEndpoint = (config.SYBILL_CONVERSATIONS_ENDPOINT || '/conversations')
    .replace(/^['"]|['"]$/g, '')
    .trim();
  const endpoint = rawEndpoint.startsWith('/') ? rawEndpoint : `/${rawEndpoint}`;
  const baseUrl = (config.SYBILL_API_BASE_URL || 'https://api.sybill.ai/v1')
    .replace(/^['"]|['"]$/g, '')
    .replace(/\/$/, '')
    .trim();
  const url = `${baseUrl}${endpoint}`;

  const startedAtIso = conversationData.startedAt || new Date().toISOString();
  const primarySpeaker = conversationData.participants?.[0]?.name || 'Speaker 1';

  // Format transcript into Sybill required array format with startTime, endTime, speaker, text
  const formattedTranscript = conversationData.transcript
    ? formatTranscriptForSybill(conversationData.transcript, startedAtIso, primarySpeaker)
    : undefined;

  // Compute realistic endedAt if missing or equal to startedAt
  let endedAtIso = conversationData.endedAt;
  if (!endedAtIso || endedAtIso === startedAtIso) {
    if (formattedTranscript && formattedTranscript.length > 0) {
      const lastSeg = formattedTranscript[formattedTranscript.length - 1];
      const lastTime = new Date(lastSeg.timestamp).getTime();
      const wordCount = (lastSeg.text || '').trim().split(/\s+/).length;
      const estimatedDurationMs = Math.max(5000, Math.min(60000, wordCount * 400));
      endedAtIso = new Date(lastTime + estimatedDurationMs).toISOString();
    }
  }

  // Ensure all unique speakers from transcript are listed as participants
  const participantsList = [...(conversationData.participants || [])];
  const existingNames = new Set(
    participantsList.map((p) => (p.name || '').toLowerCase().replace(/\s+/g, ''))
  );

  if (formattedTranscript) {
    for (const seg of formattedTranscript) {
      const spk = seg.speaker || seg.speaker_name || seg.speakerName;
      if (spk) {
        const normalized = spk.toLowerCase().replace(/\s+/g, '');
        if (!existingNames.has(normalized)) {
          existingNames.add(normalized);
          const emailSlug = spk.toLowerCase().replace(/[^a-z0-9]/g, '');
          participantsList.push({
            name: spk,
            email: `${emailSlug}@yopmail.com`,
          });
        }
      }
    }
  }

  const body = {
    id: conversationData.id,
    sourceId: conversationData.sourceId || config.SYBILL_SOURCE_ID || undefined,
    displayName: conversationData.displayName || 'Untitled Meeting',
    createdAt: conversationData.createdAt || startedAtIso,
    startedAt: startedAtIso,
    endedAt: endedAtIso || undefined,
    participants: participantsList,
    recordingUrl: conversationData.recordingUrl || undefined,
    transcript: formattedTranscript,
    public: conversationData.public !== undefined ? conversationData.public : true,
    ownerEmails: conversationData.ownerEmails || ["jignesh.borisa@friant.com"],
  };

  // Remove undefined keys from body
  Object.keys(body).forEach((key) => body[key] === undefined && delete body[key]);

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  if (config.SYBILL_API_KEY) {
    const cleanApiKey = config.SYBILL_API_KEY.replace(/^['"]|['"]$/g, '').trim();
    headers['Authorization'] = `Bearer ${cleanApiKey}`;
    headers['api-key'] = cleanApiKey;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.SYBILL_REQUEST_TIMEOUT_MS);

  try {
    console.log('==================== [SYBILL API POSTMAN PAYLOAD] ====================');
    console.log('Method: POST');
    console.log('URL:', url);
    console.log('Headers:', JSON.stringify(headers, null, 2));
    console.log('Body (JSON raw payload for Postman):');
    console.log(JSON.stringify(body, null, 2));
    console.log('======================================================================');

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const contentType = response.headers.get('content-type') || '';
    let responseData = null;

    if (contentType.includes('application/json')) {
      responseData = await response.json().catch(() => null);
    } else {
      const text = await response.text().catch(() => '');
      responseData = { text };
    }

    console.log('>>> [Sybill API Response]:', {
      status: response.status,
      ok: response.ok,
      responseData,
    });

    if (response.ok) {
      return {
        success: true,
        statusCode: response.status,
        data: responseData,
      };
    }

    let errorMessage = responseData?.message || responseData?.error;

    if (!errorMessage && responseData?.detail) {
      if (typeof responseData.detail === 'string') {
        errorMessage = responseData.detail;
      } else if (Array.isArray(responseData.detail)) {
        errorMessage = responseData.detail
          .map((d) => (d.msg ? `${d.loc ? d.loc.join('.') + ': ' : ''}${d.msg}` : JSON.stringify(d)))
          .join('; ');
      } else if (typeof responseData.detail === 'object') {
        errorMessage = responseData.detail.message || JSON.stringify(responseData.detail);
      }
    }

    if (!errorMessage) {
      if (responseData?.text) {
        const stripped = responseData.text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        errorMessage = stripped || `Sybill request failed with HTTP status ${response.status}`;
      } else {
        errorMessage = `Sybill request failed with HTTP status ${response.status}`;
      }
    }

    return {
      success: false,
      statusCode: response.status,
      data: responseData,
      error: errorMessage,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    console.error('>>> [Sybill API Request Exception]:', err.message);

    return {
      success: false,
      statusCode: 0,
      error: err.name === 'AbortError' ? 'Sybill request timed out' : err.message,
    };
  }
}

export default {
  createSybillConversation,
  formatTranscriptForSybill,
};
