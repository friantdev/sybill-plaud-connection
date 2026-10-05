/**
 * Webhook Controller
 */
import mongoose from 'mongoose';
import config from '../config/env.js';
import UserModel from '../models/User.js';
import Log from '../models/Log.js';
import Conversation from '../models/Conversation.js';
import { createSybillConversation } from '../services/sybillService.js';

export async function handleWebhook(req, res, next) {
  try {
    let payload = req.body;

    // Handle case where body might be a JSON string
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (parseErr) {
        console.warn('Could not parse payload as JSON:', parseErr.message);
      }
    }

    console.log('>>> [handleWebhook START]', {
      method: req.method,
      url: req.url,
      originalUrl: req.originalUrl,
      bodyType: typeof payload,
      isBodyArray: Array.isArray(payload),
      dbReadyState: mongoose.connection.readyState,
      dbName: mongoose.connection.name,
      payloadPreview: payload ? JSON.stringify(payload).slice(0, 300) : null,
    });

    // 1. Normalize payload (Zapier may send an array or an object)
    const item = Array.isArray(payload) ? payload[0] : payload;

    if (!item) {
      console.warn('>>> [Empty webhook payload received]');
      await Log.create({
        event: 'webhook_received',
        level: 'warn',
        message: 'Empty webhook payload received',
        data: payload,
      });

      return res.status(400).json({
        success: false,
        message: 'Empty webhook payload',
      });
    }

    const { user, plaud_data, id: rawPlaudId, runtime_meta } = item;
    const plaudId = rawPlaudId ? String(rawPlaudId).trim() : null;

    console.log('>>> [Parsed Item]:', {
      plaudId,
      hasUser: !!user,
      userEmail: user?.email,
      hasPlaudData: !!plaud_data,
      plaudTitle: plaud_data?.title,
    });

    // 2. Validate user object
    if (!user || !user.email) {
      console.warn('>>> [Webhook missing user or user email]');
      const logDoc = await Log.create({
        event: 'webhook_received',
        level: 'warn',
        message: 'Webhook received without valid user email',
        data: { user, plaud_data, plaudId },
      });

      return res.status(200).json({
        success: false,
        message: 'Webhook received without valid user email',
      });
    }

    // 3. Validate plaud_data
    if (!plaud_data) {
      console.warn('>>> [Webhook missing plaud_data]');
      const logDoc = await Log.create({
        event: 'webhook_received',
        level: 'warn',
        message: 'Webhook received without plaud data',
        data: { user, plaudId },
      });

      return res.status(200).json({
        success: false,
        message: 'Webhook received without plaud data',
      });
    }

    // 4. Sanitize user info (Zapier may include carriage returns like \r or extra spaces)
    const cleanEmail = user.email.trim().toLowerCase();
    const cleanName = user.name ? user.name.trim() : cleanEmail.split('@')[0];

    // 5. Find or create user
    let userDoc = await UserModel.findOne({ email: cleanEmail });

    if (!userDoc) {
      console.log(`>>> [Creating new user for ${cleanEmail}]`);
      await Log.create({
        event: 'user_lookup',
        level: 'info',
        message: `User not found for email ${cleanEmail}. Creating new user.`,
        data: { email: cleanEmail, name: cleanName },
      });

      userDoc = await UserModel.create({
        name: cleanName,
        email: cleanEmail,
      });

      await Log.create({
        event: 'user_created',
        level: 'info',
        message: `User created successfully with ID ${userDoc._id}`,
        data: { userId: userDoc._id, email: cleanEmail, name: cleanName },
      });
    } else {
      console.log('>>> [Existing user found]:', userDoc._id);
      await Log.create({
        event: 'user_found',
        level: 'info',
        message: `User found with ID ${userDoc._id}`,
        data: { userId: userDoc._id, email: cleanEmail },
      });
    }

    // 6. Duplicate Check: Check if conversation was already created for this Plaud ID
    const existingConversation = await Conversation.findOne({ displayName: plaud_data.title });

    if (existingConversation) {
      console.log('>>> [Duplicate Webhook Detected]:', {
        plaudId,
        sybillConversationId: existingConversation.sybillConversationId,
        status: existingConversation.status,
      });

      await Log.create({
        event: 'duplicate_webhook_prevented',
        level: 'info',
        message: `Duplicate webhook for Plaud ID ${plaudId}. Conversation already exists.`,
        data: {
          plaudId,
          sybillConversationId: existingConversation.sybillConversationId,
          status: existingConversation.status,
        },
      });

      return res.status(200).json({
        success: true,
        message: 'Conversation already created in Sybill (duplicate webhook prevented)',
        plaudId,
        sybillConversationId: existingConversation.sybillConversationId,
        conversationId: existingConversation._id,
        status: existingConversation.status,
      });
    }

    // 7. Construct Sybill ConversationRequest
    const conversationId = plaudId || `plaud-${Date.now()}`;
    const startTimeIso = plaud_data.create_time
      ? new Date(plaud_data.create_time).toISOString()
      : new Date().toISOString();

    // Sybill owner must be a participant for "My Meetings" dashboard visibility
    const sybillOwnerEmail = 'speaker2@yopmail.com';
    const sybillOwnerName = 'Speaker2';

    // Build participants: always include the Sybill owner first,
    // then add the PLAUD user as an external participant if different
    const participantsList = [
      { email: sybillOwnerEmail, name: sybillOwnerName },
      { email: 'speaker3@yopmail.com', name: 'Speaker3' }
    ];

    if (cleanEmail.toLowerCase() !== sybillOwnerEmail.toLowerCase()) {
      participantsList.push({ email: cleanEmail, name: cleanName });
    }

    const sybillPayload = {
      id: conversationId,
      sourceId: config.SYBILL_SOURCE_ID,
      displayName: plaud_data.title || 'Untitled PLAUD Meeting',
      createdAt: startTimeIso,
      startedAt: startTimeIso,
      endedAt: plaud_data.endedAt || undefined,
      participants: participantsList,
      recordingUrl: plaud_data.recordingUrl || plaud_data.recording_url || undefined,
      transcript: plaud_data.transcript || undefined,
      public: true,
      ownerEmails: ["jignesh.borisa@friant.com"],
    };

    console.log('>>> [Submitting to Sybill Conversations API]:\n', JSON.stringify(sybillPayload, null, 2));

    // 8. Submit conversation to Sybill
    const sybillResult = await createSybillConversation(sybillPayload);

    // Extract Sybill Conversation ID (from response or fallback to our external id)
    const sybillConversationId =
      sybillResult.data?.id ||
      sybillResult.data?.conversationId ||
      (sybillResult.success ? conversationId : null);

    // 9. Store the conversation mapping in our database
    const conversationRecord = await Conversation.create({
      plaudId: conversationId,
      sybillConversationId,
      userId: userDoc._id,
      userEmail: cleanEmail,
      displayName: sybillPayload.displayName,
      sourceId: config.SYBILL_SOURCE_ID,
      recordingUrl: sybillPayload.recordingUrl,
      status: sybillResult.success ? 'CREATED' : 'FAILED',
      plaudData: plaud_data,
      sybillRequest: sybillPayload,
      sybillResponse: sybillResult.data,
      error: sybillResult.error || null,
    });

    console.log('>>> [Conversation record saved in DB]:', conversationRecord._id);

    // 10. Log outcome in logs collection
    if (sybillResult.success) {
      await Log.create({
        event: 'sybill_conversation_created',
        level: 'info',
        message: `Sybill conversation created successfully for ${cleanEmail}`,
        data: {
          plaudId: conversationId,
          sybillConversationId,
          conversationRecordId: conversationRecord._id,
          userId: userDoc._id,
          email: cleanEmail,
        },
      });

      return res.status(201).json({
        success: true,
        message: 'Sybill conversation created successfully',
        conversationId: conversationRecord._id,
        plaudId: conversationId,
        sybillConversationId,
        user: {
          id: userDoc._id,
          email: cleanEmail,
        },
      });
    } else {
      await Log.create({
        event: 'sybill_conversation_failed',
        level: 'error',
        message: `Failed to create Sybill conversation for ${cleanEmail}. Reason: ${sybillResult.error}`,
        data: {
          plaudId: conversationId,
          userId: userDoc._id,
          email: cleanEmail,
          statusCode: sybillResult.statusCode,
          error: sybillResult.error,
          sybillRequest: sybillPayload,
          sybillResponse: sybillResult.data,
        },
      });

      const failureStatus = sybillResult.statusCode >= 400 ? sybillResult.statusCode : 400;
      return res.status(failureStatus).json({
        success: false,
        message: 'Failed to create conversation in Sybill',
        error: sybillResult.error,
        plaudId: conversationId,
        conversationId: conversationRecord._id,
      });
    }
  } catch (err) {
    console.error('>>> [Webhook Controller Uncaught Error]:', err);
    try {
      await Log.create({
        event: 'webhook_error',
        level: 'error',
        message: err.message,
        data: {
          stack: err.stack,
          body: req.body,
        },
      });
    } catch (logErr) {
      console.error('Failed to write error log to MongoDB:', logErr.message);
    }
    next(err);
  }
}

export { handleWebhook as handlePlaudWebhook };

export default {
  handleWebhook,
  handlePlaudWebhook: handleWebhook,
};
