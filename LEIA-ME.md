# Landing page Parceria Teoriacuriosa | Grupo CCR

## O que está aqui

| Pasta | Para quê | Vai para o repositório? |
|---|---|---|
| `site/` | A página (index, estilos, script), a política de privacidade e os assets (logos, fonte Montserrat) | **Sim**: só o conteúdo desta pasta |
| `backend/` | `Code.gs` e `appsscript.json` do Google Apps Script (Sheet, PDF de consentimento, Excel, emails) | **Não**: fica na conta Google |
| `ferramentas/` | `gerador-utm.html`: gera um link por empresa e canal | **Não**: uso interno, abre-se no browser |

## 1. Backend (Google Apps Script)

1. Com a conta Google que vai guardar o Sheet e os consentimentos, abrir <https://script.google.com> e criar um **projeto novo** (autónomo, não ligado a nenhum Sheet). Assim, quem tiver acesso ao Drive não vê o script.
2. Colar o conteúdo de `Code.gs`. Em *Definições do projeto*, ativar "Mostrar o ficheiro de manifesto appsscript.json" e colar o conteúdo de `appsscript.json` (ativa o serviço avançado Drive API e o fuso horário de Lisboa).
3. Escolher a função `setup` e carregar em **Executar** (aceitar as autorizações). Cria a pasta, o Sheet e a subpasta dos comprovativos. `mostrarLinks` mostra onde ficaram.
4. Correr `testarSubmissao`: cria uma linha de teste no Sheet, um PDF e envia o email de agradecimento para a própria conta. Apagar a linha de teste depois.
5. **Implementar > Nova implementação > Aplicação Web**: executar como *Eu*, acesso *Qualquer pessoa*. Copiar o URL que termina em `/exec`.
6. Colar esse URL em `APPS_SCRIPT_URL` no `site/script.js`.
7. Depois de publicar a página, preencher `URL_SITE` no `Code.gs` (ex.: `https://protocolo.teoriacuriosa.pt`, sem barra no fim) para o email mostrar o logo, e voltar a implementar (*Gerir implementações > editar > Nova versão*; o URL não muda).

Sempre que alterar o `Code.gs`, é preciso criar uma **nova versão** da implementação. Abrir o endereço `/exec` no browser mostra a versão em uso.

## 2. Publicar a página (GitHub Pages)

1. Novo repositório; colocar na raiz o conteúdo de `site/` (`index.html`, `styles.css`, `script.js`, `privacidade.html`, `assets/`).
2. *Settings > Pages*: branch `main`, pasta `/ (root)`.
3. Subdomínio: criar o ficheiro `CNAME` no repositório com o subdomínio escolhido e, no dominios.pt, um registo CNAME desse subdomínio para `<utilizador>.github.io`. Ativar *Enforce HTTPS*.

## 3. Saber de que empresa veio cada contacto

Abrir `ferramentas/gerador-utm.html` no browser, indicar o endereço da página, as empresas (uma por linha) e os canais, e carregar em **Gerar links**. Cada empresa recebe o seu link. No Sheet, a coluna **Origem (empresa)** mostra a empresa; **Meio** o canal; **Campanha** e **Conteúdo** o resto. Quem abre a página sem link de empresa fica como `direto` (ou o site de onde veio).

## 4. Consentimentos

- Cada resposta cria um PDF (data/hora, email, IP, navegador, texto exato aceite, versão e hash SHA-256) na pasta dos comprovativos e uma linha no Sheet com "Aceita novas campanhas" Sim/Não.
- O email de agradecimento leva o link "Cancelar subscrição" quando a pessoa aceitou novas campanhas; ao confirmar, o Sheet passa a "Não" e regista a data.
- **Se alterar o texto de uma caixa de consentimento**: mudar o texto no `index.html`, criar uma nova versão em `CONSENT_TEXTS` no `Code.gs` (manter as antigas) e atualizar `CONSENT_VERSION` no `Code.gs` e no `script.js`.

## 5. Replicar para outro cliente

Novo repositório com a cópia de `site/`, novo projeto Apps Script com a cópia de `Code.gs` (novo Sheet e nova pasta no `setup`). Mudar: textos e logo no `index.html`; opções da área de negócio (no `index.html` e em `CONFIG.AREAS`); `CAMPANHA`, `MARCA`, `PREFIXO_ID`, nomes de pasta/Sheet e texto do email em `CONFIG`; textos dos consentimentos e versão; a política de privacidade.

## Pontos a confirmar

- **Morada da sede**: a política de privacidade da travel dizia "Rua do Rio Novo 345 O" e o `Code.gs` da travel "395 O". Usei **345** em todo o lado; confirmar.
- A caixa opcional de marketing cobre **email e contacto telefónico** (o pedido era "contacto para futuras publicidades"). Se só for email, ajustar o texto no `index.html`, no `Code.gs` (nova versão) e na política.
- O texto do email de agradecimento é proposto por nós; rever.
- O texto da política de privacidade foi adaptado da versão da travel; convém ser revisto por quem trata do RGPD.
