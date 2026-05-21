export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const event = req.body;

    console.log('Webhook received:', JSON.stringify(event, null, 2));

    // Try to look up the message in the database
    if (event.data?.id) {
      const messageId = event.data.id;

      const lookupResponse = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/email_events?message_id=eq.${encodeURIComponent(messageId)}`,
        {
          headers: {
            'apikey': process.env.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
          },
        }
      );

      const data = await lookupResponse.json();
      console.log('Lookup result:', data);

      return res.status(200).json({
        received: true,
        messageId,
        eventType: event.type,
        found: data.length > 0,
        data
      });
    }

    return res.status(200).json({ received: true, event });
  } catch (error) {
    console.error('Debug webhook error:', error);
    return res.status(500).json({ error: error.message });
  }
}
