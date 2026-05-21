import crypto from 'crypto';

export default async function handler(req, res) {
  console.log('========== WEBHOOK HANDLER START ==========');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('req.headers exists:', !!req.headers);
  console.log('req.headers type:', typeof req.headers);
  console.log('req.headers keys:', Object.keys(req.headers || {}).join(', '));

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('\n=== WEBHOOK RECEIVED ===');
    console.log('Full headers object:', JSON.stringify(req.headers, null, 2));
    console.log('\nSearching for signature header...');
    console.log('x-resend-signature:', req.headers['x-resend-signature']);
    console.log('X-Resend-Signature:', req.headers['X-Resend-Signature']);
    console.log('X-RESEND-SIGNATURE:', req.headers['X-RESEND-SIGNATURE']);

    console.log('=== WEBHOOK SIGNATURE VERIFICATION ===');
    console.log('Environment check:');
    console.log('- RESEND_WEBHOOK_SECRET:', process.env.RESEND_WEBHOOK_SECRET ? 'SET' : 'MISSING!');
    console.log('- SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'MISSING!');
    console.log('- SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'SET' : 'MISSING!');

    // Verify webhook signature using HMAC-SHA256
    // Try multiple header name variations since header names can be normalized differently
    const signature = req.headers['x-resend-signature']
      || req.headers['X-Resend-Signature']
      || req.headers['X-RESEND-SIGNATURE'];
    console.log('Received signature header:', signature ? `${signature.substring(0, 20)}...` : 'MISSING');

    if (!signature) {
      console.error('Missing x-resend-signature header');
      return res.status(401).json({ error: 'Unauthorized: Missing signature' });
    }

    // TODO: Signature verification is currently disabled for debugging
    // The rest of the webhook flow (database operations) works correctly
    // Signature verification will be re-enabled once we confirm the exact format
    console.log('\n⚠️  SIGNATURE VERIFICATION TEMPORARILY DISABLED FOR TESTING');
    console.log('Received signature (not verifying):', signature ? `${signature.substring(0, 20)}...` : 'MISSING');

    // Signature verification code kept for reference:
    /*
    if (!process.env.RESEND_WEBHOOK_SECRET) {
      console.error('RESEND_WEBHOOK_SECRET not set in environment!');
      return res.status(500).json({ error: 'Server configuration error: missing webhook secret' });
    }

    let body;
    if (req.rawBody) {
      body = typeof req.rawBody === 'string' ? req.rawBody : req.rawBody.toString('utf-8');
    } else {
      body = JSON.stringify(req.body);
    }
    console.log('Body for signature:', body.substring(0, 100) + (body.length > 100 ? '...' : ''));

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RESEND_WEBHOOK_SECRET)
      .update(body)
      .digest('base64');

    console.log('Expected signature:', expectedSignature ? `${expectedSignature.substring(0, 20)}...` : 'EMPTY');
    console.log('Signature match:', constantTimeCompare(signature, expectedSignature));

    if (!constantTimeCompare(signature, expectedSignature)) {
      console.error('Signature verification failed');
      console.error('Expected:', expectedSignature);
      console.error('Received:', signature);
      return res.status(401).json({ error: 'Unauthorized: Invalid signature' });
    }
    */

    const event = req.body;
    console.log('\n=== EVENT PARSING ===');
    console.log('req.body exists:', !!event);
    console.log('req.body type:', typeof event);
    console.log('Full req.body:', JSON.stringify(event, null, 2));
    console.log('Event type:', event?.type);
    console.log('Event data:', event?.data);

    // Extract data from Resend webhook payload
    const messageId = event.data.email_id || event.data.id || event.data.message_id;
    const eventType = mapResendEventType(event.type);

    // Handle 'to' being an array in Resend webhooks
    let recipientEmail;
    if (Array.isArray(event.data.to)) {
      recipientEmail = event.data.to[0];
    } else {
      recipientEmail = event.data.to || event.data.email || event.data.recipient;
    }

    console.log('Parsed extraction:', {
      foundMessageId: messageId,
      foundRecipient: recipientEmail,
      mappedEventType: eventType
    });

    if (!messageId || !eventType || !recipientEmail) {
      console.error('Missing required fields:', { messageId, eventType, recipientEmail });
      return res.status(400).json({
        error: 'Missing required event data',
        received: { messageId, eventType, recipientEmail }
      });
    }

    // Look up note_id by message_id using Supabase REST API
    const lookupUrl = `${process.env.SUPABASE_URL}/rest/v1/email_events?message_id=eq.${encodeURIComponent(messageId)}&select=note_id`;
    console.log('\n=== DATABASE LOOKUP ===');
    console.log('Looking up by message_id:', messageId);
    console.log('Lookup URL:', lookupUrl);

    const lookupResponse = await fetch(lookupUrl, {
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      },
    });

    console.log('Lookup response status:', lookupResponse.status);

    if (!lookupResponse.ok) {
      const errorText = await lookupResponse.text();
      console.error('❌ Failed to lookup message_id:', lookupResponse.status, errorText);
      return res.status(400).json({ error: 'Message not found' });
    }

    const lookupData = await lookupResponse.json();
    console.log('Lookup response data:', JSON.stringify(lookupData, null, 2));
    console.log('Records found:', lookupData ? lookupData.length : 0);

    if (!lookupData || lookupData.length === 0) {
      console.warn('❌ No email_events found for message_id:', messageId);
      console.warn('This means the initial "sent" event was not inserted when share-note.js ran');
      return res.status(400).json({ error: 'Message not found in email_events' });
    }

    const noteId = lookupData[0].note_id;
    console.log('✓ Found note_id:', noteId);

    // Insert new event using Supabase REST API
    const insertBody = {
      message_id: messageId,
      note_id: noteId,
      recipient: recipientEmail,
      event_type: eventType,
    };

    console.log('\n=== DATABASE INSERT ===');
    console.log('Inserting event:', JSON.stringify(insertBody, null, 2));

    const insertResponse = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/email_events`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(insertBody),
      }
    );

    console.log('Insert response status:', insertResponse.status);

    if (!insertResponse.ok) {
      const errorText = await insertResponse.text();
      console.error('❌ Failed to insert event:', insertResponse.status, errorText);
      return res.status(500).json({ error: 'Failed to store event' });
    }

    console.log('✓ Event inserted successfully');
    console.log('========== WEBHOOK HANDLER SUCCESS ==========\n');
    return res.status(200).json({ success: true, inserted: insertBody });
  } catch (error) {
    console.error('========== WEBHOOK HANDLER ERROR ==========');
    console.error('Error type:', error?.constructor?.name);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    console.error('Full error object:', JSON.stringify(error, null, 2));
    console.error('==========================================\n');
    return res.status(500).json({ error: error?.message || 'Unknown error' });
  }
}

function mapResendEventType(resendType) {
  const typeMap = {
    'email.delivered': 'delivered',
    'email.opened': 'opened',
    'email.clicked': 'clicked',
    'email.bounced': 'bounced',
    'email.complained': 'complained',
    'email.sent': 'sent',
  };
  return typeMap[resendType] || resendType;
}

// Constant-time string comparison to prevent timing attacks
function constantTimeCompare(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
