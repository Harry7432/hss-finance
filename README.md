# HSS Finance

**Household Financial Management**

HSS Finance é uma aplicação full stack para organizar as finanças de uma casa ou família.
O produto busca substituir controles financeiros fragmentados por uma visão mensal
compartilhada, sem perder a identificação de quem realizou cada movimentação.

## Visão do produto

Cada pessoa terá sua própria conta e poderá participar de um `Household` com outros
membros. A família poderá registrar receitas, despesas e contas da casa, acompanhar
pendências e consultar uma visão consolidada da saúde financeira mensal.

## MVP planejado

- Cadastro e autenticação de usuários.
- Criação de casas ou famílias.
- Participação de vários usuários no mesmo `Household`.
- Registro de receitas e despesas.
- Organização por categorias financeiras.
- Controle de contas pagas, pendentes e vencidas.
- Dashboard financeiro mensal.
- Filtros por período, usuário e categoria.
- Contas recorrentes.
- Relatórios e indicadores básicos de saúde financeira.

## Stack planejada

### Backend

- Node.js 24 LTS e TypeScript.
- Express.
- PostgreSQL com TypeORM.
- Jest.
- JWT em uma etapa futura.

### Frontend

- React e TypeScript, com Vite.
- Vitest e React Testing Library.

### Infraestrutura e qualidade

- npm workspaces.
- Docker Compose com PostgreSQL local.
- ESLint e Prettier.
- Variáveis de ambiente.
- Git e GitHub.
- Integração contínua em uma etapa futura.

## Estrutura inicial

```text
hss-finance/
|-- backend/       # API Node.js e Express
|-- frontend/      # Aplicação React e Vite
|-- .editorconfig
|-- .gitignore
|-- .nvmrc
|-- .prettierignore
|-- .prettierrc
|-- package.json
`-- README.md
```

O backend deverá evoluir com a separação `Route -> Controller -> Service -> Repository ->
TypeORM -> PostgreSQL`.

## Estado atual

O projeto está na etapa de fundação do monorepo. O backend possui uma API mínima com
health check, e o frontend possui uma tela inicial testada para validar React, TypeScript
e Vite. O dashboard e as funcionalidades financeiras ainda não foram implementados.

## Desenvolvimento

1. Use a versão do Node.js indicada em `.nvmrc` (Node.js 24 LTS).
2. Execute `npm install` na raiz.
3. Execute `npm run frontend:dev` para iniciar o frontend.

### PostgreSQL local

Docker Desktop, ou Docker Engine com o plugin Compose, é necessário para o banco local.
A porta padrão no host é `5433`, pois `5432` pode estar ocupada por outros projetos.

- `npm run docker:up`: inicia somente o PostgreSQL.
- `npm run docker:status`: consulta o estado do serviço.
- `npm run docker:logs`: exibe os logs do PostgreSQL.
- `npm run docker:stop`: para o serviço sem remover seu volume.

O Compose aceita `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER` e
`POSTGRES_PASSWORD`. Os defaults são exclusivos para desenvolvimento. O backend utiliza
`DATABASE_URL` e `DATABASE_LOGGING`, documentados em `backend/.env.example`.

Depois de iniciar o PostgreSQL, execute `npm run dev --workspace backend` para iniciar a
API conectada ao banco. `GET /api/health` verifica somente se a API está viva;
`GET /api/health/ready` também verifica a conexão com o PostgreSQL.

O volume nomeado `hss-finance-postgres-data` preserva os dados quando o serviço é parado.
Entities e migrations ainda não existem, e o TypeORM está com sincronização automática
desabilitada.

### Qualidade do frontend

- `npm run frontend:typecheck`: verifica os tipos TypeScript.
- `npm run frontend:lint`: executa o ESLint.
- `npm run frontend:test`: executa os testes.
- `npm run frontend:test:coverage`: executa os testes com cobertura.
- `npm run frontend:build`: gera o build de produção.
- `npm run frontend:preview`: serve localmente o build gerado.

A tela atual existe apenas para validar a fundação técnica. Dashboard, autenticação,
integração com a API e recursos de gestão financeira serão implementados em etapas
futuras.

## Open Finance

A integração com Open Finance será iniciada somente depois da conclusão e validação do
MVP com lançamentos manuais. A primeira integração será desenvolvida contra um ambiente
Sandbox/Mockbank antes de qualquer conexão com dados financeiros reais.
