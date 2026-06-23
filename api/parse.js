const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const TOOL = {
  name: 'extract_offers',
  description: 'Extract every Agency CMBS offer from the dealer list. Copy all values EXACTLY as they appear in the source — character for character. Never convert, reformat, round, or infer any value.',
  input_schema: {
    type: 'object',
    required: ['groups'],
    properties: {
      groups: {
        type: 'array',
        items: {
          type: 'object',
          required: ['agency', 'offers'],
          properties: {
            agency: { type: 'string', enum: ['Fannie Mae', 'Freddie Mac', 'Ginnie Mae', 'Other'] },
            offers: {
              type: 'array',
              items: {
                type: 'object',
                required: ['name'],
                properties: {
                  name:      { type: 'string',  description: 'Bond name exactly as shown (e.g. FHMS K-1516 A2, FN BL6317)' },
                  cusip:     { type: ['string','null'], description: '9-char CUSIP exactly as shown (e.g. 3137FUZJ6)' },
                  size:      { type: ['string','null'], description: 'Size exactly as shown (e.g. 97.98MM, 1.14mm, 500,000)' },
                  coupon:    { type: ['string','null'], description: 'Coupon exactly as shown (e.g. 2.32%, 4.65%, Fixed)' },
                  spread:    { type: ['string','null'], description: 'Spread exactly as shown (e.g. 30.5, +68, 27.5, S+85). Null if dollar-priced only.' },
                  price:     { type: ['string','null'], description: 'Offer price exactly as shown (e.g. ~84-18, $99-26, 95.40, ~78-30)' },
                  wal:       { type: ['string','null'], description: 'WAL exactly as shown (e.g. 8.00, 9.76, 4.92)' },
                  yield:     { type: ['string','null'], description: 'Yield exactly as shown (e.g. ~4.72%, 4.8%, ~4.73%)' },
                  maturity:  { type: ['string','null'], description: 'Loan term / call structure exactly as shown (e.g. Seas 15/14.5, 10/9.5, 5/4.5)' },
                  structure: { type: ['string','null'], description: 'Product type exactly as shown (e.g. DUS PTIO, PC FTIO, K-Series, No IO, Floater)' },
                  rate_type: { type: ['string','null'], description: 'Fixed, Floating, or IO' },
                  rating:    { type: ['string','null'], description: 'Credit rating if shown (e.g. AAA, A2)' },
                  collateral:{ type: ['string','null'], description: 'Collateral type if shown' },
                  notes:     { type: ['string','null'], description: 'Any other info from the source line' },
                }
              }
            }
          }
        }
      }
    }
  }
};

const SYSTEM = `You are an expert Agency CMBS trader parsing a dealer offer list.

STRICT RULES — these are non-negotiable:
1. Copy every value CHARACTER-FOR-CHARACTER from the source. Never reformat, round, convert, or calculate.
2. If size shows "97.98MM" — write "97.98MM". If it shows "500,000" — write "500,000". Never convert to another format.
3. If price shows "~84-18" — write "~84-18". If it shows "$99-26" — write "$99-26".
4. If spread shows "30.5" — write "30.5". If it shows "+68" — write "+68".
5. Extract EVERY offer. Do not skip any row, even small positions or duplicates.
6. If a field is not present for a specific offer, set it to null — never guess or carry over from another row.
7. CUSIPs: extract the 9-character alphanumeric code exactly (e.g. 3137FUZJ6, 3140LG5V0).

Agency classification:
- Fannie Mae: bonds starting with FN, FNA, or containing DUS/ACE/GEM/ACES
- Freddie Mac: bonds starting with FR, FHMS, or containing K-Series/PC/Gold PC
- Ginnie Mae: GNMA, FHA, VA, HUD bonds
- Other: SBAP, SBA, and anything else`;

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { dealer, text } = req.body || {};
  if (!dealer || !text) return res.status(400).json({ error: 'dealer and text required' });

  const apiKey = process.env.ANTHROPIC_KEY || process.env.anthropic_key;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_KEY not configured' });

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
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'extract_offers' },
      messages: [{ role: 'user', content: `Extract all offers from this dealer list (${dealer}):\n\n${text}` }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return res.status(502).json({ error: 'Anthropic API error', detail: err });
  }

  const data = await response.json();

  // Tool use returns structured input — much more reliable than free-form JSON
  const toolBlock = data.content?.find(b => b.type === 'tool_use');
  if (!toolBlock || !toolBlock.input) {
    return res.status(422).json({ error: 'No tool response from model', content: data.content });
  }

  return res.status(200).json(toolBlock.input);
};
