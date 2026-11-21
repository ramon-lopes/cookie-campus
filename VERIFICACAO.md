# Verificação da atualização de reservas — 19/11/2026

## Como vendas, caixa e estoque se relacionam

A base é a PWA estática em HTML, CSS e JavaScript, servida localmente por `npm start` e publicada pelo GitHub Pages a partir de `dist/`. O estado operacional persiste na chave `state` do object store `app` do IndexedDB `cookies-campus`, por origem e navegador. A mesma transação valida e grava reserva, venda, recebimento e reflexos no estoque. O Service Worker guarda os arquivos da aplicação para uso offline.

Em `src/domain.js`, `financial().gross` soma o total dos itens das vendas cuja sessão corresponde ao filtro e que estão sem `voidedAt`. O resumo geral abrange todas as sessões salvas. Cada cartão de dia abrange uma sessão e usa `sale.dayId`, inclusive quando houve duas aberturas na mesma data. Uma venda estornada sai por inteiro desse total, com ou sem pagamento ou reembolso. O estorno só pode ocorrer na sessão aberta da venda. A devolução financeira pode ocorrer em outra sessão. O total geral é distinto dos demais indicadores e permanece como **Vendas líquidas de estornos**. A repetição dentro de cada dia foi retirada, com o valor mantido no cabeçalho da sessão e as transações preservadas em **Vendas**.

| Exemplo fictício | Vendas líquidas de estornos | Vendas estornadas | A receber | A reembolsar | Caixa líquido |
| --- | ---: | ---: | ---: | ---: | ---: |
| Dia 1 · venda de R$ 12,00 pendente e venda de R$ 24,00 via Pix | R$ 36,00 | R$ 0,00 | R$ 12,00 | R$ 0,00 | R$ 24,00 |
| Dia 1 · estorno dos R$ 24,00, antes de devolver | R$ 12,00 | R$ 24,00 | R$ 12,00 | R$ 24,00 | R$ 24,00 |
| Dia 2 · devolução dos R$ 24,00 via Pix | R$ 0,00 | R$ 0,00 | R$ 0,00 | R$ 0,00 | −R$ 24,00 |
| Geral após a devolução | R$ 12,00 | R$ 24,00 | R$ 12,00 | R$ 0,00 | R$ 0,00 |

O caixa agrupa entradas e saídas pelo dia operacional do lançamento e pelo meio usado. Após a devolução, o dia 1 mantém sua entrada de R$ 24,00 e o indicador de reembolso pendente zera. Os estornos legados sem registro separado de reembolso mantêm a devolução presumida no caixa do dia da venda. O Histórico identifica essa situação.

| Fluxo validado com uma reserva fictícia de R$ 36,00 | Reserva e estoque | Vendas e caixa |
| --- | --- | --- |
| Pagamento e retirada no mesmo dia | Separa 2 Nutella e 1 Oreo com Nutella ao reservar. Converte a reserva em venda na retirada. | Entrada de R$ 36,00 ao receber; uma venda de R$ 36,00 na retirada. |
| Pagamento no dia 1 e retirada no dia 2 | Permite fechar o dia 1. Os 3 cookies separados ficam fora das sobras e são usados na retirada. | Caixa de R$ 36,00 no dia 1; venda de R$ 36,00 e entrada de R$ 0,00 no dia 2. |
| Pagamento ao buscar | Conclui a reserva e confirma a forma na mesma operação. | Uma venda e uma entrada de R$ 36,00 no caixa aberto. A opção **Pendente** continua disponível. |
| Cancelamento depois de pagar | Cancela a reserva e libera somente os 3 cookies. Se ocorrer no dia 2, eles voltam ao estoque disponível desse dia. | A entrada de R$ 36,00 é preservada. O Histórico mostra o reembolso pendente até registrar a devolução. |

## Revisão defensiva do serviço publicado

| Controle | Resultado e evidência | Configuração no provedor |
| --- | --- | --- |
| HTTPS | **Confirmado para conexão e redirecionamento.** Requisições públicas retornaram `200` em HTTPS com HSTS e `301` em HTTP para o mesmo caminho HTTPS. O cliente validou o nome do host e o certificado apresentado pelo proxy do ambiente. A cadeia e a validade do certificado de origem foram **não verificáveis** diretamente porque o ambiente bloqueou a conexão direta. O frontend é estático e a aplicação não tem API. | Em **Settings → Pages**, **Enforce HTTPS** consta ativo. O site usa o domínio padrão `ramon-lopes.github.io`, sem **Custom domain**. Com acesso direto à internet, abra a URL HTTPS no Safari e consulte os detalhes da conexão e do certificado para verificar emissor, domínio e validade de origem. |
| Backup automático | **Ausente.** O IndexedDB fica no dispositivo. É possível exportar JSON manualmente e a restauração guarda uma cópia local anterior na mesma transação. Não há agenda, frequência ou retenção gerenciada. A restauração de backups fictícios legados e atuais foi verificada em ambientes isolados. | O GitHub Pages hospeda os arquivos estáticos. O painel **Settings → Pages** não contém os registros operacionais. As exportações e cópias locais seguem o procedimento em **Configurações → Backup**. |
| Senhas com hash | **Confirmado para o bloqueio local.** `src/access.js` usa Web Crypto e PBKDF2-HMAC-SHA-256 com 600 mil iterações e sais aleatórios de 16 bytes, separados para senha e recuperação. A configuração é opcional por navegador e grava os verificadores no IndexedDB. Os dados operacionais e os backups JSON continuam legíveis. | A aplicação não usa contas de servidor nem um serviço de autenticação. A configuração é **Configurações → Senha de acesso** na própria PWA. |
| Rate limit | **Ausente para login e operações da aplicação.** O bloqueio roda no navegador e as operações usam IndexedDB. A publicação serve arquivos estáticos e o desenvolvimento não expõe endpoints de login ou transações. O GitHub documenta limites gerais que podem gerar `429`. O limiar efetivo no perímetro foi **não verificável** e não foi submetido a teste de carga em produção. | O GitHub Pages não oferece configuração de rate limit por endpoint em **Settings → Pages**. Em um futuro serviço com autenticação ou API, o limite precisaria ser aplicado pelo provedor ou servidor desse serviço. |

Fontes do provedor [site público](https://ramon-lopes.github.io/cookie-campus/), [HTTPS no Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https), [limites do Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) e [fluxo de publicação](.github/workflows/pages.yml).

O workflow publica após push para `main` e admite execução manual. O ambiente `github-pages` permite deploy de `main` e não exige revisor de publicação. Para exigir aprovação separada de um merge, consulte **Settings → Environments → github-pages → Deployment protection rules → Required reviewers**. O branch deste trabalho e seu PR não publicam a aplicação.

O backup agendado externo exigiria um destino autorizado para as cópias. Limitar requisições de login no servidor exigiria um endpoint de autenticação. Os controles que já funcionam na arquitetura atual são HTTPS, verificação local da senha e exportação/restauração protegidas. A revisão não alterou o provedor nem os dados publicados.

## Verificações locais

- `npm test` aprovou 44 testes com dados fictícios. A cobertura inclui locais legados, recebimento e retirada nos dois dias, falha de gravação e nova tentativa, ações concorrentes, cancelamento, devolução e restauração.
- `npm run build` gerou o `dist/` exigido pelo workflow. A verificação de arquivos privados passou. Os quatro PNGs fornecidos estão no build e no cache offline. O cadastro usa **Oreo com Nutella** e mantém o nome.
- Chromium a 390 × 844 e 320 × 568 e WebKit a 390 × 844 exercitaram os fluxos de reserva e caixa com dados fictícios. O teste conferiu a lista sem local selecionado, criação, reabertura, edição legada, pagamentos, devolução, dimensões e alinhamento dos sete ícones. A recarga offline passou no Chromium.
- Safari e PWA instalada em iPhone físico ainda precisam de verificação de VoiceOver, áreas seguras e seletores nativos.

## Registro de verificação anterior — 18/11/2026

- `npm test`: 36 testes aprovados. Os novos testes cobrem transferência de estoque, intervalo entre dias, transações concorrentes e reenvios, estoque reservado, caixa em dias distintos e restauração legada com a senha local preservada.
- `npm run build`: aprovado. O pacote contém o código-fonte e a aplicação estática em `dist/`.
- Chromium em 390 × 844 e 320 × 568, usando somente dados fictícios. Verificados alinhamento dos cartões, bloqueio de vendas de estoque reservado, divulgação, fechamento e abertura com 3 sobras mais 5 recebidas, Histórico, estorno, reembolso e recebimento em outro dia, restauração legada com cópia, desbloqueio e recuperação da senha e recarga offline.
- Validação restante no iPhone físico: Safari e PWA na Tela de Início, VoiceOver, teclado e área segura, ergonomia com uma mão, importação e exportação por Arquivos, atualização instalada e modo avião.

## Registro de verificação anterior — 15/11/2026

### Revisão P0/P1/P2

**30 testes aprovados, 0 falhas**, build de produção aprovado e sintaxe dos módulos verificada. As seções de etapas abaixo registram a entrega original de 14 testes.

- **P0:** consentimento explícito, exportação separada da restauração, comparação otimista do estado, cópias independentes na mesma transação e preservação da chave legada. Testes simulam falta de espaço, aborto após tentar gravar a cópia, arquivo inválido, concorrência e restaurações sucessivas. JSON e pastas privadas ignorados pelo Git; build verifica conteúdo privado e usa lista explícita de arquivos.
- **P1, venda:** botões de 46 × 48 px para `+`/`−`, múltiplos sabores, Pix padrão, nome opcional recolhido e total/confirmação fixados na base do formulário. Estoque validado na transação e idempotência mantida.
- **P1, reservas:** editar cliente, retirada e itens; revisão concorrente; troca de sabores/quantidades atômica; preço antigo para sabores mantidos e atual para adicionados; auditoria de antes/depois.
- **P2:** data local e aviso de dia anterior ainda aberto; painel de dívidas de todos os dias; identificação do dia que recebe o pagamento; caixa separa entradas e reembolsos efetivos. Estorno pago cria reembolso pendente, com confirmação separada da devolução. Dados legados continuam aceitos.

Arquivos alterados: `src/domain.js`, `src/db.js`, `src/app.js`, `styles.css`, `sw.js`, `.gitignore`, `scripts/build.mjs`, `scripts/serve.mjs`, `test/db.test.js`, `test/pwa.test.js`, README e este relatório. Adicionados: `src/operations-ui.js`, `scripts/check-data.mjs`, `test/restore.test.js`, `test/revision.test.js` e `preview-venda-rapida.jpg`.

**Navegador real, 390 × 844:** na origem separada `localhost:4174`, venda Pix com dois sabores totalizando R$ 24; incremento e decremento; edição de reserva de 1 Nutella para 2 Ninho com Nutella, com mudança de nome e retirada; restauração exibida desabilitada sem consentimento e cancelada sem modificar os registros. Após desligar o servidor e confirmar indisponibilidade HTTP, recarga abriu a nova interface e o histórico offline.

O IndexedDB de `localhost:4173` não foi acessado ou substituído nesta revisão. Os testes de restauração efetiva ocorreram somente no IndexedDB emulado dos testes automatizados. Um arquivo sintético `private/qa-backup.json` foi criado para conferir a interface e permanece ignorado pelo Git. Nenhum dado foi apagado, nenhuma publicação foi realizada e a dependência de testes não mudou.

**Pendente no iPhone físico:** Safari/PWA instalada, VoiceOver, alcance com uma mão, área segura e teclado, fluxo Arquivos de exportação/importação, atualização de cache, reinício do aparelho e modo avião. Teste em viewport não equivale a essa validação.

## Etapa 1 — Fundação

Criados `package.json`, `src/domain.js`, `src/db.js`, `index.html`, `styles.css`, `src/app.js` e scripts locais. Seis sabores iniciais a R$ 12,00, edição/desativação, abertura única de dia e persistência IndexedDB.

Verificado: testes de estoque inicial e bloqueio de dia duplicado; leitura persistente por uma conexão IndexedDB independente; abertura real de dia na interface.

## Etapa 2 — Operações

Venda rápida com vários sabores, reserva com retirada, conclusão/cancelamento, pagamentos e indicadores. Preços armazenados por item em centavos. Bloqueio durante envio e idempotência por identificador de operação.

Verificado: os cenários obrigatórios de reservas, vendas, estoque insuficiente, duplo envio, recebimento posterior e preservação de preço passaram. Transações concorrentes disputando a última unidade resultaram em uma única venda bem-sucedida. UI mostrou 27 vendidos e 2 disponíveis após 29 recebidos.

## Etapa 3 — Fechamento e proteção

Histórico, estorno auditável, perdas/ajustes com motivo, conferência física, JSON de backup e restauração validada, cópia anterior à restauração e mensagem para WhatsApp.

Verificado: estorno e recomposição; round-trip JSON; rejeição de dados inválidos; rollback de transações; bloqueio de divergência e reserva pendente no fechamento. UI confirmou quitação sem faturamento extra, mensagem com apenas Nutella disponível e fechamento com duas unidades restantes.

## Etapa 4 — Entrega

Criados manifest, Service Worker, ícones PNG/SVG, build estático, workflow GitHub Pages e README.

- `npm test`: **14 aprovados, 0 falhas**.
- `node --check src/app.js`: aprovado.
- `npm run build`: aprovado; saída em `dist/`.
- Interface: navegador embutido em viewport 390 × 844, com inspeção visual.
- Offline real: servidor encerrado e conexão HTTP indisponível; recarga e consulta do histórico funcionaram pelo Service Worker.
- Evidência: `preview-mobile.jpg`.

## Limites da verificação

Não foi realizada publicação externa nem teste em Safari/iPhone físico. O repositório não possui remote. A integração IndexedDB automatizada usa `fake-indexeddb`; a persistência também foi observada no navegador real após recarga e reabertura. A hospedagem nova terá banco vazio, independente dos dados de teste no localhost.

O MVP trabalha com recebimento integral e estorno no dia aberto. Não sincroniza aparelhos, não integra bancos e não apura custos/lucro. Backup JSON externo deve fazer parte do fechamento diário.
