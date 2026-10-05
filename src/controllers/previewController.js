import Conversation from '../models/Conversation.js';
import config from '../config/env.js';
import { formatTranscriptForSybill } from '../services/sybillService.js';

// Default sample transcript for testing in Postman
const DEFAULT_SAMPLE_TRANSCRIPT = `Speaker 1 00:00:02
So Greg is here, some having some issue with the POs. This is regarding some purchase orders. So.
Speaker 2 00:00:12
This one here, I ordered 175, but we only received 65, so they still owe me 110. But it's not showing up on this.
Speaker 1 00:00:21
Spreadsheet. Is is is it the same number.
Speaker 2 00:00:24
That number doesn't show up at all.
Speaker 1 00:00:27
That number doesn't show up at all.
Speaker 2 00:00:29
No, it just shows me. If I was to look at this, I would think I only have 21 on order.
Speaker 1 00:00:35
That's not the PO. That's not the PO number.
Speaker 2 00:00:37
No, it's not. So I have 21 plus I have 110 on order here. Okay. So the very first item,
Speaker 1 00:00:47
One was this one, the second one. Just right - click on it. Now here, right - click here, and copy cell value, and go to item here.
Speaker 1 00:00:59
And then go to the item and copy paste.
Speaker 2 00:01:01
Okay.
Speaker 1 00:01:16
Now open it and go to pre and item info. Pre and item.
Speaker 1 00:01:29
Yeah, you put melamine already there.
Speaker 2 00:01:36
Okay, so if if if the whole amount is open, it shows up on the spreadsheet. But if we receive part of it,
Speaker 1 00:01:41
Can you not see this part number at all?
Speaker 2 00:01:44
Uh huh. Huh. Yeah. But we don't see if if it's a partial. If if we were to receive part of the,
Speaker 1 00:01:51
No, I know. But what I'm saying is, do we have this part here? I want to see here. It's right here. That is the one. How is it going to get there?
Speaker 1 00:02:06
That is one, one empty, one. Okay. Okay. Can you send me this part number? Then I'll look at it. Look at this.`;

/**
 * Controller to preview how PLAUD transcripts are parsed and formatted for Sybill.
 * Can be called via GET in Postman.
 * Returns:
 * {
 *   "transcript": [
 *     { "speaker": "Speaker 1", "text": "...", "startTime": 0.0, "endTime": 12.0 }
 *   ]
 * }
 */
export async function getTranscriptPreview(req, res, next) {
  try {
    const { id, plaudId, conversationId, sample, text } = { ...req.query, ...(req.body || {}) };

    let rawTranscript = null;
    let startedAt = '2026-09-29T11:39:45Z';
    let displayName = 'testing';
    let participants = [
      { email: 'speaker1@yopmail.com', name: 'Speaker 1' },
      { email: 'speaker2@yopmail.com', name: 'Speaker 2' },
      { email: 'speaker3@yopmail.com', name: 'Speaker 3' },
    ];
    let source = 'built_in_sample';
    let targetMeetingId = id || plaudId || conversationId;

    // Case 1: Custom text provided via query or body
    if (text) {
      rawTranscript = text;
      source = 'custom_input';
      displayName = 'Custom Transcript Input';
    }
    // Case 2: Specific meeting ID requested
    else if (targetMeetingId && sample !== 'true') {
      const conv = await Conversation.findOne({
        $or: [
          { plaudId: targetMeetingId },
          { sybillConversationId: targetMeetingId },
          ...(targetMeetingId.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: targetMeetingId }] : []),
        ],
      }).lean();

      if (conv) {
        rawTranscript = conv.plaudData?.transcript || conv.sybillRequest?.transcript;
        startedAt = conv.sybillRequest?.startedAt || conv.createdAt?.toISOString?.() || startedAt;
        displayName = conv.displayName || conv.plaudData?.title || displayName;
        if (conv.sybillRequest?.participants?.length) {
          participants = conv.sybillRequest.participants;
        }
        source = `database_by_id (${conv.plaudId})`;
      } else {
        return res.status(404).json({
          success: false,
          message: `Conversation with ID "${targetMeetingId}" not found in database.`,
        });
      }
    }
    // Case 3: Fetch latest meeting from database if not explicitly requesting sample
    else if (sample !== 'true') {
      const latestConv = await Conversation.findOne().sort({ createdAt: -1 }).lean();
      if (latestConv && latestConv.plaudData?.transcript) {
        rawTranscript = latestConv.plaudData.transcript;
        startedAt = latestConv.sybillRequest?.startedAt || latestConv.createdAt?.toISOString?.() || startedAt;
        displayName = latestConv.displayName || latestConv.plaudData?.title || displayName;
        if (latestConv.sybillRequest?.participants?.length) {
          participants = latestConv.sybillRequest.participants;
        }
        source = `database_latest (${latestConv.plaudId})`;
      }
    }

    // Case 4: Fallback to sample
    if (!rawTranscript) {
      rawTranscript = DEFAULT_SAMPLE_TRANSCRIPT;
      startedAt = '2026-09-29T11:39:45Z';
      displayName = 'testing';
      source = 'built_in_sample';
    }

    // Format transcript into Sybill turn array
    const formattedTranscript = formatTranscriptForSybill(rawTranscript, startedAt, 'Speaker 1');

    // Build clean transcript array matching { speaker, text, startTime, endTime }
    const cleanTranscript = (formattedTranscript || []).map((t, idx) => {
      let start = t.startTime !== undefined && t.startTime !== null ? Number(t.startTime) : (idx === 0 ? 0.0 : idx * 5.0);
      if (idx === 0 && start <= 2.0) {
        start = 0.0;
      }
      let end = t.endTime !== undefined && t.endTime !== null ? Number(t.endTime) : start + 4.5;
      return {
        speaker: t.speaker || t.speaker_name || t.speakerName || 'Speaker',
        text: t.text,
        startTime: Number(start.toFixed(1)),
        endTime: Number(end.toFixed(1)),
      };
    });

    // Calculate endedAt based on the last segment
    let endedAt = startedAt;
    let durationSeconds = 0;
    if (cleanTranscript.length > 0) {
      const lastSeg = cleanTranscript[cleanTranscript.length - 1];
      const startTimeMs = new Date(startedAt).getTime();
      endedAt = new Date(startTimeMs + lastSeg.endTime * 1000).toISOString();
      durationSeconds = Math.round(lastSeg.endTime);
    }

    // Align participants with all unique speakers in the transcript
    const finalParticipants = [...participants];
    const existingNames = new Set(
      finalParticipants.map((p) => (p.name || '').toLowerCase().replace(/\s+/g, ''))
    );

    for (const seg of cleanTranscript) {
      if (seg.speaker) {
        const normalized = seg.speaker.toLowerCase().replace(/\s+/g, '');
        if (!existingNames.has(normalized)) {
          existingNames.add(normalized);
          const emailSlug = seg.speaker.toLowerCase().replace(/[^a-z0-9]/g, '');
          finalParticipants.push({
            name: seg.speaker,
            email: `${emailSlug}@yopmail.com`,
          });
        }
      }
    }

    // Construct the full Sybill request body that Postman / Sybill API receives
    const sybillPayloadPreview = {
      id: targetMeetingId || `preview-${Date.now()}`,
      sourceId: config.SYBILL_SOURCE_ID || '0438734d-e288-491c-a2d5-fd67378bcc4c',
      displayName,
      createdAt: startedAt,
      startedAt,
      endedAt,
      participants: finalParticipants,
      transcript: cleanTranscript,
      public: true,
      ownerEmails: ['jignesh.borisa@friant.com'],
    };

    return res.status(200).json({
      success: true,
      message: 'Transcript parsed and formatted successfully for Sybill',
      source,
      summary: {
        displayName,
        startedAt,
        endedAt,
        durationSeconds,
        durationFormatted: `${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s`,
        totalTurns: cleanTranscript.length,
        uniqueSpeakers: Array.from(new Set(cleanTranscript.map((t) => t.speaker))),
      },
      transcript: cleanTranscript,
      sybillPostmanPayloadPreview: sybillPayloadPreview,
    });
  } catch (err) {
    next(err);
  }
}

export default {
  getTranscriptPreview,
};
