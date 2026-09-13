# CLAUDE.md

Orientações para o Claude Code trabalhar neste projeto (hss-finance).

## Estado atual do projeto

O projeto está na fundação do monorepo com npm workspaces. A stack planejada é
Node.js 24 LTS, TypeScript, Express, PostgreSQL, TypeORM e Jest no backend, e React,
TypeScript e Vite no frontend. Os projetos `backend` e `frontend` ainda não
foram configurados; não presuma que dependências ou funcionalidades planejadas
já estejam implementadas.

## Princípios gerais de trabalho

- **Não altere arquivos sem necessidade.** Mudanças devem ser escopadas
  estritamente ao que foi pedido. Não aproveite a tarefa para refatorar,
  reformatar ou "melhorar" código não relacionado.
- **Prefira mudanças pequenas e verificáveis.** Divida tarefas grandes em
  passos incrementais que possam ser revisados e testados isoladamente.
- **Nunca considere uma tarefa concluída sem rodar os testes** relevantes
  (unitários, integração, e2e — o que existir no projeto). Se não houver
  testes automatizados para a área alterada, diga isso explicitamente em vez
  de presumir que está tudo certo.
- **Não faça commit ou push sem autorização explícita do usuário**, mesmo que
  a mudança pareça pequena ou óbvia. Peça confirmação antes de qualquer
  operação que afete o histórico do git ou repositórios remotos.
- **Cuidado com migrations e banco de dados.** Migrations são operações
  potencialmente destrutivas e difíceis de reverter em produção. Nunca rode
  uma migration contra um banco real sem confirmação explícita, revise
  cuidadosamente `up`/`down`, e prefira mudanças aditivas e reversíveis.
- **Segurança em APIs é prioridade.** Trate toda entrada externa como não
  confiável, valide payloads, não exponha stack traces ou dados sensíveis em
  respostas de erro, e siga o princípio do menor privilégio em autenticação e
  autorização.
- **TypeScript estrito quando aplicável.** Se/quando o projeto usar
  TypeScript, mantenha `strict: true` no `tsconfig.json`. Evite `any` sem
  justificativa explícita em comentário — prefira tipos concretos, genéricos
  ou `unknown` com narrowing.

## Uso de skills

As skills abaixo já estão instaladas neste ambiente e devem ser usadas de
forma **contextual** — ou seja, apenas quando a tarefa realmente envolver a
área correspondente, e apenas se a tecnologia associada já existir (ou vier a
existir) no projeto. Nunca invoque uma skill apenas por estar na lista.

### Backend Node/TypeScript

Quando o backend for Node.js/TypeScript:

- `node` — boas práticas gerais de Node.js/TypeScript moderno.
- `nodejs-core` — apenas se o trabalho envolver internals do próprio Node.js.
- `typescript-magician` — para tipos genéricos complexos, remoção de `any`,
  type guards e problemas de inferência.
- `fastify-best-practices` — apenas se o framework do backend for Fastify.
- `linting-neostandard-eslint9` — para configurar/ajustar ESLint v9 e
  neostandard.

### APIs

Ao projetar, documentar, mockar, proteger ou testar endpoints:

- `api-designer` — desenho de novos endpoints REST.
- `api-documentation` — geração de documentação a partir de endpoints/specs
  existentes.
- `api-mock-helper` — mocks, sandboxes e fixtures para desenvolvimento/teste.
- `api-security-auth-pattern` — padrões de autenticação/autorização (OAuth,
  JWT, RBAC, rate limiting, etc.).
- `api-to-testcase-generator` — geração de casos de teste a partir de
  specs/endpoints.

### Banco de dados

- `supabase-postgres-best-practices` — carregar **antes** de qualquer mudança
  em schema, migrations, RLS, índices, queries ou diagnóstico de performance,
  caso o projeto use Postgres/Supabase.

### Testes

- `vitest-skill` — testes unitários/integração se o projeto usar Vitest.
- `playwright-skill` — testes end-to-end/browser se o projeto usar
  Playwright.

### CI/CD

- `cicd-pipeline-skill` — configuração de pipelines (GitHub Actions, Jenkins,
  GitLab CI, Azure DevOps).

### Integrações e agentes

- `mcp-builder` — ao construir servidores MCP para integrar serviços
  externos.

### Frontend

- `ui-ux-pro-max` — decisões de UI/UX, design system, acessibilidade,
  responsividade.
- `impeccable` — auditoria/polimento de interfaces já existentes.

### Arquitetura e documentação visual

- `diagram-design` — diagramas de arquitetura, fluxos, ER, sequência, etc.

### Textos e documentação

- `humanizer` — revisão de textos para reduzir "tom de IA" em documentação,
  changelogs, PRs e comunicação escrita.

## Economia de tokens com RTK

Este ambiente utiliza RTK (Rust Token Killer) para reduzir saídas extensas de comandos antes que elas sejam enviadas ao contexto do agente.

- Verifique silenciosamente se o comando `rtk` está disponível antes de utilizá-lo.
- Quando disponível, prefira RTK para comandos suportados com saídas potencialmente extensas, especialmente Git, buscas, testes, lint, TypeScript, npm, Prisma e Docker.
- Se a integração automática do agente estiver ativa, execute os comandos normalmente e permita que o hook ou plugin faça a reescrita.
- Se a integração automática não estiver ativa, use explicitamente os comandos equivalentes do RTK quando forem adequados.
- Não reinstale o RTK e não execute `rtk init` automaticamente.
- A ausência do RTK não deve bloquear nenhuma tarefa; utilize os comandos normais como fallback.
- Não use RTK quando a saída integral for necessária para diagnóstico.
- Nunca esconda erros, falhas de testes, stack traces relevantes ou informações necessárias para validar a tarefa.
- Quando solicitado pelo usuário, apresente as estatísticas disponíveis por meio de `rtk gain`.

## Checklist antes de considerar uma tarefa concluída

1. A mudança está restrita ao escopo pedido (sem edições desnecessárias)?
2. Os testes relevantes foram executados e passaram? Se não existem testes
   para a área alterada, isso foi comunicado ao usuário?
3. Alguma migration ou mudança de schema foi revisada com cuidado extra e
   confirmada com o usuário antes de ser aplicada?
4. Endpoints novos/alterados foram revisados quanto a validação de entrada,
   autenticação/autorização e vazamento de dados sensíveis?
5. Tipos `any` foram evitados ou, se necessários, justificados?
6. Nenhum commit ou push foi feito sem autorização explícita do usuário?
