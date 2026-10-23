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

O catálogo de indicadores usa a rota `GET/POST /api/indicador` e as rotas `GET/PUT/DELETE /api/indicador/:id`. Em desenvolvimento, o Vite encaminha `/api` para `http://127.0.0.1:1880`, onde o Node-RED deve estar executando. Se a API estiver em outro endereço, copie `.env.example` para `.env` e ajuste `VITE_API_URL`.

O serviço valida respostas HTTP, aceita `204 No Content`, rejeita HTML ou JSON inválido e mostra mensagens úteis para falhas de rede. A tela de indicadores mantém busca, favoritos, edição, exclusão, menu dinâmico e painel incorporado.

O Power BI usa o link gerado por Publicar na Web recebido para esta atividade. Esse modo não exige login, mas torna o relatório público. Para dados reais ou um SaaS, substitua `VITE_POWERBI_PUBLIC_URL` por uma incorporação segura ou Power BI Embedded com autenticação e backend. O aplicativo oferece um botão para abrir o painel em nova aba caso o provedor bloqueie o iframe.

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
