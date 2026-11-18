/* =========================================================
   Parceria Teoriacuriosa | Grupo CCR
   Envio do formulário para o Google Apps Script (backend/Code.gs). Configuração em config.js
   ========================================================= */

// URL do Apps Script e versão dos consentimentos: ver config.js
const APPS_SCRIPT_URL = window.CCR_CONFIG.APPS_SCRIPT_URL;
const CONSENT_VERSION = window.CCR_CONFIG.CONSENT_VERSION;

const form      = document.getElementById('ccr-form');
const btn       = document.getElementById('submit-btn');
const statusEl  = document.getElementById('form-status');
const formWrap  = document.getElementById('form-wrap');
const successEl = document.getElementById('success');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9\s().-]{9,20}$/;

// Identificador deste preenchimento. O servidor ignora repetições (duplo clique, nova tentativa).
const PEDIDO_ID = (window.crypto && crypto.randomUUID)
  ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });

// Busca o IP público do utilizador (melhor esforço — se falhar, envia vazio)
async function getPublicIP() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch('https://api.ipify.org?format=json', { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return '';
    const j = await r.json();
    return j.ip || '';
  } catch (_) {
    return '';
  }
}

// ---------------------------------------------------------
// Origem do contacto (UTM / referrer)
// Cada empresa recebe o seu link (ver ferramentas/gerador-utm.html):
//   ?utm_source=<empresa>&utm_medium=<canal>&utm_campaign=<identificador-do-grupo>&utm_content=<opcional>
// O servidor grava os quatro valores em colunas próprias do Sheet.
// ---------------------------------------------------------
const ORIGEM_KEY = 'ccr_origem';

// Só letras, números, ponto, hífen e underscore: nada que parta o Sheet
// ou que seja interpretado como fórmula, mesmo que alguém forje o link.
function limparOrigem(v) {
  return String(v || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

// Sites que costumam aparecer como referrer → nome curto
const REFERRERS = [
  [/^mail\.google\.com$/, 'gmail'],
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, 'facebook'],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, 'whatsapp'],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, 'x'],
  [/(^|\.)(linkedin\.com|lnkd\.in)$/, 'linkedin'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
  [/(^|\.)google\./, 'google'],
  [/(^|\.)bing\.com$/, 'bing'],
];

// 1.ª escolha: parâmetros do link
function origemDeUtm() {
  const q = new URLSearchParams(location.search);
  const fonte = limparOrigem(q.get('utm_source') || q.get('empresa') || q.get('ref'));
  if (!fonte) return null;
  return {
    fonte,
    meio: limparOrigem(q.get('utm_medium')),
    campanha: limparOrigem(q.get('utm_campaign')),
    conteudo: limparOrigem(q.get('utm_content')),
  };
}

// 2.ª escolha: o site de onde a pessoa veio (ignora o próprio site)
function origemDeReferrer() {
  let host = '';
  try { host = new URL(document.referrer).hostname.replace(/^www\./, ''); } catch (_) { return null; }
  if (!host || host === location.hostname.replace(/^www\./, '')) return null;
  const conhecido = REFERRERS.find(([re]) => re.test(host));
  return { fonte: conhecido ? conhecido[1] : limparOrigem(host), meio: 'referral', campanha: '', conteudo: '' };
}

// A origem fica guardada nesta visita (separador), para não se perder se a pessoa
// for ler a Política de Privacidade e voltar ao formulário.
function lerSessao() {
  try {
    const o = JSON.parse(sessionStorage.getItem(ORIGEM_KEY) || 'null');
    if (!o || typeof o !== 'object' || !o.fonte) return null;
    return {
      fonte: limparOrigem(o.fonte), meio: limparOrigem(o.meio),
      campanha: limparOrigem(o.campanha), conteudo: limparOrigem(o.conteudo),
    };
  } catch (_) { return null; }
}
function guardarSessao(o) {
  try { sessionStorage.setItem(ORIGEM_KEY, JSON.stringify(o)); } catch (_) { /* sem armazenamento: segue sem guardar */ }
}

// Prioridade: link com UTM > origem já guardada nesta visita > referrer > direto
function detetarOrigem() {
  const utm = origemDeUtm();
  if (utm) { guardarSessao(utm); return utm; }
  const guardada = lerSessao();
  if (guardada) return guardada;
  const o = origemDeReferrer() || { fonte: 'direto', meio: '', campanha: '', conteudo: '' };
  guardarSessao(o);
  return o;
}

// Calculada logo ao abrir a página
const ORIGEM = detetarOrigem();

// ---------------------------------------------------------
// Validação
// ---------------------------------------------------------
function setError(name, msg) {
  const p = form.querySelector(`.erro[data-for="${name}"]`);
  const campo = form.querySelector(`[name="${name}"]`)?.closest('.campo');
  const el = form.elements[name];
  if (p) p.textContent = msg || '';
  if (campo) campo.classList.toggle('has-error', !!msg);
  if (el) el.setAttribute('aria-invalid', msg ? 'true' : 'false');
}

function validate() {
  const f = form.elements;
  const erros = {};

  if (!f.nome.value.trim()) erros.nome = 'Indique o seu nome.';

  const tel = f.contacto.value.trim();
  if (!tel) erros.contacto = 'Indique o seu número de telefone.';
  else if (!PHONE_RE.test(tel)) erros.contacto = 'Introduza um número válido (ex.: +351 912 345 678).';

  const mail = f.email.value.trim();
  if (!mail) erros.email = 'Indique o seu email.';
  else if (!EMAIL_RE.test(mail)) erros.email = 'Introduza um email válido.';

  if (!f.area.value) erros.area = 'Escolha uma área de negócio.';

  if (!f.privacidade.checked) erros.privacidade = 'Para continuar, aceite a Política de Privacidade.';

  let primeiro = null;
  ['nome', 'contacto', 'email', 'area', 'privacidade'].forEach((name) => {
    setError(name, erros[name] || '');
    if (erros[name] && !primeiro) primeiro = f[name];
  });

  if (primeiro) primeiro.focus();
  return !primeiro;
}

// Limpa o erro de um campo assim que o utilizador corrige
form.addEventListener('input', (e) => { if (e.target.name) setError(e.target.name, ''); });
form.addEventListener('change', (e) => { if (e.target.name) setError(e.target.name, ''); });

// ---------------------------------------------------------
// Envio
// ---------------------------------------------------------
function mostrarErro(msg) {
  statusEl.textContent = msg;
  statusEl.classList.add('is-error');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusEl.textContent = '';
  statusEl.classList.remove('is-error');

  // Honeypot preenchido → robô. Finge sucesso e não envia nada.
  if (form.elements.website.value) {
    formWrap.hidden = true; successEl.hidden = false;
    return;
  }

  if (!validate()) return;

  // Aviso claro se o endereço do Apps Script ainda não foi configurado
  if (!/^https:\/\/script\.google\.com\/(?:a\/macros\/[^/]+|macros)\/s\/[^/]+\/exec$/.test(APPS_SCRIPT_URL)) {
    mostrarErro('Configuração em falta: o endereço do Apps Script (APPS_SCRIPT_URL) não está correto no config.js.');
    console.error('APPS_SCRIPT_URL inválido:', APPS_SCRIPT_URL);
    return;
  }

  btn.disabled = true;
  btn.querySelector('.btn__label').textContent = 'A enviar…';

  const f = form.elements;
  const payload = {
    pedidoId:    PEDIDO_ID,
    nome:        f.nome.value.trim(),
    contacto:    f.contacto.value.trim(),
    email:       f.email.value.trim().toLowerCase(),
    area:        f.area.value,
    privacidade: f.privacidade.checked,
    marketing:   f.marketing.checked,
    consentVersion: CONSENT_VERSION,   // o texto oficial de cada versão está no Code.gs
    ip:          await getPublicIP(),
    userAgent:   navigator.userAgent,
    origemFonte:    ORIGEM.fonte,
    origemMeio:     ORIGEM.meio,
    origemCampanha: ORIGEM.campanha,
    origemConteudo: ORIGEM.conteudo,
    pagina:      location.href,
    timestampCliente: new Date().toISOString(),
  };

  try {
    // text/plain evita o preflight CORS — o Apps Script lê o JSON do body na mesma
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch (_) { throw new Error('Resposta inesperada do Apps Script (verifique se o acesso está em "Qualquer pessoa"): ' + text.slice(0, 120)); }
    if (!data.ok) throw new Error(data.error || 'Erro desconhecido');
    // Só há sucesso se o servidor devolver o ID do registo (o doGet de teste não devolve)
    if (!data.id) throw new Error('Resposta sem ID de registo: o pedido não foi processado pelo doPost. Resposta: ' + text.slice(0, 120));

    document.getElementById('success-email').textContent = payload.email;
    formWrap.hidden = true;
    successEl.hidden = false;
    successEl.focus();
    successEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (err) {
    console.error(err);
    mostrarErro('Não foi possível enviar o pedido. Verifique a ligação e tente novamente.');
    btn.disabled = false;
    btn.querySelector('.btn__label').textContent = 'Enviar pedido';
  }
});
