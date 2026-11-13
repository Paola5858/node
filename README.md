# Cana Intelligence — Plataforma Operacional Sucroenergética

Plataforma profissional de inteligência operacional, gestão de indicadores industriais, balanço de massa e engenharia de dados desenvolvida para usinas do setor sucroenergético.

---

## 1. Visão Geral da Arquitetura

O **Cana Intelligence** é construído em uma arquitetura limpa, resiliente e segura:

- **Frontend**: React 19 + Vite 8 em SPA com Design System próprio orientado a operações industriais agro-tech (estética inspirada em padrões Apple e Awwwards, com tons de grafite, chumbo e verde cana `#205c3b`).
- **Backend**: API nativa em Node.js 24 (`node:http` e `node:crypto`) sem frameworks pesados ou desnecessários.
- **Persistência transacional**: PostgreSQL via `pg.Pool`, com migrations SQL versionadas em `server/migrations/` e ambientes isolados DEV, QAS e PRD.
- **Arquivos originais**: armazenamento S3 compatível (AWS S3 ou MinIO), usando chaves imutáveis e hash SHA-256; originais nunca são sobrescritos.
- **Isolamento e autorização**: políticas PostgreSQL RLS com `FORCE ROW LEVEL SECURITY` verificam organização, unidades/frentes e permissões RBAC; o backend também aplica departamento, módulo, ação e nível de acesso.

---

## 2. Funcionalidades Principais

### 2.1 Inteligência Industrial e Monitoramento Operacional
- **Cadeia de Qualidade da Cana e ATR**: Acompanhamento analítico de Brix, Pol, Pureza e Açúcar Total Recuperável (fórmula Consecana padrão).
- **Extração e Moenda**: Supervisão de Pol do Bagaço, taxa de extração e perdas de sacarose.
- **Fermentação e Destilaria**: Monitoramento microbiológico de contaminação por ácido lático, viabilidade celular de leveduras e rendimento de conversão.
- **Tratamento de Paradas Operacionais**: Isolamento estatístico de paradas de moagem para não distorcer médias operacionais ponderadas.

### 2.2 Engenharia de Dados & Importação de Planilhas
- Schemas PostgreSQL separados: `raw` (lotes e linhas brutas append-only), `operational` (cadastros e fatos tratados) e `analytics` (dimensões e fatos estrela). Medições tratadas mantêm originais, normalizados, regra e versão de processamento.
- Modelo estrela compartilhável entre Portal e Dashboard, com fatos de pesagem, análises, medições industriais, paradas, qualidade de importação e ocorrências.
- Fluxo de CSV/XLSX com SHA-256, bloqueio de reimportação silenciosa (409), reprocessamento versionado, escolha de aba, sugestão/edição de mapeamento e templates reutilizáveis por fonte.
- A prévia do servidor é obrigatória; somente a confirmação explícita coloca o lote na fila PostgreSQL. O mapeamento escolhe medições, cargas/pesagens ou análises de qualidade; o worker publica registros aceitos nas tabelas operacionais e fatos estrela correspondentes.
- Cargas exigem referência externa única, horário, peso bruto e tara: pesos iguais em cargas distintas são aceitos quando suas referências diferem. Análises relacionam amostra, indicador, método opcional e carga opcional.
- Cada linha bruta é preservada e classificada em exatamente uma fila: `Aceitos`, `Rejeitados`, `Suspeitos` ou `Pendentes`. Suspeitos e pendentes não são apagados.
- As validações cobrem estrutura, tipagem, unidades/escala, faixas homologadas, tempo, duplicidade, integridade referencial, coerência, rastreabilidade, sincronização de contingência e conciliação entre fontes. Não são inventados limites técnicos: faixas só são aplicadas quando houver regra homologada com limites explícitos.
- `UMIDADE_LAB` em fração decimal é normalizada uma vez para percentual; valor e unidade originais permanecem imutáveis.
- Portal e Dashboard leem as métricas separadas do fato analítico de qualidade de importação: completude, atraso da fonte, duplicidade, integridade referencial, reconhecimento de unidades, conciliação entre fontes e cobertura por indicador. Não há nota agregada.
- O CSV de auditoria contém somente linhas rejeitadas/suspeitas e seus motivos técnicos.

### 2.3 Integração com Power BI
- Incorporação do dashboard por link público de publicação na web (`app.powerbi.com/view?r=...`). A aplicação também aceita URLs `reportEmbed` legadas com `reportId` e `ctid` válidos.
- Links públicos permitem que qualquer pessoa que os possua visualize o relatório; não use dados confidenciais nesse dashboard.
- Modos de visualização em foco e tela cheia (Fullscreen API).

### 2.4 CRUD Operacional Completo
- Gestão de Safras, Unidades Industriais, Equipamentos, Medições, Unidades de Medida e Tipos de Informação.
- Captura de fotos via câmera de dispositivo ou upload de imagem com validação de magic bytes (PNG, JPEG, WebP até 8 MB).

### 2.5 Acesso organizacional
- Cada usuário tem departamento, nível de acesso e associações explícitas a unidades e frentes. Os níveis `operational`, `tactical` e `strategic` recebem permissões por módulo/ação.
- A alteração de escopo é restrita ao administrador da organização (`PATCH /api/admin/users/:id/access`). Liberações, homologações e fechamentos têm rotas próprias, trilha de auditoria e bloqueio de perfis operacionais/estagiários.
- Exportações e recuperação de originais passam pelo mesmo escopo de organização/unidade/frente. Registros fora do escopo retornam 404; tentativas de escrita sem permissão retornam 403.

---

## 3. Requisitos e Inicialização

### Requisitos de Sistema
- **Node.js**: Versão 24.0.0 ou superior (confirmada compatibilidade com Node v24.14.0).
- **NPM**: 10+

### Instalação e Execução

```bash
# 1. Instalar dependências
npm install

# 2. Copiar .env.example para .env e preencher DATABASE_URL_DEV
#    e as credenciais do bucket S3/MinIO.

# 3. Criar o banco PostgreSQL do ambiente DEV
#    As migrations versionadas são aplicadas automaticamente ao iniciar a API.

# 4. Iniciar o servidor da API (Porta 3001)
npm run server

# 5. Em outro terminal, iniciar o frontend Vite (Porta 5173 com proxy /api)
npm run dev
```

Abra seu navegador em `http://localhost:5173`.

### Ambientes e storage

`APP_ENV` aceita somente `DEV`, `QAS` ou `PRD` e seleciona exclusivamente a variável `DATABASE_URL_<APP_ENV>`. Não há fallback entre ambientes. Conexões PRD também exigem `ALLOW_PRD_DATABASE=true` no ambiente de produção. Use credenciais e bancos separados para DEV/QAS/PRD; não use os valores de exemplo fora de uma instalação local.

Para MinIO, configure `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_ACCESS_KEY` e `OBJECT_STORAGE_SECRET_KEY`. Para AWS S3, deixe o endpoint vazio e use a cadeia de credenciais da AWS. Configure versionamento e política de retenção no bucket; cada arquivo gravado recebe chave aleatória e SHA-256, e o banco mantém a referência/hash de lotes de importação. Nunca reutilize chaves para substituir objetos existentes. O worker assíncrono roda junto com a API e usa leases no PostgreSQL para recuperar jobs interrompidos.

Use uma credencial PostgreSQL dedicada à aplicação, sem `SUPERUSER` nem `BYPASSRLS`; mesmo com `FORCE ROW LEVEL SECURITY`, superusuários e roles com `BYPASSRLS` ignoram as políticas.

As migrations são aplicadas na inicialização dentro de transações e registradas em `schema_migrations`. Execute DEV e QAS antes de promover a mesma versão para PRD. O acesso a CLPs e bancos operacionais das usinas não é implementado: qualquer integração futura deve ler exclusivamente de staging explicitamente autorizado.

Medições/análises e linhas brutas importadas são append-only; correções devem gerar novo registro/processamento, nunca alterar o valor recebido. A migration cria o schema PostgreSQL e substitui o backend SQLite, mas não importa automaticamente o conteúdo histórico de `data/plume.sqlite`; mantenha a cópia original e execute uma conversão/validação dos dados antes do cutover de qualquer instalação que precise preservar esse histórico.

---

## 4. Segurança e Confiabilidade

| Mecanismo | Implementação |
|---|---|
| **Sessão** | Cookies `HttpOnly`, `SameSite=Strict`, `Secure` (em produção), com expiração de 8 horas e limpeza periódica automática. |
| **CSRF** | Proteção por double-submit com hash SHA-256 verificado contra a sessão no servidor em todos os métodos mutantes (`POST`, `PUT`, `PATCH`, `DELETE`). |
| **Senhas** | Derivação com algoritmo `scrypt` e sal criptográfico aleatório de 16 bytes. |
| **Rate Limiting** | Bloqueio temporário (15 minutos) após 8 tentativas de autenticação incorretas. |
| **Cabeçalhos HTTP** | `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`. |
| **RBAC + ABAC** | Middleware carrega organização, departamento, nível, unidades, frentes e permissões por módulo/ação; valida cada operação no backend. |
| **RLS** | Políticas restritivas combinam organização, unidade/frente, departamento e permissões configuradas na transação PostgreSQL; acessos cruzados de leitura ficam ocultos e escritas indevidas são negadas. |
| **Operações privilegiadas** | Estagiários/operacionais não homologam regras, aprovam liberações nem fecham períodos. Limites versionados e eventos de auditoria são append-only. |
| **Multi-Tenancy** | Operações de negócio filtram `organization_id` da sessão. Consultas de identidade/sessão pré-autenticação são limitadas a e-mail ou hash opaco do token. |

---

## 5. Suíte de Testes e Qualidade

O projeto conta com suíte automatizada de testes cobrindo rotas, banco, CRUD, autenticação, isolamento multi-tenant, sanitização e renderização:

```bash
# Executar todos os testes do frontend (Vitest / Testing Library)
npm test

# Executar testes do servidor e validações do schema/migrations
npm run test:server

# Para rodar a integração real de RLS, configure DATABASE_URL_DEV
# com um PostgreSQL DEV isolado antes de executar a suíte do servidor.

# Verificação estática de código (Linter Oxlint)
npm run lint

# Compilação de produção (Vite Build)
npm run build
```

---

## 6. Endpoints da API REST

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/health` | Healthcheck do serviço |
| `POST` | `/api/auth/register` | Cria organização e conta de responsável |
| `POST` | `/api/auth/login` | Inicia sessão com cookie HttpOnly e token CSRF |
| `GET` | `/api/auth/session` | Obtém dados da sessão e token CSRF atual |
| `POST` | `/api/auth/logout` | Encerra sessão e invalida cookie |
| `PATCH` | `/api/auth/profile` | Atualiza perfil (nome, foto e favoritos) |
| `GET / POST` | `/api/indicador` | Listagem e cadastro de indicadores Power BI |
| `GET / PUT / DELETE` | `/api/indicador/:id` | Consulta, edição e exclusão de indicador |
| `GET / POST` | `/api/cadastros/:tipo` | CRUD de safras, unidades, equipamentos, etc. |
| `GET / PUT / DELETE` | `/api/cadastros/:tipo/:id` | Operações por ID no escopo da organização |
| `GET` | `/api/imports/options` | Lista usinas, safras e fontes dentro do escopo autorizado |
| `POST` | `/api/imports` | Arquiva CSV/XLSX e registra lote/hash e tipo (`measurements`, `loads` ou `quality_analyses`); retorna 409 se o mesmo arquivo/tipo já existir; limite de 9 MB |
| `POST` | `/api/imports/:id/preview` | Seleciona aba e retorna cabeçalho, amostra e sugestão de mapeamento |
| `POST` | `/api/imports/:id/confirm` | Persiste template opcional e confirma processamento assíncrono |
| `GET` | `/api/imports/:id` | Consulta estado, filas e métricas separadas do lote |
| `GET` | `/api/imports/:id/rows?queue=Pendentes` | Consulta linhas preservadas de uma fila com paginação limitada |
| `GET` | `/api/imports/quality` | Lista qualidade de importações do fato analítico compartilhado |
| `GET` | `/api/imports/:id/report.csv` | Baixa erros/suspeitos com motivos técnicos |
| `GET` | `/api/imports/:id/original` | Recupera o original apenas com permissão de exportação e escopo autorizado |
| `GET` | `/api/exports/:tipo` | Exporta registros do módulo no escopo permitido |
| `POST` | `/api/admin/users` | Cria usuário operacional/tático/estratégico com escopo inicial |
| `PATCH` | `/api/admin/users/:id/access` | Altera departamento, nível, papel, unidades e frentes do usuário |
| `POST` | `/api/releases/measurements/:id` | Registra aprovação tática/estratégica de medição |
| `POST` | `/api/releases/quality-analyses/:id` | Registra aprovação tática/estratégica de análise |
| `POST` | `/api/rules` | Cria regra técnica em rascunho com limites explícitos |
| `POST` | `/api/rules/:id/homologate` | Homologa regra técnica com justificativa e auditoria |
| `POST` | `/api/periods/:harvestId/close` | Fecha uma versão imutável do período/safra |

---

## 7. Camada visual (design system)

- **Tokens**: `src/index.css` concentra cores, tipografia, forma, movimento e medidas do shell (`--layout-header`, `--layout-sidebar`, `--layout-toolbar`). O arquivo é importado no entrypoint, antes dos componentes.
- **Componentes e estilos**: `src/App.css` consome apenas custom properties — sem valores brutos de cor ou espaçamento.
- **Tipografia**: Fraunces nos títulos editoriais, Space Grotesk na interface e DM Mono em rótulos técnicos e números.
- **Ícones**: `lucide-react`, usado no `MenuLateral`, no `Header` e no painel.
- **Shell preservado**: header de 68px, menu lateral de 270px e toolbar de 56px, com a mesma estrutura de navegação.
- **Visão geral**: faixa de KPIs com valor, unidade e critério de agregação; históricos de ATR e Pol do caldo com eixos, unidades e tabela equivalente; exceções do processo; e faixa de qualidade da base. Os dados vêm de `src/data/demo/operacao.js` e a tela é identificada como ambiente de demonstração.
- **Acessibilidade**: cada gráfico tem descrição (`role="img"` + `aria-label`) e tabela `.sr-only` com os registros; navegação com `aria-current`, botão do menu com `aria-expanded`/`aria-controls` e foco visível herdado dos tokens.
