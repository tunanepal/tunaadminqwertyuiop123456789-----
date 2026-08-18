/* Tunanepal admin — Supabase client + session.
   The admin token is checked inside Postgres. Faking this screen in devtools
   gets you a panel that returns nothing. */

export const SUPABASE_URL = 'https://dzxtwtcizoogqqacnpdd.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_WVMexNwIj4J3bNZwbrEZPg_HBqmX013';

export const BUCKET_PUBLIC = 'tuna-public';
export const BUCKET_PROOF  = 'tuna-proof';

const TOKEN_KEY = 'tuna.admin';
export const getToken   = () => localStorage.getItem(TOKEN_KEY);
export const setToken   = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

function readError(payload, status) {
  const raw = payload?.message || payload?.error_description || payload?.error;
  if (!raw) return status === 0 ? 'No connection.' : 'Request failed.';
  return String(raw).replace(/^ERROR:\s*/i, '');
}

export async function rpc(fn, args = {}) {
  let res, body;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(args)
    });
  } catch { throw new Error('No connection. Check your internet.'); }
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok) {
    const err = new Error(readError(body, res.status));
    err.expired = /session expired/i.test(err.message);
    throw err;
  }
  return body;
}

export const rpcAuth = (fn, args = {}) => rpc(fn, { p_token: getToken(), ...args });

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export async function upload(bucket, file) {
  const ext = EXT[file.type];
  if (!ext) throw new Error('Use a JPG, PNG or WebP image.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Keep the image under 5 MB.');
  const path = `${crypto.randomUUID()}.${ext}`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': file.type,
      'x-upsert': 'false'
    },
    body: file
  });
  if (!res.ok) throw new Error('Upload failed. Try again.');
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}
