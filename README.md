# Cana Intelligence — Plataforma Operacional Sucroenergética

Plataforma profissional de inteligência operacional, gestão de indicadores industriais, balanço de massa e engenharia de dados desenvolvida para usinas do setor sucroenergético.

---

## 1. Visão Geral da Arquitetura

O **Cana Intelligence** é construído em uma arquitetura limpa, resiliente e segura:

- **Frontend**: React 19 + Vite 8 em SPA com Design System próprio orientado a operações industriais agro-tech (estética inspirada em padrões Apple e Awwwards, com tons de grafite, chumbo e verde cana `#205c3b`).
- **Backend**: API nativa em Node.js 24 (`node:http` e `node:crypto`) sem frameworks pesados ou desnecessários.
- **Armazenamento**: SQLite nativo de alta performance via `node:sqlite` (Node.js 22+) com WAL mode ativado e chaves estrangeiras estritas.
- **Isolamento Multi-Tenant**: Cada usina/organização possui isolamento criptográfico e relacional completo, identificado exclusivamente pela sessão autenticada no servidor.

---

## 2. Funcionalidades Principais

### 2.1 Inteligência Industrial e Monitoramento Operacional
- **Cadeia de Qualidade da Cana e ATR**: Acompanhamento analítico de Brix, Pol, Pureza e Açúcar Total Recuperável (fórmula Consecana padrão).
- **Extração e Moenda**: Supervisão de Pol do Bagaço, taxa de extração e perdas de sacarose.
- **Fermentação e Destilaria**: Monitoramento microbiológico de contaminação por ácido lático, viabilidade celular de leveduras e rendimento de conversão.
- **Tratamento de Paradas Operacionais**: Isolamento estatístico de paradas de moagem para não distorcer médias operacionais ponderadas.

### 2.2 Engenharia de Dados & Importação de Planilhas
- Suporte a estruturas de dados industriais:
  - `Fato_Medicoes`
  - `Dim_Indicador`
  - `Dim_Calendario`
  - `Auditoria_Dados`
  - `Pendencias_Validacao`
  - `Resumo_Qualidade`
- **Validação de Regras de Negócio**:
  - Detecção de escala de `UMIDADE_LAB` (tratamento de fração decimal sem dupla multiplicação).
  - Identificação de pendência técnica do indicador `TC` (Toneladas de Cana / Tempo de Ciclo) sem suposições precipitadas.
  - Rastreabilidade de valores originais vs. analíticos.
  - Relatório executivo de auditoria com taxa de conformidade e retenção de duplicidades.

### 2.3 Integração com Power BI
- Incorporação do dashboard por link público de publicação na web (`app.powerbi.com/view?r=...`). A aplicação também aceita URLs `reportEmbed` legadas com `reportId` e `ctid` válidos.
- Links públicos permitem que qualquer pessoa que os possua visualize o relatório; não use dados confidenciais nesse dashboard.
- Modos de visualização em foco e tela cheia (Fullscreen API).

### 2.4 CRUD Operacional Completo
- Gestão de Safras, Unidades Industriais, Equipamentos, Medições, Unidades de Medida e Tipos de Informação.
- Captura de fotos via câmera de dispositivo ou upload de imagem com validação de magic bytes (PNG, JPEG, WebP até 8 MB).

---

## 3. Requisitos e Inicialização

### Requisitos de Sistema
- **Node.js**: Versão 24.0.0 ou superior (confirmada compatibilidade com Node v24.14.0).
- **NPM**: 10+

### Instalação e Execução

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env

# 3. Iniciar o servidor da API (Porta 3001)
npm run server

# 4. Em outro terminal, iniciar o frontend Vite (Porta 5173 com proxy /api)
npm run dev
```

Abra seu navegador em `http://localhost:5173`.

---

## 4. Segurança e Confiabilidade

| Mecanismo | Implementação |
|---|---|
| **Sessão** | Cookies `HttpOnly`, `SameSite=Strict`, `Secure` (em produção), com expiração de 8 horas e limpeza periódica automática. |
| **CSRF** | Proteção por double-submit com hash SHA-256 verificado contra a sessão no servidor em todos os métodos mutantes (`POST`, `PUT`, `PATCH`, `DELETE`). |
| **Senhas** | Derivação com algoritmo `scrypt` e sal criptográfico aleatório de 16 bytes. |
| **Rate Limiting** | Bloqueio temporário (15 minutos) após 8 tentativas de autenticação incorretas. |
| **Cabeçalhos HTTP** | `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`. |
| **Multi-Tenancy** | Toda consulta, inserção e exclusão restringe `organization_id` validado pelo token de sessão. |

---

## 5. Suíte de Testes e Qualidade

O projeto conta com suíte automatizada de testes cobrindo rotas, banco, CRUD, autenticação, isolamento multi-tenant, sanitização e renderização:

```bash
# Executar todos os testes do frontend (Vitest / Testing Library)
npm test

# Executar testes de integração do servidor Node.js
npm run test:server

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

---

## 7. Camada visual (design system)

- **Tokens**: `src/index.css` concentra cores, tipografia, forma, movimento e medidas do shell (`--layout-header`, `--layout-sidebar`, `--layout-toolbar`). O arquivo é importado no entrypoint, antes dos componentes.
- **Componentes e estilos**: `src/App.css` consome apenas custom properties — sem valores brutos de cor ou espaçamento.
- **Tipografia**: Fraunces nos títulos editoriais, Space Grotesk na interface e DM Mono em rótulos técnicos e números.
- **Ícones**: `lucide-react`, usado no `MenuLateral`, no `Header` e no painel.
- **Shell preservado**: header de 68px, menu lateral de 270px e toolbar de 56px, com a mesma estrutura de navegação.
- **Visão geral**: faixa de KPIs com valor, unidade e critério de agregação; históricos de ATR e Pol do caldo com eixos, unidades e tabela equivalente; exceções do processo; e faixa de qualidade da base. Os dados vêm de `src/data/demo/operacao.js` e a tela é identificada como ambiente de demonstração.
- **Acessibilidade**: cada gráfico tem descrição (`role="img"` + `aria-label`) e tabela `.sr-only` com os registros; navegação com `aria-current`, botão do menu com `aria-expanded`/`aria-controls` e foco visível herdado dos tokens.
