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
      console.error('Failed to lookup message_id');
      return res.status(400).json({ error: 'Message not found' });
    }

    const lookupData = await lookupResponse.json();
    if (!lookupData || lookupData.length === 0) {
      return res.status(400).json({ error: 'Message not found' });
    }

    const noteId = lookupData[0].note_id;

    // Insert new event using Supabase REST API
    const insertResponse = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/email_events`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          message_id: messageId,
          note_id: noteId,
          recipient,
          event_type: eventType,
        }),
      }
    );

    if (!insertResponse.ok) {
      console.error('Failed to insert event:', await insertResponse.text());
      return res.status(500).json({ error: 'Failed to store event' });
    }

    return res.status(200).json({ success: true });
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
