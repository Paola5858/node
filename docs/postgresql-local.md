# PostgreSQL local no Windows

Este guia explica como instalar e operar o PostgreSQL usado pelo Cana Intelligence em desenvolvimento local. Os comandos assumem PostgreSQL 17 instalado pelo instalador oficial via `winget` e o serviço `postgresql-x64-17`.

> Use este ambiente apenas para desenvolvimento. Não reutilize as senhas e credenciais de exemplo em QAS ou produção. Nunca compartilhe nem versione o arquivo `.env`.

## 1. Instalar

Abra o PowerShell ou Prompt de Comando:

```powershell
winget search PostgreSQL
winget install --id PostgreSQL.PostgreSQL.17 --exact
```

Durante a instalação, o assistente pode pedir uma senha para o usuário administrador `postgres`. Essa senha é independente da senha do usuário da aplicação.

Confirme o serviço. Abra o PowerShell como administrador se precisar iniciá-lo:

```powershell
Get-Service postgresql-x64-17
Start-Service postgresql-x64-17
```

Para parar ou reiniciar:

```powershell
Stop-Service postgresql-x64-17
Restart-Service postgresql-x64-17
```

## 2. Criar o usuário e o banco da aplicação

Abra o `psql` usando a senha administrativa `postgres`. No Prompt de Comando:

```cmd
"%ProgramFiles%\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -p 5432 -d postgres
```

No PowerShell:

```powershell
& "$env:ProgramFiles\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -p 5432 -d postgres
```

No prompt `postgres=#`, verifique se o usuário e o banco já existem:

```sql
SELECT rolname FROM pg_roles WHERE rolname = 'cana_dev';
SELECT datname FROM pg_database WHERE datname = 'cana_dev';
```

Se as consultas não retornarem linhas, crie os objetos que faltam:

```sql
CREATE ROLE cana_dev LOGIN PASSWORD 'cana_dev';
CREATE DATABASE cana_dev OWNER cana_dev;
\q
```

Se um deles já existir, não repita o respectivo comando `CREATE`. Se for necessário alterar a senha do usuário da aplicação:

```sql
\password cana_dev
\q
```

Atualize também a senha em `DATABASE_URL_DEV` no `.env`, usando o formato:

```text
postgresql://cana_dev:SENHA@localhost:5432/cana_dev
```

Use uma senha que não contenha caracteres reservados de URL, ou codifique-os antes de colocá-la na URL. O usuário `cana_dev` é para a aplicação; não configure a aplicação para conectar como superusuário `postgres`.

## 3. Senha esquecida do administrador `postgres`

Se não souber a senha de `postgres`, é possível redefini-la com acesso local temporário. Faça isso apenas no computador de desenvolvimento.

1. Abra como administrador o arquivo:

   ```text
   C:\Program Files\PostgreSQL\17\data\pg_hba.conf
   ```

2. No início do arquivo, antes de outras regras `host`, acrescente temporariamente:

   ```text
   host    postgres    postgres    127.0.0.1/32    trust
   host    postgres    postgres    ::1/128         trust
   ```

   Essas regras permitem conexão sem senha somente ao banco `postgres`, como usuário `postgres`, pela própria máquina.

3. Reinicie o serviço e conecte:

   ```powershell
   Restart-Service postgresql-x64-17
   & "$env:ProgramFiles\PostgreSQL\17\bin\psql.exe" -U postgres -h 127.0.0.1 -d postgres
   ```

4. No `psql`, defina uma senha nova. Digite-a duas vezes:

   ```sql
   \password postgres
   \q
   ```

5. **Remova as duas regras temporárias `trust` de `pg_hba.conf`**, salve o arquivo e reinicie o serviço:

   ```powershell
   Restart-Service postgresql-x64-17
   ```

6. Confirme que a nova senha funciona:

   ```powershell
   & "$env:ProgramFiles\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d postgres
   ```

Nunca deixe as regras `trust` no arquivo. Se o caminho do arquivo for diferente, consulte a configuração ativa conectando ao banco e executando `SHOW hba_file;`.

## 4. Configurar o projeto

O `.env` precisa estar na **raiz do projeto**, ao lado de `package.json` — não dentro da pasta `data`.

Na raiz do repositório, se o arquivo ainda não existir:

```powershell
Copy-Item .env.example .env
```

O valor de desenvolvimento padrão da conexão é:

```text
APP_ENV=DEV
DATABASE_URL_DEV=postgresql://cana_dev:cana_dev@localhost:5432/cana_dev
```

Ele corresponde ao usuário/banco criados acima. `.env` é ignorado pelo Git; mantenha nele somente valores locais e não o envie em commits ou mensagens.

## 5. Iniciar e parar o Cana Intelligence

Inicie PostgreSQL e, em seguida, a API a partir da raiz do projeto:

```powershell
Set-Location 'C:\Users\AlunoDev25\Downloads\Paola Node\node'
Start-Service postgresql-x64-17
npm run server
```

Na primeira inicialização, a API aplica as migrations ao banco. Aguarde a mensagem:

```text
Plume API pronta em http://127.0.0.1:3001
```

Deixe esse terminal aberto. Em outro terminal, inicie a interface:

```powershell
Set-Location 'C:\Users\AlunoDev25\Downloads\Paola Node\node'
npm run dev
```

Para encerrar cada processo, pressione `Ctrl+C` no terminal correspondente. Para desligar o serviço PostgreSQL quando não estiver usando:

```powershell
Stop-Service postgresql-x64-17
```

O MinIO configurado no `.env` é usado em operações de armazenamento de arquivos, como importações. O PostgreSQL, por si só, não inicia o MinIO.

## 6. Diagnóstico rápido

| Mensagem | Causa provável | Ação |
|---|---|---|
| `.env not found` | O comando foi executado fora da raiz do projeto, ou o arquivo não existe. | Volte à pasta do projeto; confira `Test-Path .env` e copie `.env.example` se necessário. |
| `DATABASE_URL_DEV não foi configurada` | `.env` não foi carregado ou não define a variável. | Confira `APP_ENV=DEV` e `DATABASE_URL_DEV` no `.env` da raiz. |
| `ECONNREFUSED` em `localhost:5432` | O serviço está parado ou não está ouvindo na porta padrão. | Confira `Get-Service postgresql-x64-17` e inicie-o. |
| `password authentication failed` | Senha, usuário ou `pg_hba.conf` não correspondem. | Teste a conexão administrativa; redefina a senha seguindo a seção 3 e confira a URL do `.env`. |
| `database "cana_dev" does not exist` | O banco da aplicação ainda não foi criado. | Crie `cana_dev` seguindo a seção 2. |
| Erro ao executar `CREATE ROLE`/`CREATE DATABASE` | O usuário ou banco pode já existir. | Consulte as duas queries da seção 2 e crie apenas o que estiver ausente. |
