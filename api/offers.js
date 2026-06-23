const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.supabase_url;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.supabase_key;

async function sbFetch(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — fetch offers
  if (req.method === 'GET') {
    const { date, from_date } = req.query || {};
    let path = '/cmbs_offers?order=date.desc,id.asc&select=*';
    if (date) path += `&date=eq.${date}`;
    else if (from_date) path += `&date=gte.${from_date}`;
    const { status, data } = await sbFetch(path);
    return res.status(status).json(data);
  }

  // POST — bulk insert (delete existing for date first)
  if (req.method === 'POST') {
    const { date, offers } = req.body || {};
    if (!date || !Array.isArray(offers)) {
      return res.status(400).json({ error: 'date and offers[] required' });
    }

    // Delete existing for date
    const del = await sbFetch(`/cmbs_offers?date=eq.${date}`, {
      method: 'DELETE',
      prefer: 'return=minimal',
    });
    if (del.status >= 400) {
      return res.status(502).json({ error: 'Delete failed', detail: del.data });
    }

    if (offers.length === 0) return res.status(200).json({ inserted: 0 });

    const rows = offers.map(o => ({ ...o, date }));
    const ins = await sbFetch('/cmbs_offers', {
      method: 'POST',
      body: JSON.stringify(rows),
    });
    if (ins.status >= 400) {
      return res.status(502).json({ error: 'Insert failed', detail: ins.data });
    }
    return res.status(200).json({ inserted: Array.isArray(ins.data) ? ins.data.length : rows.length });
  }

  // DELETE — remove all for a date
  if (req.method === 'DELETE') {
    const { date } = req.body || {};
    if (!date) return res.status(400).json({ error: 'date required' });
    const { status, data } = await sbFetch(`/cmbs_offers?date=eq.${date}`, {
      method: 'DELETE',
      prefer: 'return=minimal',
    });
    if (status >= 400) return res.status(502).json({ error: 'Delete failed', detail: data });
    return res.status(200).json({ deleted: true, date });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
