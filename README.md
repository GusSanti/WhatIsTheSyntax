# What Is The Syntax?

**Um código. Cinco tentativas. Uma nova descoberta todos os dias.**

What Is The Syntax? é um jogo de navegador sobre linguagens de programação e conceitos de tecnologia. Observe o código, reconheça as pistas e descubra a linguagem por trás dele.

> Primeira versão funcional para revisão local. O catálogo incluído é demonstrativo; a publicação e a conexão com os serviços externos ainda dependem de configuração.

## Os desafios

| Modo           | Como jogar                                                            | Dificuldade            |
| -------------- | --------------------------------------------------------------------- | ---------------------- |
| Desafio do dia | Identifique a linguagem a partir de um trecho de código.              | Fácil, médio e difícil |
| Siglas         | Escreva o significado completo de uma sigla de tecnologia, em inglês. | Única                  |
| Frameworks     | Descubra a linguagem associada ao framework apresentado.              | Única                  |
| Arquivo        | Refaça desafios anteriores, sem pontuação.                            | Todos os níveis        |

Cada edição reúne cinco desafios: três de código, um de siglas e um de frameworks. Todos recebem a mesma edição. A troca de dia acontece à meia-noite no fuso `America/Sao_Paulo`.

O código aparece em um editor de leitura com numeração de linhas, destaque visual e rolagem horizontal. A seleção de linguagens permite pesquisar, digitar nomes ou usar abreviações reconhecidas.

## Pontos e ranking

É possível jogar sem conta. Para pontuar, o jogador precisa estar conectado ao jogar. Cada desafio diário concede pontos uma única vez, considerando dificuldade e número de tentativas.

- **Ranking mensal:** resultados da edição de cada mês.
- **Ranking geral:** soma dos resultados de todas as edições.
- **Treino:** tentativas ilimitadas por meio de novas partidas, sem alterar os rankings.

O login com Google está integrado ao Supabase Auth e requer a configuração do provedor. Em desenvolvimento, uma conta identificada como demonstração permite experimentar o ranking local.
Cada jogador conectado pode escolher seu nome público no cabeçalho ou no ranking. A foto da conta Google aparece no perfil e na classificação; a pontuação continua associada ao identificador da conta, mesmo após mudar o nome.

## Uma interface feita para observar

- Layout adaptado a computadores e celulares.
- Editor sem extensão de arquivo, identificação de linguagem ou metadados de gabarito.
- Cinco tentativas por partida, com histórico e feedback individual. Após três erros em código ou frameworks, uma dica da linguagem é exibida.
- Botão para seguir ao próximo desafio da edição após cada acerto.
- Retomada de partidas preservando as tentativas.
- Compartilhamento de resultados sem a resposta.
- Arquivo com as últimas 30 edições publicadas.
- Ranking com dados reais do ambiente, sem jogadores fictícios.

## Como foi construída

| Camada                | Tecnologias                                          |
| --------------------- | ---------------------------------------------------- |
| Interface             | React, TypeScript, Vite, CSS e Lucide                |
| Servidor              | Node.js, Express e Zod                               |
| Dados                 | PostgreSQL, consultas parametrizadas e migrações SQL |
| Desenvolvimento local | PGlite executado exclusivamente no servidor          |
| Autenticação externa  | Supabase Auth com Google                             |
| Verificação           | Testes de domínio/API e Playwright                   |

O React apresenta os desafios e envia as respostas. O servidor verifica a identidade do jogador, compara a resposta com o gabarito privado, controla as tentativas e calcula a pontuação. O banco registra partidas, respostas e eventos de pontos em transações.

Os gabaritos não fazem parte do pacote da interface. O catálogo de nomes usado no dropdown é público, mas sua relação com cada desafio permanece privada. O destaque de sintaxe usa categorias visuais genéricas e não identifica a linguagem no navegador.

## Estado da primeira versão

Os três modos, o arquivo, os rankings e a persistência local estão implementados. O catálogo inicial contém 40 desafios distribuídos em oito edições demonstrativas. Sua dificuldade é editorial e ainda precisa ser calibrada com jogadores.

A integração remota com PostgreSQL/Supabase está preparada. O login Google e a hospedagem pública ainda precisam ser configurados e verificados com as credenciais do projeto. Um painel de administração e um catálogo inédito de produção não fazem parte desta entrega.

O conteúdo de demonstração está no repositório para facilitar a revisão. As perguntas de um ranking público devem ser mantidas em um catálogo privado e revisado antes de sua publicação.

## Arquitetura

O [mapa do projeto](docs/ARQUITETURA.md) descreve as pastas, as tabelas, o fluxo de validação, a proteção dos gabaritos e as regras de pontuação.

## Referências de experiência

A organização em edições diárias, treino e ranking foi inspirada em [Hipótle](https://hipotle.com.br/). [Termo](https://term.ooo/), [Contexto](https://contexto.me/pt/) e [Magnitudle](https://magnitudle.com/size-it-up) também serviram como referências de jogos com desafios curtos e recorrentes. A identidade visual e a implementação deste projeto são próprias.
