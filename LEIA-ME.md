# Landing page Parceria Teoriacuriosa | Grupo CCR

## O que está aqui

| Pasta | Para quê | Vai para o repositório? |
|---|---|---|
| raiz (`index.html`, `cancelar.html`, `privacidade.html`, `styles.css`, `script.js`, `config.js`, `assets/`) | A página, a política de privacidade e os assets (logos, ícones, fonte Montserrat) | **Sim**: é só isto que o GitHub Pages publica |
| `backend/` | `Code.gs` e `appsscript.json` do Google Apps Script (Sheet, PDF de consentimento, Excel, emails) | **Não**: fica na conta Google (está no `.gitignore`) |
| `ferramentas/` | `gerador-utm.html`: gera os links por empresa (ou plataforma) e canal, para grupos de empresas e para campanhas | **Não**: uso interno, abre-se no browser (está no `.gitignore`) |

**Atenção:** o GitHub Pages publica tudo o que estiver no repositório, e qualquer pessoa consegue abrir esses ficheiros (por exemplo `/backend/Code.gs`). Por isso o `.gitignore` deixa de fora `backend/`, `ferramentas/`, `Claude outputs/`, `Info.txt`, `LEIA-ME.md` e os originais dos ícones. Se um destes ficheiros já tiver sido enviado, é preciso retirá-lo com `git rm -r --cached <caminho>`, fazer commit e push.

## 1. Backend (Google Apps Script)

1. Com a conta Google que vai guardar o Sheet e os consentimentos, abrir <https://script.google.com> e criar um **projeto novo** (autónomo, não ligado a nenhum Sheet). Assim, quem tiver acesso ao Drive não vê o script.
2. Colar o conteúdo de `Code.gs`. Em *Definições do projeto*, ativar "Mostrar o ficheiro de manifesto appsscript.json" e colar o conteúdo de `appsscript.json` (ativa o serviço avançado Drive API e o fuso horário de Lisboa).
3. Escolher a função `setup` e carregar em **Executar** (aceitar as autorizações). Cria a pasta, o Sheet e a subpasta dos comprovativos. `mostrarLinks` mostra onde ficaram.
4. Correr `testarSubmissao`: cria uma linha de teste no Sheet, um PDF e envia o email de agradecimento para a própria conta. Apagar a linha de teste depois.
5. **Implementar > Nova implementação > Aplicação Web**: executar como *Eu*, acesso *Qualquer pessoa*. Copiar o URL que termina em `/exec`.
6. Colar esse URL em `APPS_SCRIPT_URL` no `config.js`.
7. Depois de publicar a página, preencher `URL_SITE` no `Code.gs` (ex.: `https://protocolo.teoriacuriosa.pt`, sem barra no fim) e voltar a implementar (*Gerir implementações > editar > Nova versão*; o URL não muda). **É importante:** com `URL_SITE` preenchido, o email mostra o logo e o link "Cancelar subscrição" aponta para o domínio da empresa (`cancelar.html`) em vez de `script.google.com`, o que reduz o risco de cair no spam.

**Se o Sheet já tinha sido criado com uma versão anterior do `Code.gs`** (colunas Origem (empresa), Meio e Campanha), correr uma vez a função `atualizarCabecalhos`: renomeia essas colunas para os nomes de `CONFIG.COLUNAS` (por defeito Empresa, Canal e Grupo) e põe as colunas pela ordem nova, sem alterar dados. Num Sheet criado agora pelo `setup` não é preciso.

Sempre que alterar o `Code.gs`, é preciso criar uma **nova versão** da implementação. Abrir o endereço `/exec` no browser mostra a versão em uso.

## 2. Publicar a página (GitHub Pages)

1. Novo repositório; colocar na raiz só a página (`index.html`, `cancelar.html`, `styles.css`, `config.js`, `script.js`, `privacidade.html`, `assets/`) e o `.gitignore`. Nada de `backend/`, `ferramentas/` nem notas internas.
2. *Settings > Pages*: branch `main`, pasta `/ (root)`.
3. Subdomínio: criar o ficheiro `CNAME` no repositório com o subdomínio escolhido e, no dominios.pt, um registo CNAME desse subdomínio para `<utilizador>.github.io`. Ativar *Enforce HTTPS*.

## 3. Saber de onde veio cada contacto (gerador de links)

Abrir `ferramentas/gerador-utm.html` no browser. A ferramenta trabalha com **grupos ou campanhas**, cada um com o seu endereço de página, e tem dois tipos:

| Tipo | Para quê | Lista principal | Canais | Colunas no Sheet |
|---|---|---|---|---|
| **Parceria com empresas** | Páginas como a do Grupo CCR | Empresas (uma por linha) | Email, WhatsApp, Intranet, QR code, Newsletter | Grupo, Empresa, Canal |
| **Campanha em redes e canais** | Páginas de campanha, como a Black Friday da travel | Plataformas (Instagram, Facebook, LinkedIn, TikTok, YouTube, Google, WhatsApp, Email), com botões para as acrescentar | Link na bio, Story, Publicação, Reel, Anúncio pago, Mensagem, QR code, Newsletter | Campanha, Plataforma, Formato |

Para cada grupo ou campanha guarda-se:
- o **endereço da página**;
- o **identificador**, que aparece no Sheet na primeira coluna de origem (Grupo ou Campanha). É sugerido a partir do nome ("Grupo CCR" dá `grupo-ccr`, "Black Friday Travel" dá `black-friday-travel`) e pode ser editado. O nome, na caixa de cima, serve só para escolher na ferramenta e não vai para o link nem para o Sheet;
- a **lista** (empresas ou plataformas), os **canais** (os pré-definidos mais os que escrever em "Outros", separados por vírgula) e, se quiser, o **conteúdo/criativo** (ex.: `convite-1`, `video-1`).

Como usar:
1. Escolher o grupo ou campanha (ou **Novo grupo ou campanha**, com nome e tipo), preencher os campos.
2. Carregar em **Gerar links**: sai um link por cada combinação de empresa/plataforma com canal/formato. Os que não fizerem sentido (por exemplo Instagram com Newsletter) tiram-se com **Retirar**. Cada linha tem **Copiar**; há também **Copiar tudo (para Excel)** e **Descarregar CSV**, que só levam as linhas que ficaram.
3. Quando alguém preenche o formulário por esse link, o Sheet mostra, antes dos dados do formulário, o identificador e a empresa (ou plataforma) e, depois, o canal (ou formato) e o conteúdo. Quem abre a página sem estes parâmetros fica com a empresa/plataforma `direto` (ou o site de onde veio) e o grupo vazio.

Nas campanhas, **"Anúncio pago"** é um formato à parte de "Publicação", por isso os contactos vindos de anúncios ficam separados dos orgânicos no Sheet.

Notas:
- Os valores do Sheet aparecem já tratados (minúsculas, sem acentos, com hífens): a empresa "DS Crédito Imobiliário" fica `ds-credito-imobiliario`. A ferramenta mostra, em cada linha, o valor exato que vai aparecer.
- Depois de enviar links, evite mudar o identificador: os contactos novos passariam a aparecer com outro nome.
- Cada valor tem no máximo 30 caracteres, em letras minúsculas, números, ponto, hífen e sublinhado. Nomes mais compridos são cortados e a ferramenta avisa; dois nomes que dêem o mesmo valor também são sinalizados.
- Tudo fica guardado **neste browser** (neste computador). Para levar para outro computador, ou como segurança, usar **Guardar cópia** (ficheiro `grupos-utm.json`) e **Abrir cópia** no outro lado. Ao abrir uma cópia, os que têm o mesmo nome são atualizados e os restantes são acrescentados.
- **Apagar** pede confirmação (segundo clique em 4 segundos) e só fica disponível havendo mais do que um grupo ou campanha.
- Os nomes das colunas do Sheet vêm de `CONFIG.COLUNAS` no `Code.gs`: por defeito Grupo / Empresa / Canal; numa página de campanha em redes, trocar por `Campanha` / `Plataforma` / `Formato` antes de correr o `setup` (ver ponto 5).

## 4. Consentimentos

- Cada resposta cria um PDF (data/hora, email, IP, navegador, texto exato aceite, versão e hash SHA-256) na pasta dos comprovativos e uma linha no Sheet com "Aceita novas campanhas" Sim/Não.
- O email de agradecimento leva o link "Cancelar subscrição" quando a pessoa aceitou novas campanhas; ao confirmar, o Sheet passa a "Não" e regista a data.
- **Se alterar o texto de uma caixa de consentimento**: mudar o texto no `index.html`, criar uma nova versão em `CONSENT_TEXTS` no `Code.gs` (manter as antigas) e atualizar `CONSENT_VERSION` no `Code.gs` e no `config.js`.

## 5. Replicar para outro cliente ou grupo

Cada grupo com página e textos próprios fica com uma cópia: novo repositório com a cópia da página e novo projeto Apps Script com a cópia de `Code.gs` (novo Sheet e nova pasta no `setup`). Assim, o Sheet, os PDFs de consentimento e o email ficam separados por cliente.

No `Code.gs`, tudo o que é específico do cliente está no bloco `CONFIG` do início: `CAMPANHA`, `PARCERIA` (nome que aparece na frase do email, ex.: "Grupo Atlântico"), `MARCA`, `PREFIXO_ID`, `AREAS`, `COLUNAS` (nomes das três colunas de origem: Grupo/Empresa/Canal ou, numa campanha em redes, Campanha/Plataforma/Formato), nomes da pasta, do Sheet e do Excel, texto do email, `RESPONSAVEL_TRATAMENTO` e `CONSENT_VERSION` (com o texto novo em `CONSENT_TEXTS`). Não é preciso mexer no resto do código.

Na página: textos e logo no `index.html`; opções da área de negócio (no `index.html` e em `CONFIG.AREAS`); `config.js` (URL da web app e versão do consentimento); a política de privacidade.

Dentro do mesmo cliente, as várias empresas do grupo **não** precisam de nada disto: usam a mesma página e o mesmo Sheet, e a empresa vem no link gerado pela ferramenta do ponto 3.

## 6. Emails a cair no spam (Gmail, Hotmail, Outlook)

Nenhum código garante a entrega: depende do domínio e da reputação de quem envia. **No código** já está feito: o link de cancelar vai para o domínio da empresa (preencher `URL_SITE`), o email leva versão HTML e texto, tem assunto simples, um só logo e nenhum anexo, e a página avisa a pessoa para ver o spam. **Fora do código**, é preciso confirmar:

1. O email sai de uma conta do domínio teoriacuriosa.pt (Google Workspace), não de um `@gmail.com`.
2. **SPF**: um único registo TXT no domínio com `include:_spf.google.com` (ex.: `v=spf1 include:_spf.google.com ~all`). Se já existir um SPF, acrescentar o `include` nesse, nunca criar um segundo.
3. **DKIM**: na consola de administração do Google Workspace (Aplicações > Google Workspace > Gmail > Autenticar email), gerar a chave, criar o registo TXT `google._domainkey` no dominios.pt e iniciar a autenticação.
4. **DMARC**: registo TXT em `_dmarc` (ex.: `v=DMARC1; p=none; rua=mailto:<email para relatórios>`). Começar com `p=none`.
5. **Teste**: preencher a lista `DESTINOS` da função `testarEntrega` com um Hotmail, um Outlook e um Gmail e correr. No Gmail, "Mostrar original" deve indicar SPF, DKIM e DMARC em **PASS**. Opcional: <https://www.mail-tester.com>.
6. **Primeiros envios**: se cair no lixo no Hotmail/Outlook, marcar "Não é lixo" e adicionar o remetente aos contactos ajuda a construir reputação. Evitar muitos emails de teste iguais seguidos.
7. Se usar `EMAIL_FROM` (um alias), tem de estar configurado em Gmail > Definições > Contas > Enviar email como.

## Pontos a confirmar

- A caixa opcional de marketing cobre **email e contacto telefónico** (o pedido era "contacto para futuras publicidades"). Se só for email, ajustar o texto no `index.html`, no `Code.gs` (nova versão) e na política.
- O texto do email de agradecimento é proposto por nós; rever.
- O texto da política de privacidade foi adaptado da versão da travel; convém ser revisto por quem trata do RGPD.
