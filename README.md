# Plume

Aplicação React/Vite para indicadores e cadastros operacionais. A API Node.js e o armazenamento SQLite deste repositório são executáveis localmente para desenvolvimento e validação. O Node-RED externo existente não é alterado e seus dados não são importados automaticamente.

## Requisitos e inicialização

- Node.js 24 ou superior (`node:sqlite` é usado pela API).
- Dependências instaladas com `npm install`.
- Se ainda não houver `.env`, copie `.env.example`. Se já existir, acrescente ou ajuste as chaves necessárias sem substituir configurações existentes.
- Inicie `npm run server` em um terminal.
- Inicie `npm run dev` em outro terminal. O Vite encaminha `/api` para a API local em `127.0.0.1:3001`.

O banco é criado em `data/plume.sqlite` na primeira inicialização. Essa pasta é ignorada pelo Git. O servidor aceita `DATABASE_PATH=:memory:` para testes isolados. Para visualizar uma build, use `npm run build` e sirva `dist/` por uma hospedagem configurada para encaminhar `/api` ao servidor.

## API local

| Método e rota | Uso |
| --- | --- |
| `POST /api/auth/register` | Cria uma organização isolada e seu primeiro usuário responsável. |
| `POST /api/auth/login` | Valida e-mail e senha e cria uma sessão. |
| `GET /api/auth/session` | Retorna a sessão e o token CSRF da sessão, se autenticada. |
| `POST /api/auth/logout` | Invalida a sessão no banco e apaga os cookies. |
| `PATCH /api/auth/profile` | Atualiza nome, foto e favoritos da conta autenticada. |
| `GET/POST /api/indicador` | Lista ou cria indicadores da organização atual. |
| `GET/PUT/DELETE /api/indicador/:id` | Consulta, edita ou exclui um indicador da organização atual. |
| `GET/POST /api/cadastros/:tipo` | Lista ou cria safra, unidade, equipamento, medição, unidade de medida ou tipo de informação. |
| `GET/PUT/DELETE /api/cadastros/:tipo/:id` | Consulta, edita ou exclui um registro da organização atual. |

Operações de escrita exigem cookie de sessão e `X-CSRF-Token`. O navegador obtém o token por `GET /api/auth/session`; os serviços do frontend o enviam automaticamente. A organização é sempre inferida da sessão do servidor, nunca do payload. IDs de outras organizações retornam 404. Relações de equipamento, medição e tipo de informação são verificadas no mesmo escopo antes da escrita, e exclusões com dependências retornam 409.

O primeiro cadastro cria uma organização separada e um usuário `owner`; não há senha padrão nem adesão automática a uma organização existente. Senhas são derivadas com scrypt e salt aleatório. Os identificadores de sessão são aleatórios, ficam armazenados em hash e usam cookies `HttpOnly`, `SameSite=Strict` e `Secure` quando `NODE_ENV=production`. O token CSRF usa double-submit validado também contra o hash guardado na sessão. Login e criação de organização têm limite por IP dentro do processo. Favoritos ficam no perfil da conta, separados por usuário, e são removidos ao excluir o indicador.

Fotos PNG, JPEG e WebP até 8 MB são armazenadas no SQLite como data URL para manter o exemplo autocontido. Para cargas maiores ou implantação empresarial, use armazenamento de objetos privado e escaneamento de arquivos.

## Power BI

`POWERBI_DEFAULT_EMBED_URL` em `.env` configura o relatório `reportEmbed` exibido no catálogo das novas organizações. O valor inicial fornecido para o dashboard mobile está em `.env.example`. A API aceita somente HTTPS em `app.powerbi.com/reportEmbed`, com `reportId` e `ctid` no formato GUID. O modo de foco expande o relatório; tela cheia usa a Fullscreen API. `iframe load` confirma apenas o carregamento do documento, não a autorização do relatório.

Esse endereço não é um token de incorporação nem uma autorização do Plume. A URL fornecida usa o fluxo de incorporação autenticada do Power BI e cada consumidor ainda precisa ter acesso permitido pelo Microsoft Power BI. Para um SaaS com usuários externos sem conta Microsoft, falta configurar um aplicativo Microsoft Entra/service principal, permissões do workspace, capacidade/licenciamento e geração de embed token no backend com identidade efetiva e RLS. Nenhuma credencial Microsoft foi inventada ou colocada no frontend. Não use links `Publish to web` com dados privados.

O API Node-RED que já existia em `127.0.0.1:1880` foi consultado somente por GET; a resposta continha uma URL `/view?r=` pública. Não foi feita escrita, migração ou substituição de dados nesse serviço. A nova API restringe indicadores a URLs de incorporação `reportEmbed`; portanto os registros do Node-RED não são compatíveis com o novo contrato e permanecem intactos no sistema externo.

## Limites de implantação

O backend é uma base executável de instância única para desenvolvimento e validação, com SQLite local. O limitador de login é em memória e precisa ser substituído por armazenamento compartilhado em produção com múltiplas instâncias. Ainda não há pipeline de migração/backup gerenciado, recuperação de senha, convite de usuários, papéis configuráveis, logs de auditoria persistentes, armazenamento privado de fotos, configuração de proxy TLS ou integração real com Microsoft Graph/Power BI REST. O endpoint de registro cria uma organização nova por solicitação; não é um fluxo de convite de usuário para clientes existentes.

O Node-RED anterior tem somente leitura comprovada nesta sessão. Nenhum cadastro dele foi copiado para o SQLite. A existência do banco local não prova backup, alta disponibilidade ou persistência em infraestrutura externa.

## Verificações

```bash
npm test
npm run test:server
npm run lint
npm run build
git diff --check
```
