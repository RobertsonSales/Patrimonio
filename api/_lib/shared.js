/**
 * Biblioteca compartilhada pelas funções da pasta /api.
 * Arquivos/pastas iniciados por "_" dentro de /api NÃO viram rotas na Vercel.
 *
 * Projeto: Atualizador da planilha (equipamentosonline) — leitura + gravação
 * na aba "Patrimônio aferido". O Gerenciador (patrimonio-ten) lê a mesma aba
 * pelo seu próprio proxy somente leitura.
 */

function config() {
  const url = (process.env.APPS_SCRIPT_URL || '').trim();
  const token = (process.env.APPS_SCRIPT_TOKEN || '').trim();
  return { url, token, configured: Boolean(url && token) };
}

function send(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(body));
}

async function callScript(init, ms = 25000) {
  const { url, token } = config();
  const target = init && init.method === 'POST' ? url : `${url}?token=${encodeURIComponent(token)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(target, { redirect: 'follow', ...init, signal: ctrl.signal });
    const text = await r.text();
    try { return JSON.parse(text); }
    catch {
      return { ok: false, error: `Apps Script respondeu HTTP ${r.status} (não-JSON). Verifique se a implantação está como "Qualquer pessoa" e se a URL termina em /exec.` };
    }
  } finally { clearTimeout(timer); }
}

const listRows = () => callScript();

const mutate = (payload) => callScript({
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify({ ...payload, token: config().token })
});

module.exports = { config, send, listRows, mutate };
