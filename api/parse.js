const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { dealer, text } = req.body || {};
  if (!dealer || !text) return res.status(400).json({ error: 'dealer and text required' });

  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_KEY not configured' });

  const systemPrompt = `You are an expert Agency CMBS trader. Parse the offer list and return ONLY valid JSON — no markdown, no extra text. Group every offer by agency: Fannie Mae (FNMA, Fannie, DUS, GeMS, ACES), Freddie Mac (FHLMC, Freddie, K-Series, SB, Q-Deal, PC), Ginnie Mae (GNMA, Ginnie, FHA, VA, HUD), Other. Return: {"groups":[{"agency":"Fannie Mae","offers":[{"name":"","collateral":"","structure":"","coupon":"","maturity":"","size":"","price":"","spread":"","rating":"","rate_type":"","notes":""}]}]}. Null for unknown. Extract EVERY offer.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Dealer: ${dealer}\n\n${text}` }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return res.status(502).json({ error: 'Anthropic API error', detail: err });
  }

  const data = await response.json();
  const raw = data.content?.[0]?.text || '';

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Try to extract JSON from response if it has surrounding text
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try { parsed = JSON.parse(match[0]); }
      catch { return res.status(422).json({ error: 'Failed to parse AI response', raw }); }
    } else {
      return res.status(422).json({ error: 'Failed to parse AI response', raw });
    }
  }

  return res.status(200).json(parsed);
};
