export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const event = req.body;

    // Validate event structure
    if (!event.type || !event.data) {
      return res.status(400).json({ error: 'Invalid event structure' });
    }

    const messageId = event.data.id;
    const eventType = mapResendEventType(event.type);
    const recipient = event.data.to || event.data.email;

    if (!messageId || !eventType || !recipient) {
      return res.status(400).json({ error: 'Missing required event data' });
    }

    // Look up note_id by message_id using Supabase REST API
    const lookupResponse = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/email_events?message_id=eq.${encodeURIComponent(messageId)}&select=note_id`,
      {
        headers: {
          'apikey': process.env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        },
      }
    );

    if (!lookupResponse.ok) {
      const errorText = await lookupResponse.text();
      console.error('Failed to lookup message_id:', lookupResponse.status, errorText);
      return res.status(400).json({ error: 'Message not found', details: errorText });
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
      recipient,
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
      return res.status(500).json({ error: 'Failed to store event', details: errorText });
    }

    console.log('Event inserted successfully');
    return res.status(200).json({ success: true, inserted: insertBody });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}

function mapResendEventType(resendType) {
  const typeMap = {
    'email.delivered': 'delivered',
    'email.opened': 'opened',
    'email.clicked': 'clicked',
    'email.bounced': 'bounced',
    'email.complained': 'complained',
  };
  return typeMap[resendType] || resendType;
}
