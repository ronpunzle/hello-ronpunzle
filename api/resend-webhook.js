import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

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

    // Look up note_id by message_id
    const { data: emailEvent, error: lookupError } = await supabase
      .from('email_events')
      .select('note_id')
      .eq('message_id', messageId)
      .single();

    if (lookupError) {
      console.error('Failed to lookup message_id:', lookupError);
      return res.status(400).json({ error: 'Message not found' });
    }

    const noteId = emailEvent.note_id;

    // Insert new event
    const { error: insertError } = await supabase
      .from('email_events')
      .insert([{
        message_id: messageId,
        note_id: noteId,
        recipient,
        event_type: eventType,
      }]);

    if (insertError) {
      console.error('Failed to insert event:', insertError);
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
