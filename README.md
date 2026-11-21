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

Gera a aplicação estática em `dist/` por uma lista explícita de arquivos. O build bloqueia arquivos inesperados em `dist/` e verifica possíveis backups nos arquivos do Git. Fora de um checkout Git, verifica a lista explícita de arquivos publicáveis. O servidor de desenvolvimento serve a raiz do projeto somente em `127.0.0.1`; para hospedagem, publique apenas `dist/`. A variável `PORT` permite uma origem separada para testes, sem acessar o IndexedDB da porta padrão.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub e envie estes arquivos para a branch `main` (não inclua `node_modules` nem backups de clientes).
2. Em **Settings → Pages → Build and deployment**, selecione **GitHub Actions**.
3. Execute o workflow **Publicar no GitHub Pages**, ou envie um commit para `main`.
4. O workflow executa `npm ci`, os testes e o build, e publica `dist/`. A URL aparece no resultado do deploy.

O arquivo `.github/workflows/pages.yml` publica a partir da branch `main`. Todos os caminhos são relativos, permitindo publicação em `https://USUARIO.github.io/REPOSITORIO/`. No repositório oficial, o merge para `main` inicia o deploy. Revise o PR e aprove a publicação antes de fazer o merge.

## Instalar no iPhone

1. Abra a URL **HTTPS publicada** no Safari.
2. Aguarde a primeira abertura com internet.
3. Compartilhar → **Adicionar à Tela de Início** → Adicionar.
4. Abra pelo ícone; antes do primeiro dia real, teste em modo avião após a instalação.

O localhost do computador não é acessível como localhost do iPhone. Acesso HTTP por IP de rede não substitui HTTPS para instalação e funcionamento offline. O layout foi verificado em viewport de 390 × 844; Safari/iPhone físico não foi testado neste ambiente.

## Rotina de uso

- **Hoje → Abrir dia**: confira as sobras confirmadas no último fechamento e informe apenas o recebimento novo. O total soma as duas origens por sabor. O app aproveita as sobras na próxima abertura, inclusive após um intervalo entre vendas. Há um dia aberto por vez. A data comercial segue o fuso local, e passar da meia-noite mantém o dia aberto até o fechamento.
- **Venda rápida**: botões `+`/`−` por sabor, vários sabores, Pix por padrão e nome opcional recolhido. Total e confirmação ficam na base do formulário. A validação definitiva do estoque continua na transação IndexedDB.
- **Reservas → Nova reserva** abre uma lista de locais de retirada. Em **Editar**, o local anterior aparece selecionado, inclusive se foi digitado em uma versão antiga. Antes de receber, é possível alterar cliente, local e itens. Os sabores mantidos preservam o preço reservado. Depois de receber, a edição permite mudar o cliente e o local com o valor e os itens já confirmados.
- **Reservas → Registrar pagamento** confirma o valor integral e o meio no caixa aberto. Para um recebimento anterior, abra **Informar data de recebimento anterior** e informe a data e a hora reais. Se o dia estiver fechado, abra um dia e registre o recebimento na reserva. A entrada fica no caixa que está aberto, inclusive quando a data efetiva é anterior. **Concluir retirada** reutiliza o pagamento. Para cobrar na retirada, vá direto a **Concluir retirada** e escolha o meio ou **Pendente**.
- **Cancelar uma reserva paga** libera os cookies e mantém o recebimento registrado. Em **Histórico → Reembolsos pendentes**, use **Registrar reembolso** após devolver o dinheiro. A saída é registrada no caixa aberto e os detalhes permanecem no Histórico.
- **Movimentar estoque**: recebimento adicional, perda ou ajuste com motivo. Ajustes aceitam números positivos e negativos. Não é permitido consumir estoque reservado.
- **Histórico → Pendências de todos os dias → Receber**: quita integralmente uma venda, sem faturar novamente. A confirmação mostra a data da venda e o dia operacional que receberá a entrada. Sem dia aberto, o app orienta a abertura; depois volte às pendências. O MVP não faz parcelamento ou recebimento parcial.
- **Histórico → Vendas → detalhes da venda → Estornar**: preserva a venda e o pagamento, registra motivo e recompõe o estoque. Se houve pagamento, cria um **reembolso pendente**; a entrada não desaparece do caixa. Após devolver efetivamente o dinheiro, use **Registrar reembolso**, escolhendo o meio de devolução. Pode ser registrado em outro dia aberto. Correção = estornar e registrar uma nova venda. Estornos de vendas continuam restritos ao dia aberto; dias fechados preservam sua conciliação.
- **Conferir e fechar** exige resolver as reservas ainda sem pagamento. Reservas pagas podem aguardar a retirada em outro dia. Separe fisicamente seus cookies e conte apenas as unidades livres. Em **Reaproveitar**, confirme quantas unidades livres vão para a próxima abertura. Ao concluir uma retirada posterior, o app usa os cookies separados e reconhece a venda no dia da retirada. Se uma reserva paga de outro dia for cancelada, os itens voltam ao estoque do dia aberto.
- **Configurações**: cadastrar, editar, desativar sabores e alterar preços. Vendas e reservas existentes preservam o preço original.
- **Divulgar no WhatsApp**: copia mensagem com preços e sabores ativos com estoque disponível; não envia mensagens automaticamente.

## Backup e proteção

Em **Configurações → Senha de acesso**, defina uma senha local de pelo menos 8 caracteres. Guarde o código de recuperação exibido após configurar ou alterar a senha. Use **Bloquear agora** ou feche e reabra o app. A tela de entrada pede somente a senha. **Esqueci a senha** aceita o código e permite criar outra senha e outro código. Se perder os dois, é possível recuperar os registros presentes no último backup restaurando-o em outro navegador ou aparelho.

A senha é um bloqueio da interface e funciona offline com a PWA já carregada. O navegador guarda verificadores PBKDF2-SHA-256 com sais aleatórios para senha e recuperação. IndexedDB, cópias locais e JSON permanecem em formato legível. A senha é específica do navegador, fica fora do JSON e continua ativa ao restaurar dados no mesmo aparelho. As ações de exportar, restaurar e acessar cópias de recuperação ficam atrás da tela de desbloqueio. A configuração usa Web Crypto nativo em HTTPS ou localhost, sem serviço externo e sem dependência de produção.

Exporte JSON diariamente em Configurações ou Histórico. Os dados ficam somente neste navegador/aparelho e não são sincronizados entre dispositivos. Limpar dados do navegador, desinstalar ou mecanismos de limpeza de armazenamento do sistema podem remover registros; o backup externo é essencial.

O formato JSON preserva os backups anteriores. Os novos registros podem trazer `reservationId` no pagamento e `finishedDayId` ou `refund` na reserva. Na retirada, o pagamento antecipado ganha o vínculo `saleId`, mantendo o horário, o meio e o dia de caixa originais. Para restaurar um backup com os novos campos, use esta versão ou uma posterior. Os backups operacionais continuam separados da senha local.

Na importação, o app valida versão, entidades, referências, quantidades, preços, estoque, pagamentos, reembolsos e conciliação. Exibe a comparação com os dados atuais e mantém **Substituir dados e restaurar** desabilitado até marcar o consentimento explícito. **Cancelar** não altera nada. Baixar o backup é uma ação separada: o app informa que o download foi solicitado e não afirma que o arquivo foi salvo. Confira em Arquivos/Downloads.

A restauração grava uma cópia independente do estado anterior e o novo estado na mesma transação. Se faltar espaço ou qualquer gravação falhar, ambos são desfeitos. Alterações feitas por outra aba depois da conferência bloqueiam a restauração. Todas as cópias anteriores, incluindo a chave legada `before-restore`, são preservadas. Use **Cópias anteriores à restauração** para exportar uma delas e depois importá-la. Não há limpeza automática dessas cópias; elas ocupam espaço local e não substituem backups externos.

`.gitignore` exclui JSON por padrão (exceto `package.json` e `package-lock.json`) e as pastas `backups/`, `exports/`, `recovery/` e `private/`. A checagem do build detecta também arquivos rastreados com conteúdo de backup, mesmo renomeados. Não use `git add -f` para contornar essa proteção. O build não inclui backups nem imagens de verificação. Essas medidas previnem inclusão acidental no fluxo normal; não impedem um envio manual que ignore as proteções.

Backups não são criptografados. Guarde-os com cuidado, pois podem conter nomes de clientes. Não envie backups ao repositório público. A validação detecta inconsistências estruturais e de negócio, mas não autentica a origem de um arquivo deliberadamente adulterado.

## Regras e arquitetura

- `src/domain.js`: funções de negócio puras, centavos inteiros, preços históricos, validação e backup.
- `src/db.js`: um snapshot do estado em IndexedDB. Leitura, validação e gravação ocorrem na mesma transação `readwrite`, incluindo operações com vários sabores.
- `src/app.js`: interface, formulários, feedback, navegação e atualização entre abas.
- `src/operations-ui.js`: seleção de quantidades, edição de reservas, confirmação de pagamentos/reembolsos e conferência de restauração.
- `src/history-ui.js`: resumo, detalhes e formatação de vendas, caixa e estoque.
- `src/access.js`: bloqueio local, verificação da senha e recuperação via Web Crypto.
- `styles.css`: layout responsivo, formulários e áreas seguras do iPhone.
- `sw.js`: cache dos recursos locais, sem fontes, scripts ou serviços externos.
- `test/`: testes de negócio, integração com IndexedDB emulado e Service Worker.

Disponível = recebimentos novos + sobras aproveitadas + ajustes líquidos + devoluções de reservas de dias anteriores − perdas − vendas que usam o estoque do dia − reservas separadas nesse dia. Cada envio possui identificador idempotente e bloqueio de botão durante a gravação. O IndexedDB serializa transações concorrentes e revalida o estoque.

**Vendas líquidas de estornos** soma as vendas registradas, excluindo as estornadas pelo dia operacional da venda. O resumo geral cobre todos os dias e cada dia mostra seu próprio total junto à data. **Caixa líquido** soma as entradas e desconta os reembolsos efetivos no dia operacional do lançamento e pelo meio efetivo. Um pagamento antecipado entra no caixa quando registrado. A venda correspondente entra no total ao concluir a retirada. Estornos antigos sem informação de reembolso preservam a devolução presumida, sinalizada no Histórico. Veja o exemplo e os limites da auditoria em [VERIFICACAO.md](VERIFICACAO.md).

O banco continua na versão 1 e no mesmo object store. Os fechamentos novos podem guardar uma seleção de sobras. A abertura grava a origem por sabor na mesma transação do dia novo. A importação valida correspondência exata entre a seleção e as movimentações do dia seguinte na sequência de aberturas. Fechamentos legados continuam válidos sem seleção e o saldo histórico legado fica disponível na consulta. Datas comerciais antigas são calculadas a partir de `openedAt` no fuso local sem regravar o `label` UTC antigo. Mantenha o fuso do aparelho correto; registros legados não guardam o fuso original. Nenhum custo, lucro, taxa de cartão ou conciliação bancária é calculado. Registrar Pix não verifica o banco.

## Atualizações e offline

Ao modificar arquivos da aplicação, altere a versão `CACHE` em `sw.js` e publique novamente somente quando autorizado. O cache inclui o novo módulo de interface e é separado por escopo/URL da instalação. A leitura offline usa apenas o cache dessa instalação. Caches antigos sem escopo são deixados intactos para não afetar outra instalação. Uma atualização aguarda o fechamento das abas antigas para evitar mistura de versões. Feche o aplicativo e reabra com internet para receber a nova versão. Os dados do IndexedDB são preservados.

## Verificações

Execute `npm test` e `npm run build`. A suíte cobre a passagem de 17 para 18/11/2026, intervalo entre dias, reenvios, concorrência de abas, estoque reservado, estorno com devolução em outro dia e restauração legada.

No iPhone físico, confira o alcance com uma mão, VoiceOver, área segura e teclado do Safari, exportação/importação via Arquivos, instalação e atualização da PWA e operação em modo avião.
