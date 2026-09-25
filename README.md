# What Is The Syntax?

**What Is The Syntax?** é um jogo de navegador sobre linguagens de programação e conceitos de tecnologia. O objetivo principal é identificar a linguagem de um trecho de código exibido em uma interface inspirada em editores de código.

> Estado do projeto: planejamento.

## Como funciona

No **Desafio do Dia**, todos os jogadores recebem os mesmos desafios, distribuídos em três níveis:

| Nível | Critério |
| --- | --- |
| Fácil | Linguagens mais conhecidas e reconhecíveis |
| Médio | Linguagens menos familiares para parte do público |
| Difícil | Linguagens menos populares ou com sintaxes mais específicas |

O jogador observa o trecho de código e escolhe ou digita o nome da linguagem em uma caixa de seleção pesquisável. A resposta é validada pelo servidor. A interface apresenta o código com numeração de linhas e destaque de sintaxe, sem mostrar nomes de arquivos ou outras pistas que revelem a linguagem.

A dificuldade considera a familiaridade esperada do público com a linguagem e a clareza das pistas presentes no trecho. Cada desafio será revisado para evitar respostas ambíguas.

## Outros modos

### Siglas

Uma sigla da área de tecnologia é exibida, e o jogador informa seu significado por extenso. Exemplo: **SaaS → Software as a Service**.

### Linguagem pelo framework

O nome de um framework é exibido, e o jogador identifica a linguagem associada ao desafio. Exemplo: **Django → Python**. Frameworks que dependem de várias linguagens serão evitados ou terão respostas equivalentes previstas.

## Pontuação e ranking

A pontuação leva em conta a dificuldade, o tempo de resposta e o número de tentativas. O projeto terá dois rankings: **mensal** e **geral**.

É possível jogar sem conta, mas somente desafios realizados com o usuário conectado entram no ranking. O acesso com Google é a opção de login prioritária. Os modos de siglas e frameworks também poderão render pontos, com limites para impedir que a repetição da mesma pergunta gere pontuação ilimitada.

## Desafios anteriores

Os desafios de dias anteriores ficarão disponíveis em uma área de treino. Eles poderão ser refeitos livremente, sem alterar a pontuação ou os rankings.

## Integridade dos desafios

As respostas corretas e o cálculo dos pontos ficam no servidor. Cada desafio pontuável poderá ser concluído apenas uma vez por usuário. Os trechos de código serão escolhidos e revisados para oferecer pistas suficientes, sem depender de extensões de arquivo, nomes de projetos ou elementos da interface.

Os trechos são exibidos como conteúdo de leitura: o jogo não precisa executar código enviado pelos jogadores.

## Tecnologias previstas

- **Interface:** React
- **Validação e pontuação:** API em Node.js
- **Banco de dados:** PostgreSQL
- **Autenticação:** login com Google
- **Infraestrutura inicial:** hospedagem da interface e da API na Vercel, com PostgreSQL e autenticação no Supabase

A arquitetura poderá evoluir conforme o projeto for implementado e a demanda real dos jogadores for conhecida.
