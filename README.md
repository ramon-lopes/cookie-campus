# Cookie Campus

Aplicativo web instalável (PWA) para registrar vendas de cookies, acompanhar o estoque por sabor, organizar reservas e conferir o caixa. O app funciona offline depois que o navegador prepara o cache na primeira abertura com internet.

[Abrir o Cookie Campus](https://ramon-lopes.github.io/cookie-campus/)

Os registros ficam no navegador e na origem em que foram criados. Para transferir dados entre navegadores, origens ou aparelhos, exporte e restaure um backup JSON.

## Instalar no iPhone

1. Abra o Cookie Campus no Safari com internet.
2. No menu de compartilhamento, toque em **Adicionar à Tela de Início**.
3. Se aparecer a opção **Abrir como App da Web**, ative-a e toque em **Adicionar**.
4. Abra pelo novo ícone com internet. Antes de usar em vendas, ative o modo avião e teste a reabertura pelo ícone.

Consulte o passo a passo do Safari no [Manual do iPhone](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/27/ios/27).

Para receber uma atualização, acesse com internet e feche as abas e janelas antigas do app para que a nova versão possa ativar. Depois, reabra pelo mesmo endereço ou ícone. O cache guarda os arquivos do app e o IndexedDB guarda os registros.

O layout e a recarga offline foram verificados em Chromium e WebKit. A instalação, o teclado nativo e o modo avião na PWA instalada ainda precisam de verificação no iPhone físico. Veja o [registro de verificação](VERIFICACAO.md).

## Rotina de vendas

1. Em **Hoje → Abrir dia**, confira as sobras da última sessão e informe apenas o recebimento novo. O app soma as duas origens por sabor. Há um dia operacional aberto por vez. Mesmo após a meia-noite, os lançamentos ficam nesse dia até o fechamento.
2. Em **Venda rápida**, adicione as quantidades por sabor, selecione o meio de pagamento e confira o total. Pix é a opção inicial. Use **Pendente** para receber depois ou **Adicionar nome do cliente** para identificar a venda.
3. Em **Movimentar estoque**, registre recebimentos adicionais, perdas ou ajustes e informe o motivo. O estoque reservado fica separado do saldo disponível.
4. Em **Conferir e fechar dia**, resolva as reservas sem pagamento e conte apenas as unidades livres. Registre divergências antes de fechar. Em **Reaproveitar**, informe as sobras que devem entrar na próxima abertura. Mantenha fisicamente separados os cookies das reservas pagas que aguardam retirada.

Em **Configurações**, você pode adicionar, editar ou desativar sabores. Registros existentes preservam os preços de venda e de reserva. **Divulgar no WhatsApp** prepara um texto com os sabores disponíveis e seus preços para você copiar e enviar.

### Reservas

- **Nova reserva** separa as quantidades do estoque livre e exige cliente e local de retirada. **Editar** permite mudar itens, cliente e local antes do pagamento. Depois de pago, você pode atualizar o cliente e o local. Sabores mantidos na reserva conservam o preço original.
- **Registrar pagamento** lança o valor integral no caixa aberto para uma reserva desse dia. Se o cliente já pagou, use **Informar data de recebimento anterior** para registrar quando o dinheiro entrou. O lançamento pertence ao caixa aberto.
- **Concluir retirada** registra a venda no dia da entrega. Se o pagamento já foi lançado, o app o reaproveita. Você também pode receber na retirada ou marcar **Pendente**. Reservas pagas podem atravessar o fechamento.
- **Cancelar** libera os cookies no estoque do dia aberto. Se a reserva estava paga, a devolução fica em **Histórico → Pendências de todos os dias → Reembolsos pendentes**.

### Histórico, pagamentos e caixa

| Indicador | O que representa |
| --- | --- |
| **Vendas líquidas de estornos** | Valor das vendas pelo dia em que foram registradas, descontados os estornos. |
| **Caixa líquido** | Entradas registradas menos devoluções, no dia do lançamento em caixa. Registros antigos podem incluir devoluções presumidas, indicadas no Histórico. |
| **A receber** | Valores de vendas com pagamento pendente. |
| **A reembolsar** | Valores de estornos ou reservas canceladas que ainda aguardam devolução. |

Em **Histórico → Pendências de todos os dias**, use **Receber** para quitar uma venda integralmente no caixa aberto, preservando a data da venda. Para corrigir uma venda, use **Estornar** nos detalhes de uma venda do dia aberto e registre a nova venda. Se houve pagamento, use **Registrar reembolso** depois de devolver o dinheiro. A saída entra no caixa aberto no momento do registro, inclusive em um dia posterior ao da venda.

Os meios de pagamento são lançados manualmente. Confira os recebimentos diretamente no banco ou na maquininha. O resumo acompanha vendas e caixa operacional. Parcelamento, recebimento parcial, taxas de cartão, custos, lucro e conciliação bancária ficam fora desse cálculo.

## Backup e segurança

> **Exporte um backup ao fechar o dia e antes de trocar de aparelho ou limpar os dados do navegador.** O armazenamento local pode ser removido pelo usuário ou pelo sistema. Mantenha uma cópia fora do navegador, em local privado e fora do repositório. O JSON é legível e pode conter nomes de clientes.

### Exportar e restaurar

1. Use **Histórico → Backup** ou **Configurações → Backup → Exportar backup**. Confira em **Arquivos** ou **Downloads** se o arquivo foi salvo.
2. No destino, abra **Configurações → Backup → Restaurar JSON** e escolha o arquivo. Use a versão atual do app para importar backups antigos compatíveis ou arquivos exportados por esta versão. Importe arquivos de origem confiável.
3. Compare os dados atuais com os dados do arquivo. Se quiser exportar o estado atual antes da troca, use **Baixar backup dos dados atuais**. Para concluir a substituição, marque o consentimento e toque em **Substituir dados e restaurar**.

A restauração valida o formato, os vínculos entre registros e as regras do estoque e do caixa. A substituição e a cópia local do estado anterior são gravadas na mesma transação. Se houver falha de gravação, os dados atuais são preservados. Se outra aba alterar os dados após a conferência, confira novamente antes de restaurar. As cópias anteriores ficam em **Configurações → Backup → Cópias anteriores à restauração** e compartilham o armazenamento do navegador.

### Bloqueio de acesso

Em **Configurações → Senha de acesso**, configure uma senha de pelo menos oito caracteres e guarde o código de recuperação. Para trancar a interface durante o uso, toque em **Bloquear agora**. Na tela de entrada, **Esqueci a senha** permite configurar outra senha com o código. Se você perder os dois, recupere os registros do último backup em outro navegador ou aparelho.

O bloqueio é opcional e local ao navegador. O app usa Web Crypto para verificar a senha e o código com PBKDF2-HMAC-SHA-256 e sais separados. Quem tiver acesso ao armazenamento do perfil do navegador poderá ler os registros e as cópias locais. A senha fica fora do arquivo JSON, e restaurar dados no mesmo navegador preserva o bloqueio configurado. O GitHub Pages hospeda os arquivos do app. O navegador armazena os dados operacionais.

## Desenvolvimento

Use **Node.js 24** e execute na raiz do repositório.

```sh
npm ci
npm start
```

Abra [localhost:4173](http://localhost:4173). O comando compila e serve `dist/` apenas no próprio computador. Reinicie o servidor após mudanças. A variável `PORT` permite criar outra origem local para usar dados fictícios em testes. Use a mesma URL local para reencontrar seus registros. O localhost do computador e a versão publicada têm bancos separados.

```sh
npm test
npm run build
node scripts/check-data.mjs
```

### Organização do código

| Caminho | Responsabilidade |
| --- | --- |
| [`src/domain.js`](src/domain.js) | Regras de vendas, estoque e caixa, valores em centavos, validação e compatibilidade de backups. |
| [`src/db.js`](src/db.js) e [`src/access.js`](src/access.js) | Persistência transacional em IndexedDB e bloqueio local. |
| [`src/app.js`](src/app.js), [`src/operations-ui.js`](src/operations-ui.js) e [`src/history-ui.js`](src/history-ui.js) | Navegação, formulários e Histórico. |
| [`src/stock-cards.jsx`](src/stock-cards.jsx) e [`src/history-summary.jsx`](src/history-summary.jsx) | Cards de estoque e indicadores do Resumo geral em React. |
| [`styles.css`](styles.css) e [`src/stock-utilities.css`](src/stock-utilities.css) | Estilos do app e piloto de Tailwind restrito aos cards de estoque, sem Preflight. |
| [`scripts/build.mjs`](scripts/build.mjs) e [`sw.js`](sw.js) | Build com Vite e cache offline versionado, incluindo o CSS compilado. |
| [`test/`](test/) | Testes de domínio, IndexedDB emulado, restauração, build e cache offline. |

### Publicação

O [workflow de PR](.github/workflows/validar-pr.yml) roda os testes e o build para mudanças destinadas à `main`. O [workflow de publicação](.github/workflows/pages.yml) executa as verificações novamente e publica `dist/` no GitHub Pages após um push para `main`, inclusive o gerado pelo merge de um PR. Também pode ser iniciado manualmente em **Actions**. Revise a publicação antes de mesclar.

O build usa uma lista explícita de arquivos publicáveis. O `.gitignore` exclui as pastas de dados privados e os JSONs que não são metadados de dependências. A checagem detecta formatos de backup conhecidos, inclusive arquivos renomeados quando seu conteúdo ainda corresponde ao formato. Essas medidas reduzem o risco de inclusão acidental. Mantenha backups e dados de clientes fora do repositório e dos artefatos publicados.
