import { google } from 'googleapis';

const sheets = google.sheets('v4');

export async function POST(req) {
  try {
    const { date, merchant, amount, category } = await req.json();

    const serviceAccountKey = JSON.parse(
      Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY, 'base64').toString()
    );

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const authClient = await auth.getClient();

    await sheets.spreadsheets.values.append({
      auth: authClient,
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Sheet1!A:E',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          date || new Date().toISOString().split('T')[0],
          merchant,
          amount,
          category,
          new Date().toISOString(),
        ]],
      },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: 'Failed to save' }, { status: 500 });
  }
}
