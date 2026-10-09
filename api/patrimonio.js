/**
 * Vercel Serverless Function — proxy SOMENTE LEITURA para a API do Google Apps Script.
 * Projeto: Gerenciador de Patrimônio (https://patrimonio-ten.vercel.app)
 *
 *   GET /api/patrimonio?ping=1  → { ok, configured }               (diagnóstico)
 *   GET /api/patrimonio         → { ok, data:{ headers, rows } }   (dados da planilha)
 *   qualquer outro método       → 405
 *
 * Variáveis de ambiente (Vercel › Settings › Environment Variables):
 *   APPS_SCRIPT_URL   (obrigatória) a MESMA URL /exec usada pelo Atualizador
 *   APPS_SCRIPT_TOKEN (obrigatória) o READ_TOKEN do Apps Script (recomendado)
 */
const { config, send, listRows } = require('./_lib/shared');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { ok: false, error: 'Este projeto é somente leitura. Alterações devem ser feitas no Atualizador.' });
  }

  const { configured } = config();
  if (req.query && req.query.ping) return send(res, 200, { ok: true, configured, readOnly: true });
  if (!configured) {
    return send(res, 503, { ok: false, configured: false, error: 'Variáveis APPS_SCRIPT_URL / APPS_SCRIPT_TOKEN não configuradas na Vercel.' });
  }

  try {
    const j = await listRows();
    return send(res, j.ok ? 200 : 502, j);
  } catch (err) {
    console.error('Proxy error:', err);
    const timeout = err && err.name === 'AbortError';
    return send(res, timeout ? 504 : 500, { ok: false, error: timeout ? 'Tempo esgotado ao contatar o Google Apps Script' : 'Falha ao contatar o Google Apps Script' });
  }
};
