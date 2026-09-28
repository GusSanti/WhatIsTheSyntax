# Hospedagem na Vercel

O `vercel.json` publica apenas `dist/web`. As rotas `/api/*` são encaminhadas para `api/index.ts`, que reutiliza a API Express sem iniciar um servidor persistente. O comando `npm run dev` continua usando o servidor local.

## Antes do deploy

1. Troque a senha do PostgreSQL se ela foi compartilhada fora do gerenciador de segredos. Copie uma nova URL em **Supabase → Connect → Transaction pooler** (porta 6543). O host e o usuário diferem da conexão direta. Codifique caracteres especiais da senha na URL.
2. Confirme que o banco tem as migrações até `006_score_by_attempt.sql`. Em um banco novo, use `database/supabase_manual_setup.sql`; em um banco já na versão 005, aplique `database/supabase_manual_score_by_attempt.sql` uma vez. Migrações não são executadas pela função durante uma requisição.
3. Publique seu catálogo e cinco desafios por dia em `game.daily_challenges`. A produção não carrega o seed demonstrativo.
4. Em **Supabase → Authentication → URL Configuration**, cadastre a URL HTTPS final como Site URL e Redirect URL para o login Google.

## Vercel

Importe a raiz do repositório. Se preencher os campos do painel, use **Build Command** `npm run build`, **Output Directory** `dist/web` e **Install Command** `npm install`. O `vercel.json` também fixa o diretório de saída e o roteamento. Não escolha `dist`: `dist/server` contém código privado.

Configure estas variáveis no ambiente **Production**:

| Nome                       | Valor                                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`             | Nova URL do Transaction pooler do Supabase                                                                                             |
| `DATABASE_SSL`             | `true`                                                                                                                                 |
| `DATABASE_CA_CERT`         | Conteúdo PEM completo do certificado baixado em Supabase → Database Settings → SSL Configuration                                       |
| `APP_ORIGIN`               | Opcional na Vercel: a função aceita a origem HTTPS do próprio host da requisição. Se usar, informe a origem principal sem barra final. |
| `SUPABASE_URL`             | URL HTTPS do projeto Supabase                                                                                                          |
| `SUPABASE_PUBLISHABLE_KEY` | Chave publicável do mesmo projeto                                                                                                      |
| `VISITOR_COOKIE_SECRET`    | Valor aleatório estável com ao menos 32 caracteres                                                                                     |
| `LOCAL_DEMO_AUTH`          | `false`                                                                                                                                |

Gere `VISITOR_COOKIE_SECRET` **no seu computador** com `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Copie o resultado diretamente para a variável da Vercel. Não o envie em mensagens nem o salve no repositório. O mesmo valor deve permanecer entre deploys, ou cookies de visitantes anteriores deixam de ser reconhecidos.

Não configure `PORT` nem um `DATABASE_CA_CERT_FILE` apontando para uma pasta do Windows. A função usa uma conexão de banco por instância, sem abrir conexões antecipadamente. O proxy da Vercel é considerado um salto para identificação de IP; seu `x-forwarded-for` é preenchido pela plataforma. A limitação de requisições atual é mantida por instância, não compartilhada globalmente.

Para Preview, use variáveis e URLs de redirecionamento próprias. A função valida envios `POST` contra o host HTTPS da própria implantação, incluindo URLs de Preview.

## Verificação

Antes de publicar, execute `npm run check` e `npm run test:e2e`. Após o deploy, confira `/api/health`, `/api/bootstrap`, envio de resposta, recarga da partida e login Google. `/api/health` deve retornar `{"status":"ok"}`. Confira também que `/server/index.js` não é público.

Se `/api/health` e `/api/bootstrap` retornarem 503, a função falhou ao inicializar. A resposta inclui um `code` sem credenciais; os detalhes ficam nos logs da função na Vercel:

| Código                                    | O que conferir                                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `CONFIG_DATABASE_URL`                     | Defina `DATABASE_URL` no ambiente do deploy.                                                          |
| `CONFIG_SUPABASE`                         | Defina `SUPABASE_URL` e a chave publicável.                                                           |
| `CONFIG_DATABASE_SSL`                     | Defina `DATABASE_SSL=true`.                                                                           |
| `CONFIG_VISITOR_SECRET`                   | Defina `VISITOR_COOKIE_SECRET` com 32 caracteres ou mais.                                             |
| `DATABASE_NETWORK`                        | Use a URL do **Transaction pooler** (porta 6543), pois a conexão direta do Supabase pode exigir IPv6. |
| `DATABASE_AUTH`                           | Confira usuário e senha da URL; o usuário do pooler inclui o identificador do projeto.                |
| `DATABASE_TLS`                            | Confira o certificado em `DATABASE_CA_CERT`. Não use um caminho local em `DATABASE_CA_CERT_FILE`.     |
| `DATABASE_SCHEMA` ou `DATABASE_MIGRATION` | Aplique as migrações no mesmo banco indicado por `DATABASE_URL`.                                      |
| `DATABASE_UNAVAILABLE`                    | Consulte o erro `Falha ao iniciar a API` nos logs da função.                                          |

Depois de corrigir as variáveis, faça um novo deploy: alterações nelas não modificam implantações anteriores.
