-- Banco Supabase já atualizado até 004_guesses_in_sessions.sql.
BEGIN;
ALTER TABLE game.game_sessions DROP CONSTRAINT game_sessions_attempts_check;
ALTER TABLE game.game_sessions
  ADD CONSTRAINT game_sessions_attempts_check CHECK (attempts BETWEEN 0 AND 5);

-- Partidas de hoje encerradas pela regra antiga ganham as duas tentativas novas.
UPDATE game.game_sessions g SET status='playing', finished_at=NULL
FROM game.daily_challenges d
WHERE d.id=g.daily_id AND d.day=(now() AT TIME ZONE 'America/Sao_Paulo')::date
  AND g.status='lost' AND g.attempts=3 AND NOT g.practice;

CREATE TABLE game.language_hints (
  language_id uuid PRIMARY KEY REFERENCES game.languages(id) ON DELETE CASCADE,
  description text NOT NULL CHECK (length(trim(description)) > 0)
);

INSERT INTO game.language_hints (language_id, description)
SELECT l.id, hints.description FROM game.languages l JOIN (VALUES
  ('C', 'Criada nos anos 1970 para software de sistemas, oferece acesso direto à memória e influenciou muitas linguagens posteriores.'),
  ('C#', 'Criada pela Microsoft no início dos anos 2000, combina orientação a objetos com o ecossistema .NET.'),
  ('C++', 'Surgiu como extensão de C e acrescentou classes; é muito usada quando desempenho e controle de recursos importam.'),
  ('Clojure', 'Dialeto moderno de Lisp que roda na JVM e favorece dados imutáveis e programação funcional.'),
  ('Dart', 'Criada pelo Google para aplicativos multiplataforma, ganhou destaque com o toolkit Flutter.'),
  ('Elixir', 'Criada sobre a máquina virtual Erlang, usa programação funcional para sistemas concorrentes e tolerantes a falhas.'),
  ('Erlang', 'Criada para telecomunicações, foi projetada para muitos processos simultâneos e alta disponibilidade.'),
  ('Go', 'Criada pelo Google, busca simplicidade de sintaxe e oferece concorrência com goroutines.'),
  ('Haskell', 'Linguagem funcional de tipagem estática conhecida por funções puras e avaliação preguiçosa.'),
  ('Java', 'Popularizada pela ideia de executar o mesmo programa em diferentes plataformas por meio de uma máquina virtual.'),
  ('JavaScript', 'Criada para dar interatividade a páginas web, hoje também é usada no servidor e em aplicativos.'),
  ('Julia', 'Voltada à computação científica, une sintaxe de alto nível com desempenho em cálculos numéricos.'),
  ('Kotlin', 'Criada pela JetBrains, é interoperável com Java e se tornou comum no desenvolvimento Android.'),
  ('Lua', 'Linguagem leve e incorporável, criada no Brasil e muito usada em jogos e sistemas extensíveis.'),
  ('Perl', 'Conhecida pelo processamento de texto e pela flexibilidade de suas expressões regulares.'),
  ('PHP', 'Nascida para páginas dinâmicas, tornou-se uma linguagem de servidor amplamente usada na web.'),
  ('Python', 'Criada com foco em legibilidade, usa indentação para estruturar blocos e serve a muitas áreas.'),
  ('R', 'Ambiente e linguagem voltados à estatística, análise de dados e visualização.'),
  ('Ruby', 'Criada no Japão com foco na produtividade do programador, tem sintaxe expressiva e orientada a objetos.'),
  ('Rust', 'Foca segurança de memória e desempenho, usando um sistema de posse para controlar recursos.'),
  ('Scala', 'Combina orientação a objetos e programação funcional sobre a máquina virtual Java.'),
  ('SQL', 'Linguagem declarativa usada para consultar e manipular dados em bancos relacionais.'),
  ('Swift', 'Criada pela Apple para seus aplicativos, combina tipagem estática com sintaxe moderna.'),
  ('TypeScript', 'Acrescenta tipagem estática ao JavaScript e é convertida para ele antes de executar.')
) AS hints(name, description) ON l.name=hints.name
ON CONFLICT (language_id) DO NOTHING;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON game.language_hints FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON game.language_hints FROM authenticated;
  END IF;
END $$;
INSERT INTO game.schema_migrations(name) VALUES ('005_five_attempts_and_hints.sql');
COMMIT;

