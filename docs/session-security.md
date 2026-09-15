# Segurança da sessão web

O frontend web autentica por meio do cookie `hss_finance_session`, com `HttpOnly`,
`SameSite=Lax`, `Path=/` e `Secure` em produção. O backend continua aceitando JWT
Bearer. Quando os dois mecanismos são enviados, o header `Authorization` prevalece;
um Bearer inválido retorna 401 e nunca faz fallback silencioso para o cookie.

O logout remove o cookie do navegador, mas não revoga um JWT stateless já emitido.
Um token copiado ou usado como Bearer continua válido até sua expiração de uma hora.
O backend exige `NODE_ENV` igual a `development`, `test` ou `production`; em produção,
também exige HTTPS em `FRONTEND_ORIGIN` para evitar uma configuração incompatível
com o cookie `Secure`.

## CSRF

`SameSite=Lax` reduz o envio do cookie em requisições cross-site, mas não substitui
uma defesa CSRF em todos os cenários. O CORS aceita apenas a origem configurada em
`FRONTEND_ORIGIN` e envia credenciais somente para essa origem; CORS, isoladamente,
não impede toda requisição CSRF.

Enquanto frontend e API permanecerem same-site e o cookie usar `SameSite=Lax`, não
há token CSRF adicional neste slice. Validação estrita de `Origin` nas operações
mutáveis ou um token CSRF passa a ser obrigatória se a aplicação aceitar origens
não confiáveis, tiver endpoints mutáveis por navegação ou formulário simples, ou
migrar para `SameSite=None`. `SameSite=None` também exige `Secure` e HTTPS.

O logout público é a exceção consciente neste slice: um formulário cross-site pode
forçar a remoção do cookie e encerrar a sessão do usuário. O impacto é limitado à
perda da sessão local, sem alteração de dados financeiros. A proteção de `Origin`
deve ser adicionada antes de aceitar qualquer operação de negócio mutável por uma
requisição simples autenticada por cookie.

## Topologia de produção

`SameSite` compara sites, não origens. Em uma implantação com frontend em
`https://app.exemplo.com` e API em `https://api.exemplo.com`, as origens são
diferentes, mas os hosts pertencem ao mesmo site registrável e usam o mesmo esquema.
O cookie host-only definido pela API é enviado apenas para `api.exemplo.com`, e o
fluxo funciona com `SameSite=Lax`, `Secure`, `credentials: include` e CORS permitindo
explicitamente `https://app.exemplo.com`.

Quando frontend e API compartilham a mesma origem por reverse proxy, o fluxo também
funciona e não depende de CORS. Uma mudança de esquema, como frontend HTTPS e API
HTTP, deixa de ser same-site no modelo schemeful. Implantação em sites registráveis
diferentes exigiria `SameSite=None`, HTTPS e uma revisão explícita das defesas CSRF.
