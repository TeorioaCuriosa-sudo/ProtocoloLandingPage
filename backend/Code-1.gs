/**
 * =========================================================
 *  Parceria Teoriacuriosa | Grupo CCR
 *  Backend em Google Apps Script
 *
 *  Por cada resposta ao formulário:
 *   1. Gera um comprovativo PDF do consentimento (data/hora, email,
 *      versão e texto aceite, IP, user agent, hash de integridade)
 *      e guarda-o no Google Drive.
 *   2. Acrescenta uma linha no Google Sheet (com coluna Sim/Não para
 *      novas campanhas, link para o PDF e a origem do contacto: grupo, empresa e canal).
 *   3. Atualiza uma cópia .xlsx (Excel) do Sheet na mesma pasta do Drive.
 *   4. Envia o email automático de agradecimento.
 *
 *  Campos do formulário (script.js): nome, contacto (telefone), email e área de negócio.
 *
 *  Primeira utilização: ver LEIA-ME.md (correr setup() uma vez e publicar como Web App).
 * =========================================================
 */

// Mude este texto sempre que alterar o código: abra o endereço /exec no browser e veja se mostra a versão nova.
const VERSAO_CODIGO = '2026-11-18-ccr-v6';

// ---------------- CONFIGURAÇÃO ----------------
// Para replicar esta página para outro cliente, é aqui (e nos textos do index.html) que se muda.
const CONFIG = {
  CAMPANHA: 'Parceria Teoriacuriosa | Grupo CCR',
  // Nome do parceiro/grupo tal como aparece na frase do email: "...através da parceria entre a Teoriacuriosa e o <PARCERIA>."
  PARCERIA: 'Grupo CCR',
  MARCA: 'Teoriacuriosa',

  // Nomes das colunas do Sheet que mostram de onde veio cada contacto (vêm dos links do gerador de UTM).
  // Parceria com empresas: Grupo / Empresa / Canal.  Campanha em redes: Campanha / Plataforma / Formato.
  // Têm de ser mudados ANTES de correr o setup (ou, num Sheet que já existe, seguidos de atualizarCabecalhos).
  COLUNAS: { GRUPO: 'Grupo', EMPRESA: 'Empresa', CANAL: 'Canal' },
  PREFIXO_ID: 'CCR',

  // Áreas de negócio aceites (têm de ser iguais às opções do index.html)
  AREAS: [
    'Mediação de seguros',
    'Intermediação de crédito',
    'Mediação imobiliária',
    'Investimentos',
    'Agência de viagens',
  ],

  // Pasta principal no Drive (criada pelo setup()).
  NOME_PASTA: 'Protocolo Grupo CCR — Teoriacuriosa',
  NOME_SUBPASTA_PDF: 'Comprovativos de Consentimento',
  NOME_SHEET: 'Respostas Protocolo Grupo CCR',
  NOME_EXCEL: 'Respostas Protocolo Grupo CCR.xlsx',

  // Email
  // Endereço do domínio configurado no Gmail em "Enviar email como".
  // Se ficar vazio (''), os emails saem da conta Google que corre o script.
  EMAIL_FROM: '',
  EMAIL_NOME_REMETENTE: 'Teoriacuriosa',
  EMAIL_REPLY_TO: '',                        // email para respostas. Vazio = as respostas vão para a conta que envia
  EMAIL_NO_REPLY: false,                     // true só funciona em contas Google Workspace
  EMAIL_ASSUNTO: 'Recebemos o seu pedido de informação',

  // Endereço público da página (sem barra no fim). PREENCHER depois de publicar o site.
  // Ex.: 'https://protocolo.teoriacuriosa.pt'. Serve para o logo do email e para o link "Cancelar subscrição"
  // (que passa a apontar para o domínio da empresa, em vez de script.google.com: menos risco de spam).
  // Se ficar vazio, o email mostra o nome da marca em texto e o link de cancelar usa o Apps Script.
  URL_SITE: 'https://grupoccr.teoriacuriosa.pt',
  // Só usado quando URL_SITE está vazio. Endereço da Web App (o mesmo APPS_SCRIPT_URL do config.js, termina em /exec).
  // Vazio = o script usa o endereço da sua própria implementação.
  URL_WEBAPP: '',

  // Identificação do responsável pelo tratamento (aparece no PDF e no rodapé do email)
  RESPONSAVEL_TRATAMENTO: 'TeoriaCuriosa Unipessoal Lda, NIPC 515226939, Rua do Rio Novo 395 O, 4495-145, Amorim, Póvoa de Varzim',
  CONTACTO_PRIVACIDADE: 'geral@teoriacuriosa.pt',

  // Versão em vigor do texto dos consentimentos (tem de bater com script.js)
  CONSENT_VERSION: 'CCR2026-v1',
};

// Cores da marca (PDF, email e página de cancelamento)
const COR = { OURO: '#cc8f1c', OURO_ESCURO: '#8a5f0a', GRAFITE: '#2f2f32', FUNDO_SUAVE: '#fbf4e6' };

/**
 * Texto OFICIAL dos consentimentos, por versão.
 * É este texto (do servidor) que fica no comprovativo, não o que vem do browser,
 * para que não possa ser adulterado. Se alterar o texto na landing page,
 * crie aqui uma nova versão e mantenha as antigas (histórico).
 */
const CONSENT_TEXTS = {
  'CCR2026-v1': {
    privacidade:
      'Li e aceito a Política de Privacidade e autorizo o tratamento dos meus dados pessoais ' +
      'para responder a este pedido de informação.',
    marketing:
      'Aceito receber comunicações sobre novas campanhas, serviços e novidades da TeoriaCuriosa. ' +
      'Posso retirar este consentimento a qualquer momento.',
  },
};

// Colunas do Sheet. A ordem só conta na criação (setup). Depois, o script encontra
// cada coluna pelo NOME do cabeçalho, por isso mover colunas no Sheet não o estraga.
const HEADERS = [
  'ID', 'Data/Hora',
  CONFIG.COLUNAS.GRUPO, CONFIG.COLUNAS.EMPRESA,                    // de onde veio (links UTM)
  'Nome completo', 'Email', 'Contacto', 'Área de negócio',         // campos do formulário
  CONFIG.COLUNAS.CANAL, 'Conteúdo',                               // por onde veio (links UTM)
  'Aceita Política de Privacidade', 'Aceita novas campanhas', 'Versão do consentimento',
  'IP', 'User Agent', 'Comprovativo PDF', 'Hash SHA-256', 'Email enviado',
  'Cancelou novas campanhas em',
];

const PHONE_RE = /^\+?[0-9\s().-]{9,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ---------------- SETUP (correr 1 vez) ----------------
// Protegido: se já foi executado, não cria pastas/Sheet duplicados (que faziam os dados
// "desaparecer" para outro Sheet). Para criar tudo de novo de propósito, use setupForcar().
function setup() {
  const props = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty('SHEET_ID');
  if (sheetId) {
    Logger.log('O setup já foi executado. Nada foi criado.');
    try { Logger.log('Sheet em uso: ' + SpreadsheetApp.openById(sheetId).getUrl()); } catch (e) { Logger.log('Sheet em uso: ' + sheetId); }
    Logger.log('Para criar tudo de novo (pasta e Sheet novos), corra setupForcar().');
    return;
  }
  setupCriar_();
}

function setupForcar() { setupCriar_(); }

// Para um Sheet que já foi criado com a versão anterior do script: renomeia as colunas de origem
// (Origem (empresa), Meio e Campanha passam aos nomes de CONFIG.COLUNAS), acrescenta as que faltem e põe as
// colunas pela ordem nova. Não apaga nem altera dados. Pode correr-se mais do que uma vez.
// Num Sheet criado agora pelo setup() não é preciso.
function atualizarCabecalhos() {
  const sh = abrirSheet_();
  const lerCab = () => sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const antigos = { 'Origem (empresa)': CONFIG.COLUNAS.EMPRESA, 'Meio': CONFIG.COLUNAS.CANAL, 'Campanha': CONFIG.COLUNAS.GRUPO };

  // 1. nomes novos
  let cab = lerCab();
  cab.forEach((h, i) => {
    const novo = antigos[h];
    if (novo && cab.indexOf(novo) < 0) sh.getRange(1, i + 1).setValue(novo);
  });

  // 2. colunas que faltem ficam no fim (serão postas no sítio no passo seguinte)
  cab = lerCab();
  HEADERS.forEach(h => {
    if (cab.indexOf(h) < 0) {
      sh.getRange(1, sh.getLastColumn() + 1).setValue(h)
        .setFontWeight('bold').setBackground(COR.OURO).setFontColor(COR.GRAFITE);
      cab = lerCab();
    }
  });

  // 3. ordem nova (só se movem colunas da direita para a esquerda; colunas que alguém acrescentou ficam no fim)
  for (let i = 0; i < HEADERS.length; i++) {
    const atual = lerCab().indexOf(HEADERS[i]) + 1;
    if (atual > i + 1) sh.moveColumns(sh.getRange(1, atual, 1, 1), i + 1);
  }
  Logger.log('Cabeçalhos atualizados: ' + lerCab().join(' | '));
}

function setupCriar_() {
  const props = PropertiesService.getScriptProperties();

  const pasta = DriveApp.createFolder(CONFIG.NOME_PASTA);
  const subpasta = pasta.createFolder(CONFIG.NOME_SUBPASTA_PDF);

  const ss = SpreadsheetApp.create(CONFIG.NOME_SHEET);
  DriveApp.getFileById(ss.getId()).moveTo(pasta);

  const sh = ss.getSheets()[0];
  sh.setName('Respostas');
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
    .setFontWeight('bold').setBackground(COR.OURO).setFontColor(COR.GRAFITE);
  sh.setFrozenRows(1);

  // Coluna "Aceita novas campanhas" com lista Sim/Não
  const colMkt = HEADERS.indexOf('Aceita novas campanhas') + 1;
  const regra = SpreadsheetApp.newDataValidation().requireValueInList(['Sim', 'Não'], true).build();
  sh.getRange(2, colMkt, sh.getMaxRows() - 1, 1).setDataValidation(regra);

  // Formatação condicional: verde para Sim, vermelho para Não
  const rng = sh.getRange(2, colMkt, sh.getMaxRows() - 1, 1);
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Sim')
      .setBackground('#d1fae5').setFontColor('#065f46').setRanges([rng]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Não')
      .setBackground('#fee2e2').setFontColor('#991b1b').setRanges([rng]).build(),
  ]);

  props.setProperties({
    FOLDER_ID: pasta.getId(),
    PDF_FOLDER_ID: subpasta.getId(),
    SHEET_ID: ss.getId(),
  });

  Logger.log('Setup concluído.');
  Logger.log('Pasta: ' + pasta.getUrl());
  Logger.log('Sheet: ' + ss.getUrl());
}

// ---------------- ENDPOINT ----------------
function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);

    // Cancelar subscrição, vindo da página cancelar.html do site (o link do email aponta para o domínio da página)
    if (d.acao === 'cancelar') {
      cancelarSubscricao(d.id, d.t);   // lança erro se o link não for válido
      return json_({ ok: true, cancelado: true });
    }

    validar_(d);

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    let registo = null;
    let jaProcessado = null;
    try {
      // Mesmo preenchimento enviado duas vezes (duplo clique, nova tentativa): devolve o registo já criado
      jaProcessado = pedidoJaProcessado_(d);
      if (!jaProcessado) {
        registo = processar_(d);
        guardarPedido_(d, registo.id);
      }
    } finally {
      lock.releaseLock();
    }
    if (jaProcessado) return json_({ ok: true, id: jaProcessado });

    // Fora do lock: email e Excel não precisam de bloquear outras submissões
    const envio = enviarEmail_(registo);
    registo.emailOk = envio.ok;
    marcarEmail_(registo.linha, envio.ok ? 'Sim' : 'ERRO: ' + envio.erro);
    try { atualizarExcel_(); } catch (err) { console.error('Excel: ' + err); }

    return json_({ ok: true, id: registo.id });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err.message || err) });
  }
}

// GET sem parâmetros: teste de que a Web App está online.
// GET com ?acao=cancelar&id=...&t=...: página de cancelamento de subscrição.
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.acao === 'cancelar') return paginaCancelar_(p.id, p.t);
  return json_({ ok: true, status: 'online', campanha: CONFIG.CAMPANHA, versao: VERSAO_CODIGO,
                replyToDefinido: !!CONFIG.EMAIL_REPLY_TO });
}

// ---------------- LÓGICA ----------------
function validar_(d) {
  const obrig = ['nome', 'email', 'contacto', 'area'];
  obrig.forEach(k => {
    if (!d[k] || !String(d[k]).trim()) throw new Error('Campo obrigatório em falta: ' + k);
  });
  if (String(d.nome).trim().length > 120) throw new Error('Nome demasiado longo');
  if (String(d.email).length > 254 || !EMAIL_RE.test(d.email)) throw new Error('Email inválido');
  if (!PHONE_RE.test(String(d.contacto).trim())) throw new Error('Contacto inválido');
  if (CONFIG.AREAS.indexOf(String(d.area)) < 0) throw new Error('Área de negócio inválida');
  if (d.privacidade !== true) throw new Error('Política de Privacidade não aceite');
  if (!CONSENT_TEXTS[d.consentVersion]) throw new Error('Versão de consentimento desconhecida');
}

// Identificador do preenchimento (gerado no browser). Guardado 10 minutos na cache do script.
function pedidoJaProcessado_(d) {
  if (!/^[0-9a-f-]{36}$/.test(String(d.pedidoId || ''))) return null;
  return CacheService.getScriptCache().get('pedido_' + d.pedidoId);
}
function guardarPedido_(d, id) {
  if (!/^[0-9a-f-]{36}$/.test(String(d.pedidoId || ''))) return;
  CacheService.getScriptCache().put('pedido_' + d.pedidoId, id, 600);
}

function processar_(d) {
  const props = PropertiesService.getScriptProperties();
  const tz = Session.getScriptTimeZone();
  const agora = new Date();

  const id = CONFIG.PREFIXO_ID + '-' + Utilities.formatDate(agora, tz, 'yyyyMMdd-HHmmss') + '-' +
             Utilities.getUuid().slice(0, 4).toUpperCase();
  const dataHora = Utilities.formatDate(agora, tz, "dd/MM/yyyy HH:mm:ss '(" + tz + ")'");
  const isoUTC = agora.toISOString();
  const textos = CONSENT_TEXTS[d.consentVersion];
  const marketing = d.marketing === true;
  const ip = ipSeguro_(d.ip);

  // Hash de integridade do registo (prova de que o PDF não foi alterado depois)
  const base = [id, isoUTC, d.email, d.consentVersion, 'privacidade=true',
                'marketing=' + marketing, ip, textos.privacidade,
                marketing ? textos.marketing : ''].join('|');
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, base, Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');

  const origem = lerOrigem_(d);   // grupo / empresa / canal / conteúdo (UTM)

  const nome = String(d.nome).trim();
  const registo = {
    id, dataHora, isoUTC, hash, marketing, textos,
    nome,
    primeiroNome: nome.split(/\s+/)[0],
    area: String(d.area),
    email: String(d.email).trim().toLowerCase(),
    ip: ip || 'Não disponível',
    userAgent: String(d.userAgent || '').slice(0, 300),
    versao: d.consentVersion,
    pagina: String(d.pagina || '').slice(0, 300),
  };

  // 1. PDF
  const pdf = gerarPdf_(registo, props.getProperty('PDF_FOLDER_ID'));
  registo.pdfUrl = pdf.getUrl();

  // 2. Sheet — cada valor vai para a coluna com o nome certo (lido do cabeçalho do Sheet)
  const sh = abrirSheet_();
  const valores = {
    'ID': id,
    'Data/Hora': dataHora,
    'Nome completo': registo.nome,
    'Email': registo.email,
    'Contacto': String(d.contacto).trim(),
    'Área de negócio': registo.area,
    'Aceita Política de Privacidade': 'Sim',
    'Aceita novas campanhas': marketing ? 'Sim' : 'Não',
    'Versão do consentimento': d.consentVersion,
    'IP': registo.ip,
    'User Agent': registo.userAgent,
    'Comprovativo PDF': registo.pdfUrl,
    'Hash SHA-256': hash,
    'Email enviado': 'A enviar…',
    [CONFIG.COLUNAS.GRUPO]: origem.campanha,     // utm_campaign
    [CONFIG.COLUNAS.EMPRESA]: origem.fonte,      // utm_source
    [CONFIG.COLUNAS.CANAL]: origem.meio,         // utm_medium
    'Conteúdo': origem.conteudo,                 // utm_content
  };
  const cab = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.appendRow(cab.map(h => seguro_(valores[h])));
  registo.linha = sh.getLastRow();

  return registo;
}

// Origem do contacto. O site envia quatro campos (origemFonte, origemMeio, origemCampanha, origemConteudo),
// que vêm dos parâmetros UTM do link: utm_source = empresa, utm_medium = canal, utm_campaign = grupo, utm_content.
// Cada valor é limpo para letras minúsculas, números, ponto, hífen e sublinhado (máx. 30), por isso
// um pedido forjado não consegue meter lixo ou fórmulas nas colunas.
function limparOrigem_(v) {
  return String(v == null ? '' : v)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

function lerOrigem_(d) {
  return {
    fonte: limparOrigem_(d.origemFonte),
    meio: limparOrigem_(d.origemMeio),
    campanha: limparOrigem_(d.origemCampanha),
    conteudo: limparOrigem_(d.origemConteudo),
  };
}

// Só aceita algo com cara de endereço IP (v4 ou v6); qualquer outra coisa fica vazia.
function ipSeguro_(v) {
  const s = String(v || '').trim();
  return /^[0-9a-fA-F:.]{3,45}$/.test(s) ? s : '';
}

// Evita "formula injection" (valores começados por = + - @ seriam interpretados como fórmulas)
function seguro_(v) {
  const s = String(v == null ? '' : v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

// Folha "Respostas" do Sheet em uso
function abrirSheet_() {
  return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'))
    .getSheetByName('Respostas');
}

// Número (a partir de 1) da coluna com este cabeçalho, lido do Sheet real
function coluna_(sh, nome) {
  const cab = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const i = cab.indexOf(nome);
  if (i < 0) throw new Error('Coluna "' + nome + '" não existe no Sheet.');
  return i + 1;
}

// Escreve na coluna "Email enviado": "Sim" ou "ERRO: <motivo>" (assim o erro fica visível no Sheet)
function marcarEmail_(linha, texto) {
  const sh = abrirSheet_();
  sh.getRange(linha, coluna_(sh, 'Email enviado')).setValue(texto);
}

// ---------------- PDF ----------------
function gerarPdf_(r, pastaId) {
  const esc = escHtml_;
  const linha = (k, v) =>
    `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`;

  const html = `
  <html><head><meta charset="utf-8"><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:11px;margin:28px}
    h1{font-size:18px;margin:0 0 4px}
    .sub{color:#555;margin:0 0 18px}
    .bar{height:6px;background:${COR.OURO};margin-bottom:18px}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}
    th,td{border:1px solid #ccc;padding:7px 9px;text-align:left;vertical-align:top}
    th{background:#f2f2f2;width:32%}
    .box{border:1px solid #ccc;padding:10px 12px;margin-bottom:10px}
    .estado{font-weight:bold}
    .sim{color:#065f46}.nao{color:#991b1b}
    .hash{font-family:monospace;font-size:9px;word-break:break-all}
    .foot{color:#666;font-size:9px;margin-top:22px}
  </style></head><body>
    <div class="bar"></div>
    <h1>Comprovativo de Consentimento</h1>
    <p class="sub">${esc(CONFIG.CAMPANHA)}</p>

    <table>
      ${linha('ID do registo', r.id)}
      ${linha('Data e hora', r.dataHora)}
      ${linha('Data e hora (UTC, ISO 8601)', r.isoUTC)}
      ${linha('Nome', r.nome)}
      ${linha('Email do titular', r.email)}
      ${linha('Endereço IP', r.ip)}
      ${linha('Navegador (User Agent)', r.userAgent)}
      ${linha('Página de origem', r.pagina)}
      ${linha('Versão do texto aceite', r.versao)}
    </table>

    <h3>Consentimentos</h3>
    <div class="box">
      <p class="estado sim">✔ ACEITE — Política de Privacidade (obrigatório)</p>
      <p>"${esc(r.textos.privacidade)}"</p>
    </div>
    <div class="box">
      <p class="estado ${r.marketing ? 'sim' : 'nao'}">
        ${r.marketing ? '✔ ACEITE' : '✘ NÃO ACEITE'} — Comunicações de marketing por email e telefone (opcional)
      </p>
      <p>"${esc(r.textos.marketing)}"</p>
    </div>

    <h3>Integridade</h3>
    <p>Hash SHA-256 do registo:</p>
    <p class="hash">${esc(r.hash)}</p>

    <p class="foot">
      Responsável pelo tratamento: ${esc(CONFIG.RESPONSAVEL_TRATAMENTO)}.
      Contacto para exercício de direitos (acesso, retificação, apagamento, oposição e retirada
      do consentimento): ${esc(CONFIG.CONTACTO_PRIVACIDADE)}.
      Documento gerado automaticamente no momento da submissão do formulário.
    </p>
  </body></html>`;

  const nomeFicheiro = `${r.id}_${r.email.replace(/[^a-z0-9@._-]/gi, '_')}.pdf`;
  const blob = Utilities.newBlob(html, 'text/html', 'tmp.html').getAs('application/pdf').setName(nomeFicheiro);
  return DriveApp.getFolderById(pastaId).createFile(blob);
}

// ---------------- EXCEL (.xlsx) ----------------
// Exporta o Google Sheet para .xlsx e substitui sempre o mesmo ficheiro na pasta
// (usa o serviço avançado "Drive API" — ativado no appsscript.json).
function atualizarExcel_() {
  const props = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty('SHEET_ID');
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
  const blob = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
  }).getBlob().setName(CONFIG.NOME_EXCEL);

  const xlsxId = props.getProperty('XLSX_ID');
  if (xlsxId) {
    try {
      Drive.Files.update({}, xlsxId, blob);
      return;
    } catch (err) {
      console.warn('Ficheiro .xlsx não encontrado, a criar novo: ' + err);
    }
  }
  const novo = Drive.Files.create(
    { name: CONFIG.NOME_EXCEL, parents: [props.getProperty('FOLDER_ID')] }, blob);
  props.setProperty('XLSX_ID', novo.id);
}

// ---------------- EMAIL ----------------
function enviarEmail_(r, assunto) {
  try {
    const assuntoFinal = assunto || CONFIG.EMAIL_ASSUNTO;   // "assunto" só é usado nos testes
    const esc = escHtml_;
    // Primeira palavra do nome escrito no formulário
    const primeiroNome = r.primeiroNome
      ? String(r.primeiroNome).trim()
      : String(r.nome).trim().split(/\s+/)[0];
    const area = r.area ? String(r.area) : '';

    const blocoMarketing = r.marketing ? `
      <p style="margin:0 0 20px;padding:14px 16px;background:${COR.FUNDO_SUAVE};border-left:4px solid ${COR.OURO};color:${COR.GRAFITE};font-size:14px;line-height:1.6">
        Confirmamos que aceitou receber comunicações da Teoriacuriosa sobre <strong>novas campanhas, serviços e novidades</strong>.
        Pode retirar este consentimento a qualquer momento:
        <a href="${esc(linkCancelar_(r.id))}" style="color:${COR.OURO_ESCURO};font-weight:bold">Cancelar subscrição</a>,
        ou escreva para <a href="mailto:${esc(CONFIG.CONTACTO_PRIVACIDADE)}" style="color:${COR.OURO_ESCURO}">${esc(CONFIG.CONTACTO_PRIVACIDADE)}</a>.
      </p>` : '';

    const logo = CONFIG.URL_SITE
      ? `<img src="${esc(CONFIG.URL_SITE)}/assets/logo-horizontal-claro.png" alt="${esc(CONFIG.MARCA)}" width="240" style="display:block;margin:0 0 28px;max-width:100%;height:auto">`
      : `<p style="font-size:20px;font-weight:bold;color:${COR.GRAFITE};margin:0 0 28px">${esc(CONFIG.MARCA)}</p>`;

    const linhaArea = area
      ? `Recebemos o seu pedido de informação sobre <strong>${esc(area)}</strong>, feito através da parceria entre a Teoriacuriosa e o ${esc(CONFIG.PARCERIA)}.`
      : `Recebemos o seu pedido de informação, feito através da parceria entre a Teoriacuriosa e o ${esc(CONFIG.PARCERIA)}.`;

    // Documento HTML completo (doctype, head, body): os filtros de spam desconfiam de fragmentos soltos
    const html = `<!doctype html>
    <html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(assuntoFinal)}</title></head>
    <body style="margin:0;background:#ffffff">
    <div style="background:#ffffff;padding:0 16px 32px;font-family:Arial,Helvetica,sans-serif">
      <div style="max-width:560px;margin:0 auto;color:${COR.GRAFITE}">
        <div style="height:6px;background:${COR.OURO};margin:0 -16px 32px"></div>
        ${logo}
        <h1 style="font-size:22px;line-height:1.3;color:${COR.GRAFITE};margin:0 0 16px">Obrigado pelo seu contacto, ${esc(primeiroNome)}!</h1>
        <p style="margin:0 0 16px;line-height:1.6">${linhaArea}</p>
        <p style="margin:0 0 16px;line-height:1.6">
          A nossa equipa vai analisar o seu pedido e entrar em contacto consigo muito em breve, por telefone ou email, para apresentar as soluções mais adequadas à sua realidade.
        </p>
        <p style="margin:0 0 20px;line-height:1.6">
          Se precisar de falar connosco entretanto, escreva para <a href="mailto:${esc(CONFIG.CONTACTO_PRIVACIDADE)}" style="color:${COR.OURO_ESCURO}">${esc(CONFIG.CONTACTO_PRIVACIDADE)}</a>.
        </p>
        ${blocoMarketing}
        <p style="margin:24px 0 0;line-height:1.6">Com os melhores cumprimentos,<br><strong>Equipa Teoriacuriosa</strong></p>
        <hr style="border:0;border-top:1px solid #e4e4e7;margin:28px 0 12px">
        <p style="font-size:11px;color:#5a5a5f;line-height:1.5;margin:0">
          Recebeu este email porque submeteu o formulário da ${esc(CONFIG.CAMPANHA)}.
          Referência: ${esc(r.id)}. ${esc(CONFIG.RESPONSAVEL_TRATAMENTO)}.
        </p>
      </div>
    </div>
    </body></html>`;

    const texto =
      `Obrigado pelo seu contacto, ${primeiroNome}!\n\n` +
      (area
        ? `Recebemos o seu pedido de informação sobre ${area}, feito através da parceria entre a Teoriacuriosa e o ${CONFIG.PARCERIA}.\n\n`
        : `Recebemos o seu pedido de informação, feito através da parceria entre a Teoriacuriosa e o ${CONFIG.PARCERIA}.\n\n`) +
      `A nossa equipa vai analisar o seu pedido e entrar em contacto consigo muito em breve, ` +
      `por telefone ou email, para apresentar as soluções mais adequadas à sua realidade.\n\n` +
      `Se precisar de falar connosco entretanto, escreva para ${CONFIG.CONTACTO_PRIVACIDADE}.\n\n` +
      (r.marketing
        ? `Confirmamos que aceitou receber comunicações da Teoriacuriosa sobre novas campanhas, serviços e novidades. ` +
          `Para cancelar a subscrição: ${linkCancelar_(r.id)}\n` +
          `Ou escreva para ${CONFIG.CONTACTO_PRIVACIDADE}.\n\n`
        : '') +
      `Com os melhores cumprimentos,\nEquipa Teoriacuriosa`;

    const opts = {
      htmlBody: html,
      name: CONFIG.EMAIL_NOME_REMETENTE,
    };
    if (CONFIG.EMAIL_NO_REPLY) opts.noReply = true;
    else if (CONFIG.EMAIL_REPLY_TO) opts.replyTo = CONFIG.EMAIL_REPLY_TO;   // só define Reply-To se estiver preenchido

    if (CONFIG.EMAIL_FROM) {
      // Envia a partir do email do domínio (tem de existir como alias em "Enviar email como")
      const aliases = GmailApp.getAliases();
      if (aliases.indexOf(CONFIG.EMAIL_FROM) === -1) {
        throw new Error('O endereço ' + CONFIG.EMAIL_FROM +
          ' não está configurado em Gmail > Definições > Contas > Enviar email como. Alias disponíveis: ' +
          aliases.join(', '));
      }
      opts.from = CONFIG.EMAIL_FROM;
      GmailApp.sendEmail(r.email, assuntoFinal, texto, opts);
    } else {
      MailApp.sendEmail(Object.assign({ to: r.email, subject: assuntoFinal, body: texto }, opts));
    }
    return { ok: true };
  } catch (err) {
    console.error('Erro ao enviar email: ' + err);
    return { ok: false, erro: String(err && err.message || err).slice(0, 200) };
  }
}

// ---------------- CANCELAR SUBSCRIÇÃO ----------------
// Cada email com consentimento de marketing leva um link único e assinado (HMAC).
// O link abre uma página com um botão "Confirmar"; só ao clicar é que o Sheet muda para "Não".
// (A confirmação por botão evita que antivírus/leitores de email cancelem sozinhos ao abrir o link.)

function segredo_() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('UNSUB_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('UNSUB_SECRET', s); }
  return s;
}

function tokenCancelar_(id) {
  const sig = Utilities.computeHmacSha256Signature(id, segredo_());
  return sig.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('').slice(0, 32);
}

function idValido_(id) {
  return new RegExp('^' + CONFIG.PREFIXO_ID + '-[0-9A-Z-]{10,40}$').test(String(id || ''));
}

// Com URL_SITE preenchido, o link do email aponta para a página cancelar.html do site (domínio da empresa).
// Os filtros de spam (Outlook/Hotmail em particular) desconfiam de links para script.google.com.
// Sem URL_SITE, usa a página do próprio Apps Script (funciona, mas é mais provável cair no spam).
function linkCancelar_(id) {
  const t = tokenCancelar_(id);
  if (CONFIG.URL_SITE) return CONFIG.URL_SITE + '/cancelar.html?id=' + encodeURIComponent(id) + '&t=' + t;
  const base = CONFIG.URL_WEBAPP || ScriptApp.getService().getUrl();
  return base + '?acao=cancelar&id=' + encodeURIComponent(id) + '&t=' + t;
}

function paginaCancelar_(id, t) {
  const valido = idValido_(id) && /^[0-9a-f]{32}$/.test(String(t || '')) && t === tokenCancelar_(id);
  const estilo = 'body{margin:0;background:#fff;color:' + COR.GRAFITE + ';font-family:Arial,Helvetica,sans-serif;' +
    'display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center}' +
    '.c{max-width:480px;padding:24px;border-top:6px solid ' + COR.OURO + '}h1{font-size:22px}' +
    'button{background:' + COR.GRAFITE + ';color:#fff;border:0;border-radius:8px;padding:14px 26px;font-size:16px;font-weight:bold;cursor:pointer}' +
    'button:disabled{opacity:.6}p{line-height:1.6}';
  let corpo;
  if (!valido) {
    corpo = '<h1>Ligação inválida</h1><p>Esta ligação não é válida ou expirou. Para cancelar a subscrição, escreva para ' +
      escHtml_(CONFIG.CONTACTO_PRIVACIDADE) + '.</p>';
  } else {
    corpo = '<h1>Cancelar subscrição</h1>' +
      '<p id="msg">Deixará de receber comunicações da ' + escHtml_(CONFIG.MARCA) + ' sobre novas campanhas, serviços e novidades.</p>' +
      '<button id="b" onclick="go()">Confirmar cancelamento</button>' +
      '<script>function go(){var b=document.getElementById("b");b.disabled=true;b.textContent="A processar…";' +
      'google.script.run.withSuccessHandler(function(){document.getElementById("msg").textContent=' +
      '"Subscrição cancelada. Não voltará a receber estas comunicações.";b.style.display="none";document.querySelector("h1").textContent="Cancelado";})' +
      '.withFailureHandler(function(){b.disabled=false;b.textContent="Confirmar cancelamento";' +
      'document.getElementById("msg").textContent="Não foi possível cancelar. Tente novamente ou escreva para ' +
      escHtml_(CONFIG.CONTACTO_PRIVACIDADE) + '.";})' +
      '.cancelarSubscricao("' + id + '","' + t + '");}</script>';
  }
  return HtmlService.createHtmlOutput(
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>' + estilo + '</style></head><body><div class="c">' + corpo + '</div></body></html>')
    .setTitle('Cancelar subscrição');
}

// Chamada pelo botão da página (google.script.run). Tem de ser pública (sem "_" no fim).
function cancelarSubscricao(id, t) {
  if (!idValido_(id) || t !== tokenCancelar_(id)) throw new Error('Ligação inválida');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = abrirSheet_();
    const ultima = sh.getLastRow();
    if (ultima < 2) throw new Error('Registo não encontrado');
    const ids = sh.getRange(2, coluna_(sh, 'ID'), ultima - 1, 1).getValues();
    let linha = -1;
    for (let i = 0; i < ids.length; i++) { if (ids[i][0] === id) { linha = i + 2; break; } }
    if (linha < 0) throw new Error('Registo não encontrado');

    const colMkt = coluna_(sh, 'Aceita novas campanhas');
    const colCanc = coluna_(sh, 'Cancelou novas campanhas em');
    if (sh.getRange(linha, colMkt).getValue() === 'Sim') {
      sh.getRange(linha, colMkt).setValue('Não');
      sh.getRange(linha, colCanc).setValue(
        Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss'));
    }
  } finally {
    lock.releaseLock();
  }
  try { atualizarExcel_(); } catch (err) { console.error('Excel: ' + err); }
  return 'ok';
}

// ---------------- UTILITÁRIOS ----------------
function escHtml_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------- FERRAMENTAS DE TESTE E DIAGNÓSTICO (correr no editor) ----------------

// Mostra o Sheet e as pastas que o script está realmente a usar (útil se o setup correu mais de uma vez).
function mostrarLinks() {
  const p = PropertiesService.getScriptProperties();
  Logger.log('Conta que corre o script: ' + Session.getEffectiveUser().getEmail());
  Logger.log('Sheet: ' + SpreadsheetApp.openById(p.getProperty('SHEET_ID')).getUrl());
  Logger.log('Pasta principal: ' + DriveApp.getFolderById(p.getProperty('FOLDER_ID')).getUrl());
  Logger.log('Pasta dos PDFs: ' + DriveApp.getFolderById(p.getProperty('PDF_FOLDER_ID')).getUrl());
}

// Simula uma resposta completa do formulário, para a conta que corre o script (cria linha, PDF e envia o email).
// Corra no editor e veja o registo de execução.
function testarSubmissao() {
  const res = doPost({ postData: { contents: JSON.stringify({
    pedidoId: Utilities.getUuid(),
    nome: 'Teste Silva',
    contacto: '+351 912 345 678',
    email: Session.getEffectiveUser().getEmail(),
    area: CONFIG.AREAS[0],
    privacidade: true, marketing: true, consentVersion: CONFIG.CONSENT_VERSION,
    ip: '0.0.0.0', pagina: 'editor', userAgent: 'Teste manual',
    origemFonte: 'empresa-teste', origemMeio: 'manual', origemCampanha: 'grupo-teste', origemConteudo: '',
  }) } });
  Logger.log(res.getContent());
}

// Envia o email de agradecimento COMPLETO (o mesmo do site) para a conta que corre o script, sem passar pelo formulário.
// Mude COM_MARKETING para true/false para ver as duas versões.
function testarEmailCompleto() {
  const DESTINO = Session.getEffectiveUser().getEmail();
  const COM_MARKETING = true;
  const r = { id: CONFIG.PREFIXO_ID + '-TESTE-0000-0000', nome: 'Teste Silva', primeiroNome: 'Teste',
              area: CONFIG.AREAS[0], email: DESTINO, marketing: COM_MARKETING };
  Logger.log('Quota restante hoje: ' + MailApp.getRemainingDailyQuota());
  Logger.log('Resultado: ' + JSON.stringify(enviarEmail_(r)));
}

// Teste de entrega: envia o email COMPLETO (igual ao do site) para cada endereço de DESTINOS, para ver em que pasta
// chega (caixa de entrada, spam/lixo). Use endereços reais de vários fornecedores (Gmail, Hotmail, Outlook, ...).
// Depois, no Gmail, "Mostrar original" no email recebido deve indicar SPF: PASS, DKIM: PASS e DMARC: PASS.
// Não precisa de nova implementação: corre direto no editor.
function testarEntrega() {
  const DESTINOS = [
    // 'exemplo@hotmail.com',
    // 'exemplo@outlook.com',
    // 'exemplo@gmail.com',
  ];
  if (!DESTINOS.length) { Logger.log('Preencha a lista DESTINOS com os emails de teste e volte a correr.'); return; }
  Logger.log('Conta que envia: ' + Session.getEffectiveUser().getEmail() + ' | EMAIL_FROM: ' + (CONFIG.EMAIL_FROM || '(vazio)'));
  DESTINOS.forEach((destino, i) => {
    const r = { id: CONFIG.PREFIXO_ID + '-TESTE-0000-000' + i, nome: 'Teste Silva', primeiroNome: 'Teste',
                area: CONFIG.AREAS[0], email: destino, marketing: true };
    Logger.log(destino + ' → ' + JSON.stringify(enviarEmail_(r, '[Teste ' + (i + 1) + '] ' + CONFIG.EMAIL_ASSUNTO)));
  });
  Logger.log('Quota restante hoje: ' + MailApp.getRemainingDailyQuota() + '. Espere 1 a 2 minutos e veja a caixa de entrada e o spam de cada destino.');
}

// Mostra: o que ficou escrito em "Email enviado" nas últimas 5 respostas, a quota de emails que sobra hoje,
// se a mensagem aparece em "Enviados" e se algum servidor devolveu o email. Não envia nada.
function diagnosticoEmail() {
  Logger.log('Conta que envia: ' + Session.getEffectiveUser().getEmail());
  Logger.log('Quota de emails restante hoje: ' + MailApp.getRemainingDailyQuota());
  Logger.log('EMAIL_FROM: ' + (CONFIG.EMAIL_FROM || '(vazio: sai da conta acima)'));

  const sh = abrirSheet_();
  const ultima = sh.getLastRow();
  if (ultima >= 2) {
    const cId = coluna_(sh, 'ID'), cMail = coluna_(sh, 'Email'), cEnv = coluna_(sh, 'Email enviado');
    for (let i = Math.max(2, ultima - 4); i <= ultima; i++) {
      Logger.log('Linha ' + i + ': ' + sh.getRange(i, cId).getValue() + ' | ' + sh.getRange(i, cMail).getValue() +
                 ' | Email enviado = ' + sh.getRange(i, cEnv).getValue());
    }
  }

  const enviados = GmailApp.search('in:sent subject:"' + CONFIG.EMAIL_ASSUNTO + '" newer_than:3d', 0, 5);
  Logger.log('Na pasta Enviados (últimos 3 dias): ' + enviados.length + ' conversa(s)');
  enviados.forEach(t => Logger.log('  - para ' + t.getMessages()[0].getTo() + ' em ' + t.getLastMessageDate()));

  const devolvidos = GmailApp.search('(from:mailer-daemon OR from:postmaster) newer_than:3d', 0, 5);
  Logger.log('Mensagens de devolução (últimos 3 dias): ' + devolvidos.length);
  devolvidos.forEach(t => Logger.log('  - ' + t.getFirstMessageSubject() + ' :: ' +
    t.getMessages()[0].getPlainBody().replace(/\s+/g, ' ').slice(0, 300)));
}

// Mostra, sem criar nada, como a origem (UTM) é limpa. Corra no editor e veja o registo de execução.
function testarLerOrigem() {
  [
    { origemFonte: 'empresa-x', origemMeio: 'email', origemCampanha: 'grupo-ccr', origemConteudo: '' },
    { origemFonte: 'direto' },
    { origemFonte: '=HYPERLINK("x")', origemMeio: 'E-mail Interno', origemCampanha: 'Protocolo CCR!' },
  ].forEach(d => Logger.log(JSON.stringify(lerOrigem_(d))));
}
