export async function POST(req) {
  try {
    const { base64Image, mediaType } = await req.json();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64Image,
                },
              },
              {
                type: 'text',
                text: `Extract the following from this receipt and respond ONLY with valid JSON:
                      - total_amount (the final total, as a number)
                      - merchant (store/restaurant name)
                      - date (if visible, otherwise today's date in YYYY-MM-DD format)

                      Example: {"total_amount": 42.50, "merchant": "Whole Foods", "date": "2024-01-15"}

                      If you cannot read the receipt, return: {"error": "Could not read receipt"}`,
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('Error processing receipt:', error);
    return Response.json({ error: { message: error.message } }, { status: 500 });
  }
}
