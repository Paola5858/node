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
