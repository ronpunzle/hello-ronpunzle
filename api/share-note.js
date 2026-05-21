import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { recipientEmail, noteContent, noteTitle, noteId } = req.body;

  if (!recipientEmail || !noteContent || !noteId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const emailValidation = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail);
  if (!emailValidation) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            background: #f5f5f5;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 10px;
            padding: 40px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 8px;
            margin-bottom: 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
        }
        .header p {
            margin: 5px 0 0 0;
            opacity: 0.9;
            font-size: 14px;
        }
        .note-section {
            background: #f9f9f9;
            border-left: 4px solid #667eea;
            padding: 20px;
            border-radius: 5px;
            margin: 20px 0;
        }
        .note-title {
            font-size: 18px;
            font-weight: bold;
            color: #333;
            margin-bottom: 10px;
        }
        .note-content {
            color: #555;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        .cta-button {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 30px;
            border-radius: 5px;
            text-decoration: none;
            margin-top: 20px;
            font-weight: 600;
            transition: transform 0.3s;
        }
        .cta-button:hover {
            transform: translateY(-2px);
        }
        .footer {
            border-top: 1px solid #eee;
            margin-top: 30px;
            padding-top: 20px;
            text-align: center;
            color: #999;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📝 My Notes</h1>
            <p>A note has been shared with you</p>
        </div>

        <p>Hi there,</p>
        <p>Someone shared a note with you from My Notes app:</p>

        <div class="note-section">
            <div class="note-title">${escapeHtml(noteTitle)}</div>
            <div class="note-content">${escapeHtml(noteContent)}</div>
        </div>

        <p>View all notes and create your own:</p>
        <a href="https://hello-ronpunzle.vercel.app" class="cta-button">View Notes App</a>

        <div class="footer">
            <p>This email was sent because a note was shared with you from My Notes app.</p>
        </div>
    </div>
</body>
</html>
    `;

    // Send email
    const emailResponse = await resend.emails.send({
      from: 'noreply@resend.dev',
      to: recipientEmail,
      subject: `📝 Note shared: ${noteTitle}`,
      html: emailHtml,
    });

    if (emailResponse.error) {
      return res.status(400).json({ error: emailResponse.error.message });
    }

    // The message ID from Resend response is what we'll match in webhooks
    const messageId = emailResponse.data.id;
    console.log('Email sent with ID:', messageId);

    // Insert "sent" event into email_events table using Supabase REST API
    try {
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
            recipient: recipientEmail,
            event_type: 'sent',
          }),
        }
      );

      if (!insertResponse.ok) {
        console.error('Failed to insert sent event:', await insertResponse.text());
      }
    } catch (insertError) {
      console.error('Failed to insert sent event:', insertError);
      // Don't fail the request, email was sent successfully
    }

    return res.status(200).json({ success: true, id: messageId });
  } catch (error) {
    console.error('Email send error:', error);
    return res.status(500).json({ error: 'Failed to send email' });
  }
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}
