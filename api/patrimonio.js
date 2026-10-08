/**
 * Vercel Serverless Function — proxy seguro para a API do Google Apps Script.
 * Atende as DUAS aplicações do repositório a partir da MESMA planilha:
 *
 *   GET  /api/patrimonio?ping=1  → { ok, configured }               (diagnóstico / detecção de modo)
 *   GET  /api/patrimonio         → { ok, data:{ headers, rows } }   (Atualizador e Gerenciador)
 *   POST /api/patrimonio         → create | update | delete         (somente o Atualizador usa)
 *
 * A URL /exec e o token NUNCA chegam ao navegador (variáveis de ambiente da Vercel):
 *   APPS_SCRIPT_URL   (obrigatória) URL do Web App terminada em /exec
 *   APPS_SCRIPT_TOKEN (obrigatória) mesmo valor da propriedade API_TOKEN do Apps Script
 *   ALLOWED_ORIGIN    (opcional)    ex.: https://patrimonio-dashboard.vercel.app — bloqueia POST de outras origens
 */
const { config, send, listRows, mutate } = require('./_lib/shared');

const ACTIONS = new Set(['create', 'update', 'delete']);

module.exports = async (req, res) => {
  const { configured } = config();
  const q = req.query || {};

  if (req.method === 'GET' && q.ping) return send(res, 200, { ok: true, configured });
  if (!configured) {
    return send(res, 503, { ok: false, configured: false, error: 'Variáveis APPS_SCRIPT_URL / APPS_SCRIPT_TOKEN não configuradas na Vercel.' });
  }

  try {
    if (req.method === 'GET') {
      const j = await listRows();
      return send(res, j.ok ? 200 : 502, j);
    }

    if (req.method === 'POST') {
      const allowed = (process.env.ALLOWED_ORIGIN || '').trim().replace(/\/$/, '');
      const origin = req.headers.origin || '';
      if (allowed && origin && origin !== allowed) return send(res, 403, { ok: false, error: 'Origem não autorizada' });

      let body;
      try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); }
      catch { return send(res, 400, { ok: false, error: 'JSON inválido' }); }

      if (!ACTIONS.has(body.action)) return send(res, 400, { ok: false, error: 'Ação inválida' });
      if (body.action === 'delete' && !body.id) return send(res, 400, { ok: false, error: 'ID ausente' });
      if (body.action !== 'delete' && (typeof body.record !== 'object' || !body.record)) return send(res, 400, { ok: false, error: 'Registro ausente' });

      const j = await mutate({ action: body.action, id: body.id, record: body.record });
      return send(res, j.ok ? 200 : 502, j);
    }

    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { ok: false, error: 'Método não permitido' });
  } catch (err) {
    console.error('Proxy error:', err);
    const timeout = err && err.name === 'AbortError';
    return send(res, timeout ? 504 : 500, { ok: false, error: timeout ? 'Tempo esgotado ao contatar o Google Apps Script' : 'Falha ao contatar o Google Apps Script' });
  }
};
