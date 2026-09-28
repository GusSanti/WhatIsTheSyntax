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

| Nome | Valor |
| --- | --- |
| `DATABASE_URL` | Nova URL do Transaction pooler do Supabase |
| `DATABASE_SSL` | `true` |
| `DATABASE_CA_CERT` | Conteúdo PEM completo do certificado baixado em Supabase → Database Settings → SSL Configuration |
| `APP_ORIGIN` | Origem pública exata, por exemplo `https://meu-site.vercel.app`, sem barra final |
| `SUPABASE_URL` | URL HTTPS do projeto Supabase |
| `SUPABASE_PUBLISHABLE_KEY` | Chave publicável do mesmo projeto |
| `VISITOR_COOKIE_SECRET` | Valor aleatório estável com ao menos 32 caracteres |
| `LOCAL_DEMO_AUTH` | `false` |

Gere `VISITOR_COOKIE_SECRET` **no seu computador** com `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Copie o resultado diretamente para a variável da Vercel. Não o envie em mensagens nem o salve no repositório. O mesmo valor deve permanecer entre deploys, ou cookies de visitantes anteriores deixam de ser reconhecidos.

Não configure `PORT` nem um `DATABASE_CA_CERT_FILE` apontando para uma pasta do Windows. A função usa uma conexão de banco por instância, sem abrir conexões antecipadamente. O proxy da Vercel é considerado um salto para identificação de IP; seu `x-forwarded-for` é preenchido pela plataforma. A limitação de requisições atual é mantida por instância, não compartilhada globalmente.

Para Preview, use variáveis e URLs de redirecionamento próprias. `APP_ORIGIN` precisa corresponder à origem exata de cada implantação; se Preview reutilizar o valor de Production, envios `POST` serão rejeitados.

## Verificação

Antes de publicar, execute `npm run check` e `npm run test:e2e`. Após o deploy, confira `/api/health`, `/api/bootstrap`, envio de resposta, recarga da partida e login Google. `/api/health` deve retornar `{"status":"ok"}`. Se a função retornar 503, consulte seus logs na Vercel; a inicialização verifica as variáveis e a migração 006. Confira também que `/server/index.js` não é público.
