# Cookie Campus

PWA mobile-first para vendas de cookies na faculdade. HTML, CSS e JavaScript com módulos ES, sem framework, backend ou dependências de produção. Dados persistidos em IndexedDB; arquivos da aplicação disponíveis offline via Service Worker.

## Executar

Requer Node.js 24 para os comandos de desenvolvimento e testes.

```sh
npm ci
npm test
npm start
```

Abra http://localhost:4173. Não abra `index.html` diretamente pelo explorador: módulos e Service Worker precisam de um servidor HTTP/HTTPS. `npm start` não requer dependências; `npm ci` instala apenas a ferramenta de testes `fake-indexeddb`.

```sh
npm run build
```

Gera a aplicação estática em `dist/` por uma lista explícita de arquivos. O build bloqueia arquivos inesperados em `dist/` e verifica possíveis backups no conjunto de arquivos do Git; não apaga esses arquivos. O servidor de desenvolvimento serve a raiz do projeto somente em `127.0.0.1`; para hospedagem, publique apenas `dist/`. A variável `PORT` permite uma origem separada para testes, sem acessar o IndexedDB da porta padrão.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub e envie estes arquivos para a branch `main` (não inclua `node_modules` nem backups de clientes).
2. Em **Settings → Pages → Build and deployment**, selecione **GitHub Actions**.
3. Execute o workflow **Publicar no GitHub Pages**, ou envie um commit para `main`.
4. O workflow executa `npm ci`, os testes e o build, e publica `dist/`. A URL aparece no resultado do deploy.

O arquivo `.github/workflows/pages.yml` já está preparado. Todos os caminhos são relativos, permitindo publicação em `https://USUARIO.github.io/REPOSITORIO/`. O projeto local não possui remote Git configurado; nenhuma publicação foi realizada.

## Instalar no iPhone

1. Abra a URL **HTTPS publicada** no Safari.
2. Aguarde a primeira abertura com internet.
3. Compartilhar → **Adicionar à Tela de Início** → Adicionar.
4. Abra pelo ícone; antes do primeiro dia real, teste em modo avião após a instalação.

O localhost do computador não é acessível como localhost do iPhone. Acesso HTTP por IP de rede não substitui HTTPS para instalação e funcionamento offline. O layout foi verificado em viewport de 390 × 844; Safari/iPhone físico não foi testado neste ambiente.

## Rotina de uso

- **Hoje → Abrir dia**: informe o estoque físico levado à faculdade. Sobras anteriores devem ser contadas e incluídas manualmente. Apenas um dia pode permanecer aberto. A data comercial usa o fuso local do aparelho. Se passar da meia-noite, o dia anterior continua aberto com um aviso: feche e abra outro para mudar a data das operações.
- **Venda rápida**: botões `+`/`−` por sabor, vários sabores, Pix por padrão e nome opcional recolhido. Total e confirmação ficam na base do formulário. A validação definitiva do estoque continua na transação IndexedDB.
- **Reservas → Editar**: altera cliente, sabores, quantidades e retirada de uma reserva pendente. O próprio estoque reservado é liberado e recalculado na mesma transação. Sabores mantidos preservam o preço reservado; sabores novos usam o preço atual. Alterações concorrentes da mesma reserva são rejeitadas e cada edição guarda antes/depois na auditoria. Concluir mantém os preços; cancelar devolve disponibilidade.
- **Movimentar estoque**: recebimento adicional, perda ou ajuste com motivo. Ajustes aceitam números positivos e negativos. Não é permitido consumir estoque reservado.
- **Histórico → Pendências de todos os dias → Receber**: quita integralmente uma venda, sem faturar novamente. A confirmação mostra a data da venda e o dia operacional que receberá a entrada. Sem dia aberto, o app orienta a abertura; depois volte às pendências. O MVP não faz parcelamento ou recebimento parcial.
- **Histórico → Estornar**: preserva a venda e o pagamento, registra motivo e recompõe o estoque. Se houve pagamento, cria um **reembolso pendente**; a entrada não desaparece do caixa. Após devolver efetivamente o dinheiro, use **Registrar reembolso**, escolhendo o meio de devolução. Pode ser registrado em outro dia aberto. Correção = estornar e registrar uma nova venda. Estornos de vendas continuam restritos ao dia aberto; dias fechados preservam sua conciliação.
- **Conferir e fechar**: digite a contagem física de cada sabor. Divergências e reservas pendentes impedem fechamento. Registre as perdas/ajustes necessários e confira novamente. Dívidas podem permanecer pendentes após fechar.
- **Configurações**: cadastrar, editar, desativar sabores e alterar preços. Vendas e reservas existentes preservam o preço original.
- **Divulgar no WhatsApp**: copia mensagem com preços e sabores ativos com estoque disponível; não envia mensagens automaticamente.

## Backup e proteção

Exporte JSON diariamente em Configurações ou Histórico. Os dados ficam somente neste navegador/aparelho e não são sincronizados entre dispositivos. Limpar dados do navegador, desinstalar ou mecanismos de limpeza de armazenamento do sistema podem remover registros; o backup externo é essencial.

Na importação, o app valida versão, entidades, referências, quantidades, preços, estoque, pagamentos, reembolsos e conciliação. Exibe a comparação com os dados atuais e mantém **Substituir dados e restaurar** desabilitado até marcar o consentimento explícito. **Cancelar** não altera nada. Baixar o backup é uma ação separada: o app informa que o download foi solicitado e não afirma que o arquivo foi salvo. Confira em Arquivos/Downloads.

A restauração grava uma cópia independente do estado anterior e o novo estado na mesma transação. Se faltar espaço ou qualquer gravação falhar, ambos são desfeitos. Alterações feitas por outra aba depois da conferência bloqueiam a restauração. Todas as cópias anteriores, incluindo a chave legada `before-restore`, são preservadas. Use **Cópias anteriores à restauração** para exportar uma delas e depois importá-la. Não há limpeza automática dessas cópias; elas ocupam espaço local e não substituem backups externos.

`.gitignore` exclui JSON por padrão (exceto `package.json` e `package-lock.json`) e as pastas `backups/`, `exports/`, `recovery/` e `private/`. A checagem do build detecta também arquivos rastreados com conteúdo de backup, mesmo renomeados. Não use `git add -f` para contornar essa proteção. O build não inclui backups nem imagens de verificação. Essas medidas previnem inclusão acidental no fluxo normal; não impedem um envio manual que ignore as proteções.

Backups não são criptografados. Guarde-os com cuidado, pois podem conter nomes de clientes. Não envie backups ao repositório público. A validação detecta inconsistências estruturais e de negócio, mas não autentica a origem de um arquivo deliberadamente adulterado.

## Regras e arquitetura

- `src/domain.js`: funções de negócio puras, centavos inteiros, preços históricos, validação e backup.
- `src/db.js`: um snapshot do estado em IndexedDB. Leitura, validação e gravação ocorrem na mesma transação `readwrite`, incluindo operações com vários sabores.
- `src/app.js`: interface, formulários, feedback, navegação e atualização entre abas.
- `src/operations-ui.js`: seleção de quantidades, edição de reservas, confirmação de pagamentos/reembolsos e conferência de restauração.
- `styles.css`: layout responsivo, formulários e áreas seguras do iPhone.
- `sw.js`: cache dos recursos locais, sem fontes, scripts ou serviços externos.
- `test/`: testes de negócio, integração com IndexedDB emulado e Service Worker.

Disponível = recebido + ajustes líquidos − perdas − vendido − reservado. Cada envio possui identificador idempotente e bloqueio de botão durante gravação. Transações concorrentes são serializadas pelo IndexedDB e revalidam o estoque. O estado inteiro foi escolhido pela simplicidade do MVP; volumes muito grandes devem migrar para stores por entidade.

O histórico separa vendas após estornos, valor estornado, entradas, reembolsos efetivos, caixa líquido e valores a reembolsar. Caixa líquido = entradas − reembolsos, agrupados pelo dia operacional em que foram registrados e pela forma efetiva de entrada/saída. Não representa lucro. Estornos antigos sem informação de reembolso preservam a interpretação anterior (devolução presumida) e recebem um aviso explícito no histórico; nenhum registro antigo foi reescrito para inventar uma confirmação. Os campos internos antigos `received`/`methods` permanecem compatíveis; a interface de caixa usa `collected`, `refunded`, `cashNet` e `cashMethods`.

O banco continua na versão 1 e no mesmo object store. Os novos campos são opcionais para registros legados. Datas comerciais antigas são calculadas a partir de `openedAt` no fuso local sem regravar o `label` UTC antigo. Mantenha o fuso do aparelho correto; registros legados não guardam o fuso original. Nenhum custo, lucro, taxa de cartão ou conciliação bancária é calculado. Registrar Pix não verifica o banco.

## Atualizações e offline

Ao modificar arquivos da aplicação, altere a versão `CACHE` em `sw.js` e publique novamente somente quando autorizado. O cache inclui o novo módulo de interface e é separado por escopo/URL da instalação. A leitura offline usa apenas o cache dessa instalação. Caches antigos sem escopo são deixados intactos para não afetar outra instalação. Uma atualização aguarda o fechamento das abas antigas para evitar mistura de versões. Feche o aplicativo e reabra com internet para receber a nova versão. Os dados do IndexedDB são preservados.

## Verificações realizadas

`npm test`: 30 testes aprovados, incluindo os 14 cenários anteriores e 16 testes adicionais de segurança, edição, data comercial, caixa e compatibilidade. O teste anterior de restauração foi adaptado para exigir consentimento e conferir as cópias preservadas. `npm run build` valida a proteção de dados e gera os arquivos de publicação.

Teste de interface no navegador: abertura de 29 unidades, venda Pix de 25, reserva e conclusão de 2, resultado de 27 vendidos e 2 disponíveis, recebimento posterior de R$ 24 sem novo faturamento, mensagem de divulgação somente com o sabor disponível e fechamento conciliado. Após desligar o servidor local e confirmar a indisponibilidade HTTP, a página foi recarregada e o histórico permaneceu acessível pelo cache offline, com os registros preservados. Dados desse teste existem apenas no navegador local usado na verificação; a hospedagem nova começa vazia.

Na revisão, a interface foi testada separadamente em `localhost:4174`, sem acessar os dados de `4173`: venda de dois sabores com incremento/decremento, Pix padrão, edição completa de reserva e cancelamento da conferência de restauração sem perda dos registros. Com o servidor desligado, a nova venda rápida e o histórico abriram após recarga. Evidência atual: `preview-venda-rapida.jpg`. O servidor temporário foi encerrado; execute `npm start` para iniciar novamente.

Ainda depende de iPhone físico: ergonomia com uma mão, VoiceOver, comportamento do teclado/área segura, download e escolha de JSON pelo app Arquivos, instalação/atualização pelo Safari e persistência após fechar a PWA, reiniciar o aparelho e operar em modo avião. Nenhuma publicação ou restauração de dados reais foi realizada nesta revisão.
