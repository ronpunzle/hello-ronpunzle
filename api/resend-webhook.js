import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify webhook signature using HMAC-SHA256
    const signature = req.headers['x-resend-signature'];
    if (!signature) {
      console.error('Missing x-resend-signature header');
      return res.status(401).json({ error: 'Unauthorized: Missing signature' });
    }

    // Reconstruct the body string for verification
    const body = JSON.stringify(req.body);

    // Calculate expected signature using the webhook secret
    // Resend uses base64-encoded HMAC-SHA256
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RESEND_WEBHOOK_SECRET)
      .update(body)
      .digest('base64');

    // Constant-time comparison to prevent timing attacks
    if (!constantTimeCompare(signature, expectedSignature)) {
      console.error('Signature verification failed');
      console.error('Expected:', expectedSignature);
      console.error('Received:', signature);
      return res.status(401).json({ error: 'Unauthorized: Invalid signature' });
    }

    const event = req.body;
    console.log('Webhook verified, processing event:', event.type);

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

    console.log('Parsed values:', { messageId, recipientEmail, eventType });

    if (!messageId || !eventType || !recipientEmail) {
      console.error('Missing required fields:', { messageId, eventType, recipientEmail });
      return res.status(400).json({
        error: 'Missing required event data',
        received: { messageId, eventType, recipientEmail }
      });
    }

    // Look up note_id by message_id using Supabase REST API
    const lookupUrl = `${process.env.SUPABASE_URL}/rest/v1/email_events?message_id=eq.${encodeURIComponent(messageId)}&select=note_id`;
    console.log('Looking up message_id:', messageId);

    const lookupResponse = await fetch(lookupUrl, {
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      },
    });

    if (!lookupResponse.ok) {
      const errorText = await lookupResponse.text();
      console.error('Failed to lookup message_id:', lookupResponse.status, errorText);
      return res.status(400).json({ error: 'Message not found' });
    }

    const lookupData = await lookupResponse.json();
    console.log('Message lookup result:', lookupData);

    if (!lookupData || lookupData.length === 0) {
      console.warn('No email_events found for message_id:', messageId);
      return res.status(400).json({ error: 'Message not found in email_events' });
    }

    const noteId = lookupData[0].note_id;

    // Insert new event using Supabase REST API
    const insertBody = {
      message_id: messageId,
      note_id: noteId,
      recipient: recipientEmail,
      event_type: eventType,
    };

    console.log('Inserting event:', insertBody);

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

    if (!insertResponse.ok) {
      const errorText = await insertResponse.text();
      console.error('Failed to insert event:', insertResponse.status, errorText);
      return res.status(500).json({ error: 'Failed to store event' });
    }

    console.log('Event inserted successfully');
    return res.status(200).json({ success: true, inserted: insertBody });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: error.message });
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
