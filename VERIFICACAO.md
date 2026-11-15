# Verificação da entrega — 15/11/2026

## Revisão P0/P1/P2 — resultado atual

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
