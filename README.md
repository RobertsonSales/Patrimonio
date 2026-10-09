# Gerenciador de Patrimônio — patrimonio-ten (v2.1)

**Produção:** https://patrimonio-ten.vercel.app
**Função:** filtros, resumos, exportação Excel, relatórios PDF e manutenção preventiva a partir da aba `Patrimônio aferido` no Google Sheets — **somente leitura**.
**Alterações nos dados:** pelo Atualizador — https://equipamentosonline.vercel.app (repositório próprio).

## Estrutura do repositório

```text
patrimonio-ten/
├── api/
│   ├── _lib/
│   │   └── shared.js      # configuração + leitura no Apps Script (não vira rota)
│   └── patrimonio.js      # GET ?ping=1 | GET linhas — qualquer outro método → 405
├── index.html             # aplicação (sem nenhuma chave no código)
├── vercel.json            # cabeçalhos de segurança (CSP, HSTS…) e config. da função
├── package.json           # Node ≥ 18, sem dependências
├── .env.example           # modelo das variáveis (sem valores reais)
├── .gitignore             # impede commit de .env / .vercel
├── .vercelignore          # não publica README.md, .env.example
└── README.md
```

> O `Code.gs` (API no Google) fica no repositório do Atualizador, em `apps-script/Code.gs`. Não há cópia aqui para evitar duas versões divergentes.

## Como os dados chegam

```text
Navegador ──/api/patrimonio──▶ Função Vercel deste projeto (+ READ_TOKEN) ──▶ Apps Script ──▶ Planilha
```

- A página carrega a planilha automaticamente ao abrir; **↻ Atualizar dados da planilha** relê sem perder os filtros ativos.
- As colunas são localizadas **pelo nome do cabeçalho** (a aba no Google Sheets tem `ID` na coluna A e `CNPJ` no fim). Se uma coluna for renomeada, o app avisa qual não encontrou.
- O proxy deste projeto **não aceita gravação** (POST → 405), e o `READ_TOKEN` também é recusado pelo Apps Script para gravar.

## Passo a passo

### 1. Pré-requisito no Apps Script
Siga o passo 1 do README do Atualizador: novo `Code.gs` publicado como **Nova versão** e propriedade **`READ_TOKEN`** criada.

### 2. GitHub
Substitua os arquivos do repositório pelos deste pacote e faça push na branch de produção (`main`).
O app fica em `index.html`, servido na raiz do domínio.

### 3. Vercel (projeto patrimonio-ten) › Settings › Environment Variables

| Nome | Obrigatória | Valor | Ambientes |
|---|---|---|---|
| `APPS_SCRIPT_URL` | Sim | a **mesma** URL `/exec` do Atualizador | Production, Preview, Development |
| `APPS_SCRIPT_TOKEN` | Sim | valor do **`READ_TOKEN`** (não use o `API_TOKEN`) | Production, Preview, Development |

`ALLOWED_ORIGIN` não é necessária aqui (o projeto não grava).
Depois: **Deployments › ⋯ › Redeploy**.

### 4. Verificação
| Teste | Resultado esperado |
|---|---|
| https://patrimonio-ten.vercel.app/api/patrimonio?ping=1 | `{"ok":true,"configured":true,"readOnly":true}` |
| https://patrimonio-ten.vercel.app | selo verde **● Conectado ao Google Sheets** e “N registro(s)” |
| Editar um item no Atualizador → **↻ Atualizar dados da planilha** aqui | alteração aparece, filtros preservados |

## Contingência
Se a planilha não puder ser lida, o app mostra o motivo e libera a importação de um `.xlsx` baixado do Google Sheets (Arquivo › Fazer download › .xlsx), com o mesmo mapeamento por nome de coluna.

## Solução de problemas
| Sintoma | Causa provável |
|---|---|
| "Variáveis … não configuradas" | Variáveis ausentes ou deploy anterior a elas → Redeploy |
| "Token inválido" | `READ_TOKEN` não criado no Apps Script, valor diferente, ou o `Code.gs` novo não foi publicado como Nova versão |
| "Apps Script respondeu HTTP … (não-JSON)" | URL não termina em `/exec` ou implantação não está como "Qualquer pessoa" |
| Aviso "Colunas não encontradas" | Cabeçalho renomeado na planilha → restaurar o nome |
| Imagens do carrossel não aparecem | São hospedadas em `sspark.genspark.ai` (liberado na CSP); se o link expirar, copie-as para `/img` no repositório |
