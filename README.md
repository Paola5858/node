# Projeto Front

## Comandos do projeto

```bash
npm install
npm run dev
npm test
npm run lint
npm run build
```

Os testes do fluxo de cadastro ficam em `src/pages/CadastroPage.test.jsx`. Variaveis de ambiente para integracoes devem ser documentadas em `.env.example` e usar o prefixo `VITE_`.

## Integração de indicadores

O catálogo de indicadores usa `GET/POST /api/indicador` e `GET/PUT/DELETE /api/indicador/:id`, conforme a documentação existente do frontend. O GET foi observado respondendo JSON em `http://127.0.0.1:1880/api/indicador` durante esta execução. O fluxo Node-RED e os métodos de escrita não estão neste repositório; persistência de CRUD, autenticação e autorização não foram comprovadas. Em desenvolvimento, o Vite encaminha `/api` para essa instância local.

O serviço valida respostas HTTP, aceita `204 No Content`, rejeita HTML ou JSON inválido e mantém o timeout durante a leitura do corpo. A tela de indicadores mantém busca, favoritos, edição, exclusão, menu dinâmico e painel incorporado.

Não configure um link de Publicar na Web para relatórios privados: a Microsoft informa que qualquer pessoa na internet pode ver o relatório sem autenticação ([documentação](https://learn.microsoft.com/en-us/power-bi/collaborate-share/service-publish-to-web)). Use incorporação segura do Power BI ou Embedded com backend e credenciais geridas no servidor. Não há URL de relatório padrão no código. O navegador não permite ao Plume confirmar que o conteúdo interno de um iframe remoto está funcional.

## Autenticação e persistência pendentes

O frontend não armazena mais senhas nem considera uma sessão do Web Storage válida. Ao iniciar, remove somente o campo de senha em texto puro de um perfil legado, preservando os demais campos que conseguir ler. As telas de acesso usam o contrato preparado `/api/auth/session`, `/api/auth/login`, `/api/auth/register` e `/api/auth/logout`; esses endpoints não existem no backend inspecionado, portanto o acesso permanece bloqueado até a implementação de sessão no servidor. O servidor precisa usar hash de senha, cookie `HttpOnly`, política `SameSite`/`Secure`, proteção CSRF, limitação de tentativas e autorização em cada endpoint. Não há código de backend ou banco neste repositório para implementar ou comprovar essas garantias.

Os formulários de cadastro de domínio não simulam sucesso. Como não foram encontrados endpoints nem fluxos Node-RED para essas entidades, eles informam que o registro não foi salvo. Dados demonstrativos do dashboard permanecem identificados no código e não são tratados como leituras reais da operação.

Antes de testar o CRUD, publique o fluxo do Node-RED e confirme que `http://127.0.0.1:1880/api/indicador` retorna uma lista JSON.

## Organizacao

- `src/pages/`: telas completas da aplicacao.
- `src/layouts/`: componentes de composicao estrutural, como cabecalho e menu lateral.
- `src/components/`: componentes de interface reutilizaveis.
- `.github/workflows/ci.yml`: valida testes, lint e build em pushes para `main` e pull requests.

---

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
