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

  const apiKey = process.env.ANTHROPIC_KEY || process.env.anthropic_key;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_KEY not configured' });

  const systemPrompt = `You are an expert Agency CMBS trader. Parse the raw offer list and return ONLY valid JSON — no markdown, no extra text.

CRITICAL ACCURACY RULES:
- Copy every value EXACTLY as it appears in the source — do not round, reformat, or infer any numbers
- If a field is not explicitly present in the source data for that offer, set it to null — never guess
- Every offer must be extracted — do not skip duplicates or small positions
- CUSIP: extract the 9-character alphanumeric CUSIP if present (e.g. 3137FUZJ6)
- size: copy exactly as shown (e.g. "1.14mm", "97.98MM", "$10mm")
- spread: copy exactly as shown (e.g. "27.5", "+68", "S+85")
- price: copy exactly as shown (e.g. "~84-18", "$99-26", "98-31")
- coupon: copy exactly as shown (e.g. "2.32%", "4.65%", "Fixed")
- wal: Weighted Average Life — copy exactly as shown (e.g. "8.00", "9.76")
- yield: copy exactly as shown (e.g. "~4.72%", "4.8%")
- maturity: loan term / call structure (e.g. "Seas 15/14.5", "10/9.5", "5/4.5")
- structure: product type (DUS, PC, K-Series, FHMS, ACE/GEM, PTIO, FTIO, No IO, Floater, etc.)
- rate_type: Fixed, Floating, or IO

Group by agency:
- "Fannie Mae" (FN, FNMA, DUS, FNA, ACE, GEM)
- "Freddie Mac" (FR, FHLMC, FHMS, K-Series, PC)
- "Ginnie Mae" (GNMA, FHA, VA, HUD)
- "Other" (SBAP, SBA, anything else)

Return this exact structure, null for missing fields:
{"groups":[{"agency":"Fannie Mae","offers":[{"cusip":null,"name":"","size":"","coupon":"","spread":"","price":"","wal":"","yield":"","maturity":"","structure":"","rate_type":"","rating":"","collateral":"","notes":""}]}]}

Extract EVERY single offer. Do not omit any.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
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
