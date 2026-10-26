/**
 * POST /api/cadastro — gravação de clientes/unidades na aba "Patrimônio aferido".
 *
 * Projeto: Gerenciador de Patrimônio (patrimonio-ten). O proxy /api/patrimonio
 * continua SOMENTE LEITURA (READ_TOKEN). Esta função é a única que grava e:
 *   - exige a chave do operador no cabeçalho X-Cadastro-Key (env CADASTRO_KEY);
 *   - usa o token de ESCRITA do Apps Script (env APPS_SCRIPT_WRITE_TOKEN), que
 *     nunca chega ao navegador;
 *   - aceita só as ações "create" e "update" (nunca exclui linhas);
 *   - aceita só as colunas de cadastro (lista ALLOWED abaixo).
 *
 * Corpo esperado: { "ops": [ { "action": "create", "row": {"Cliente": "...", ...} },
 *                            { "action": "update", "id": "...", "row": {"Unidade": "..."} } ] }
 * Resposta:       { "ok": true, "results": [ { "ok": true, "meta": {planilha, aba, linha} } | { "ok": false, "error": "..." } ] }
 *
 * v2 — Unidade deixou de ser obrigatória na inclusão (aba "Incluir cliente"); o "meta" devolvido pelo
 *      Apps Script v3.2 é repassado ao navegador, que mostra em qual planilha/linha gravou.
 *
 * O formato enviado ao Apps Script ({ action, record, token }) é montado em
 * toScriptPayload(), conforme o doPost da "API de Patrimônio" v3.0.
 */
const crypto = require('crypto');

const MAX_OPS = 10;           // por requisição (o navegador envia lotes de 8)
const SCRIPT_TIMEOUT = 25000; // ms por chamada ao Apps Script

// Cabeçalhos aceitos (normalizados: sem acento, minúsculos, só letras/dígitos)
const ALLOWED = {
  create: ['cliente', 'unidade', 'regiao', 'cnpj', 'categoria', 'equipamento', 'serial', 'setor', 'instalacao'],
  update: ['cliente', 'unidade', 'regiao', 'cnpj']
};

const norm = (h) => String(h ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function send(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(body));
}

function sameSecret(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/* Contrato do Apps Script "API de Patrimônio" v3.0 (doPost):
 *   { action: 'create', record: {...}, token }          → anexa a linha (o script gera o ID e a PROX.)
 *   { action: 'update', record: { ID, ...campos }, token } → mescla: colunas ausentes são preservadas
 * O token precisa ser o API_TOKEN (canWrite_). Datas devem chegar como 'yyyy-MM-dd'. */
const ID_COL = 'ID';
function toScriptPayload(op, token) {
  const record = { ...op.row };
  if (op.action === 'update') record[ID_COL] = String(op.id);
  else delete record[ID_COL];
  return { action: op.action, record, token };
}

async function callScript(url, payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SCRIPT_TIMEOUT);
  try {
    const r = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    });
    const text = await r.text();
    try { return JSON.parse(text); }
    catch { return { ok: false, error: `Apps Script respondeu HTTP ${r.status} (não-JSON)` }; }
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'Tempo esgotado no Apps Script' : e.message };
  } finally { clearTimeout(timer); }
}

function validateOp(op) {
  if (!op || typeof op !== 'object') return 'Operação inválida';
  if (!['create', 'update'].includes(op.action)) return `Ação não permitida: ${op.action}`;
  if (op.action === 'update' && !String(op.id ?? '').trim()) return 'Atualização sem ID';
  if (!op.row || typeof op.row !== 'object' || Array.isArray(op.row)) return 'Linha sem dados';
  const keys = Object.keys(op.row);
  if (!keys.length) return 'Linha sem dados';
  const bad = keys.filter((k) => !ALLOWED[op.action].includes(norm(k)));
  if (bad.length) return `Coluna(s) não permitida(s): ${bad.join(', ')}`;
  for (const k of keys) {
    const v = op.row[k];
    if (typeof v !== 'string' || v.length > 200) return `Valor inválido na coluna ${k}`;
    if (norm(k) === 'instalacao' && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'Instalação deve estar no formato aaaa-mm-dd';
  }
  if (op.action === 'create') {
    const present = new Set(keys.map(norm));
    // Unidade é opcional: a aba "Incluir cliente" pode gravar um cliente ainda sem unidades
    const need = ['cliente', 'regiao'].filter((f) => !present.has(f) || !String(op.row[keys.find((k) => norm(k) === f)]).trim());
    if (need.length) return `Campos obrigatórios ausentes: ${need.join(', ')}`;
  }
  return null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { ok: false, error: 'Método não permitido' });
  }

  const url = (process.env.APPS_SCRIPT_URL || '').trim();
  const token = (process.env.APPS_SCRIPT_WRITE_TOKEN || '').trim();
  const key = (process.env.CADASTRO_KEY || '').trim();
  if (!url || !token || !key) {
    return send(res, 503, { ok: false, error: 'Gravação não configurada na Vercel (APPS_SCRIPT_URL, APPS_SCRIPT_WRITE_TOKEN e CADASTRO_KEY).' });
  }

  const provided = String(req.headers['x-cadastro-key'] || '');
  if (!provided || !sameSecret(provided, key)) {
    return send(res, 401, { ok: false, error: 'Chave do operador inválida' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const ops = body && Array.isArray(body.ops) ? body.ops : null;
  if (!ops || !ops.length) return send(res, 400, { ok: false, error: 'Nenhuma operação enviada' });
  if (ops.length > MAX_OPS) return send(res, 400, { ok: false, error: `Máximo de ${MAX_OPS} operações por requisição` });

  // Valida tudo antes de gravar qualquer linha
  for (let i = 0; i < ops.length; i++) {
    const err = validateOp(ops[i]);
    if (err) return send(res, 400, { ok: false, error: `Operação ${i + 1}: ${err}` });
  }

  // Grava em sequência (o Apps Script serializa escritas na planilha)
  const results = [];
  for (const op of ops) {
    const r = await callScript(url, toScriptPayload(op, token));
    // meta (Apps Script v3.2+): { planilha, planilhaId, aba, linha } — onde a linha foi gravada
    results.push(r && r.ok ? { ok: true, meta: r.meta || null } : { ok: false, error: (r && r.error) || 'Erro não informado pelo Apps Script' });
    if (!r || !r.ok) break; // interrompe no primeiro erro para não deixar lacunas silenciosas
  }

  return send(res, 200, { ok: true, results });
};
