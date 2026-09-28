// Catálogo de DEMONSTRAÇÃO exclusivo do servidor. Nunca importar em web/ ou shared/.
// Para um jogo público, cadastre conteúdo inédito diretamente no banco privado.
import type { Database, Queryable } from './db.js';
import { gameDate, shiftDate } from './domain.js';

const languageNames = [
  'C',
  'C#',
  'C++',
  'Clojure',
  'Dart',
  'Elixir',
  'Erlang',
  'Go',
  'Haskell',
  'Java',
  'JavaScript',
  'Julia',
  'Kotlin',
  'Lua',
  'Perl',
  'PHP',
  'Python',
  'R',
  'Ruby',
  'Rust',
  'Scala',
  'SQL',
  'Swift',
  'TypeScript',
];
const languageHints: Record<string, string> = {
  C: 'Criada nos anos 1970 para software de sistemas, oferece acesso direto à memória e influenciou muitas linguagens posteriores.',
  'C#': 'Criada pela Microsoft no início dos anos 2000, combina orientação a objetos com o ecossistema .NET.',
  'C++': 'Surgiu como extensão de C e acrescentou classes; é muito usada quando desempenho e controle de recursos importam.',
  Clojure: 'Dialeto moderno de Lisp que roda na JVM e favorece dados imutáveis e programação funcional.',
  Dart: 'Criada pelo Google para aplicativos multiplataforma, ganhou destaque com o toolkit Flutter.',
  Elixir: 'Criada sobre a máquina virtual Erlang, usa programação funcional para sistemas concorrentes e tolerantes a falhas.',
  Erlang: 'Criada para telecomunicações, foi projetada para muitos processos simultâneos e alta disponibilidade.',
  Go: 'Criada pelo Google, busca simplicidade de sintaxe e oferece concorrência com goroutines.',
  Haskell: 'Linguagem funcional de tipagem estática conhecida por funções puras e avaliação preguiçosa.',
  Java: 'Popularizada pela ideia de executar o mesmo programa em diferentes plataformas por meio de uma máquina virtual.',
  JavaScript: 'Criada para dar interatividade a páginas web, hoje também é usada no servidor e em aplicativos.',
  Julia: 'Voltada à computação científica, une sintaxe de alto nível com desempenho em cálculos numéricos.',
  Kotlin: 'Criada pela JetBrains, é interoperável com Java e se tornou comum no desenvolvimento Android.',
  Lua: 'Linguagem leve e incorporável, criada no Brasil e muito usada em jogos e sistemas extensíveis.',
  Perl: 'Conhecida pelo processamento de texto e pela flexibilidade de suas expressões regulares.',
  PHP: 'Nascida para páginas dinâmicas, tornou-se uma linguagem de servidor amplamente usada na web.',
  Python: 'Criada com foco em legibilidade, usa indentação para estruturar blocos e serve a muitas áreas.',
  R: 'Ambiente e linguagem voltados à estatística, análise de dados e visualização.',
  Ruby: 'Criada no Japão com foco na produtividade do programador, tem sintaxe expressiva e orientada a objetos.',
  Rust: 'Foca segurança de memória e desempenho, usando um sistema de posse para controlar recursos.',
  Scala: 'Combina orientação a objetos e programação funcional sobre a máquina virtual Java.',
  SQL: 'Linguagem declarativa usada para consultar e manipular dados em bancos relacionais.',
  Swift: 'Criada pela Apple para seus aplicativos, combina tipagem estática com sintaxe moderna.',
  TypeScript: 'Acrescenta tipagem estática ao JavaScript e é convertida para ele antes de executar.',
};
const codeTemplates = {
  easy: [
    {
      language: 'JavaScript',
      extra: 'TypeScript',
      code: (n: number) =>
        `const scores = [${n}, 42, 18, 95, 63];\n\nconst findHighlights = (values) => {\n  return values\n    .filter((value) => value >= 40)\n    .map((value) => ({\n      score: value,\n      label: \`Level \${Math.floor(value / 10)}\`\n    }));\n};\n\nconst highlights = findHighlights(scores);\n\nfor (const item of highlights) {\n  console.log(\`\${item.label}: \${item.score}\`);\n}`,
    },
    {
      language: 'Python',
      code: (n: number) =>
        `scores = [${n}, 42, 18, 95, 63]\n\ndef find_highlights(values):\n    return [\n        {"score": value, "level": value // 10}\n        for value in values\n        if value >= 40\n    ]\n\nhighlights = find_highlights(scores)\n\nfor item in highlights:\n    print(f"Level {item['level']}: {item['score']}")`,
    },
    {
      language: 'C#',
      code: (n: number) =>
        `using System;\nusing System.Linq;\n\nclass Challenge\n{\n    static void Main()\n    {\n        int[] scores = { ${n}, 42, 18, 95, 63 };\n        var highlights = scores.Where(x => x >= 40);\n\n        foreach (var score in highlights)\n        {\n            Console.WriteLine($"Score: {score}");\n        }\n    }\n}`,
    },
  ],
  medium: [
    {
      language: 'Ruby',
      code: (n: number) =>
        `scores = [${n}, 42, 18, 95, 63]\n\ndef find_highlights(values)\n  values.select { |value| value >= 40 }\n        .map do |value|\n          { score: value, level: value / 10 }\n        end\nend\n\nhighlights = find_highlights(scores)\n\nhighlights.each do |item|\n  puts "Level #{item[:level]}: #{item[:score]}"\nend`,
    },
    {
      language: 'Go',
      code: (n: number) =>
        `package main\n\nimport "fmt"\n\nfunc main() {\n    scores := []int{${n}, 42, 18, 95, 63}\n    highlights := make([]int, 0)\n\n    for _, score := range scores {\n        if score >= 40 {\n            highlights = append(highlights, score)\n        }\n    }\n\n    fmt.Println(highlights)\n}`,
    },
    {
      language: 'Rust',
      code: (n: number) =>
        `fn main() {\n    let scores = vec![${n}, 42, 18, 95, 63];\n\n    let highlights: Vec<_> = scores\n        .iter()\n        .filter(|&&value| value >= 40)\n        .map(|&value| (value, value / 10))\n        .collect();\n\n    for (score, level) in highlights {\n        println!("Level {}: {}", level, score);\n    }\n}`,
    },
  ],
  hard: [
    {
      language: 'Julia',
      code: (n: number) =>
        `function find_highlights(values::Vector{Int})\n    selected = filter(x -> x >= 40, values)\n\n    return map(selected) do value\n        (score = value, level = value ÷ 10)\n    end\nend\n\nscores = [${n}, 42, 18, 95, 63]\nhighlights = find_highlights(scores)\n\nfor item in highlights\n    println("Level $(item.level): $(item.score)")\nend`,
    },
    {
      language: 'Haskell',
      code: (n: number) =>
        `module Main where\n\nhighlights :: [Int] -> [(Int, Int)]\nhighlights values =\n    [ (value, value \`div\` 10)\n    | value <- values\n    , value >= 40\n    ]\n\nmain :: IO ()\nmain = do\n    let scores = [${n}, 42, 18, 95, 63]\n    mapM_ print (highlights scores)`,
    },
    {
      language: 'Elixir',
      code: (n: number) =>
        `defmodule Highlights do\n  def select(values) do\n    values\n    |> Enum.filter(&(&1 >= 40))\n    |> Enum.map(fn value ->\n      %{score: value, level: div(value, 10)}\n    end)\n  end\nend\n\n[${n}, 42, 18, 95, 63]\n|> Highlights.select()\n|> Enum.each(&IO.inspect/1)`,
    },
  ],
};
const acronyms = [
  ['SaaS', 'Software as a Service'],
  ['API', 'Application Programming Interface'],
  ['SQL', 'Structured Query Language'],
  ['HTTP', 'Hypertext Transfer Protocol'],
  ['IDE', 'Integrated Development Environment'],
  ['OOP', 'Object Oriented Programming'],
  ['ORM', 'Object Relational Mapping'],
  ['SDK', 'Software Development Kit'],
];
const frameworks = [
  ['Django', 'Python'],
  ['Laravel', 'PHP'],
  ['Rails', 'Ruby'],
  ['Gin', 'Go'],
  ['Phoenix', 'Elixir'],
  ['Flutter', 'Dart'],
  ['Rocket', 'Rust'],
  ['FastAPI', 'Python'],
];

export async function seedDemo(db: Database, now = new Date()) {
  await db.transaction(async (tx) => {
    const languageIds = new Map<string, string>();
    const difficultyByLanguage = new Map<string, string>();
    for (const difficulty of ['easy', 'medium', 'hard'] as const)
      for (const template of codeTemplates[difficulty])
        difficultyByLanguage.set(template.language, difficulty);
    for (const name of languageNames) {
      await tx.query(
        'INSERT INTO game.languages (name,difficulty) VALUES ($1,$2) ON CONFLICT (name) DO UPDATE SET difficulty=EXCLUDED.difficulty',
        [name, difficultyByLanguage.get(name) || 'medium'],
      );
      const {
        rows: [language],
      } = await tx.query<{ id: string }>('SELECT id FROM game.languages WHERE name = $1', [name]);
      languageIds.set(name, language.id);
      await tx.query(
        'INSERT INTO game.language_hints (language_id,description) VALUES ($1,$2) ON CONFLICT (language_id) DO UPDATE SET description=EXCLUDED.description',
        [language.id, languageHints[name]],
      );
    }
    for (let offset = 0; offset < 8; offset++) {
      const day = shiftDate(gameDate(now), -offset);
      for (const difficulty of ['easy', 'medium', 'hard'] as const) {
        const key = `demo-${day}-${difficulty}`;
        const template = codeTemplates[difficulty][offset % 3];
        const n = 50 + (Number(day.replaceAll('-', '')) % 39);
        await tx.query(
          'INSERT INTO game.code_snippets (editorial_key, language_id, source_code, accepted_language_names) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
          [key, languageIds.get(template.language), template.code(n), 'extra' in template && template.extra ? [template.extra] : []],
        );
        const {
          rows: [snippet],
        } = await tx.query<{ id: string }>(
          'SELECT id FROM game.code_snippets WHERE editorial_key = $1',
          [key],
        );
        const challengeId = await addChallenge(tx, key, 'code', snippet.id, null, null);
        await tx.query(
          'INSERT INTO game.daily_challenges (day, slot, challenge_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [day, `code-${difficulty}`, challengeId],
        );
      }
      for (const mode of ['acronym', 'framework'] as const) {
        const [prompt, answer] = (mode === 'acronym' ? acronyms : frameworks)[offset];
        let frameworkId: string | null = null;
        let acronymId: string | null = null;
        if (mode === 'framework') {
          const { rows: [row] } = await tx.query<{ id: string }>(
            'INSERT INTO game.frameworks(name,language_id) VALUES ($1,$2) ON CONFLICT (name) DO UPDATE SET language_id=EXCLUDED.language_id RETURNING id',
            [prompt, languageIds.get(answer)],
          );
          frameworkId = row.id;
        } else {
          const { rows: [row] } = await tx.query<{ id: string }>(
            'INSERT INTO game.acronyms(acronym,definition) VALUES ($1,$2) ON CONFLICT (acronym) DO UPDATE SET definition=EXCLUDED.definition RETURNING id',
            [prompt, answer],
          );
          acronymId = row.id;
        }
        const id = await addChallenge(tx, `demo-${day}-${mode}`, mode, null, frameworkId, acronymId);
        await tx.query(
          'INSERT INTO game.daily_challenges (day, slot, challenge_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [day, mode, id],
        );
      }
    }
  });
}

async function addChallenge(
  db: Queryable,
  key: string,
  mode: string,
  snippetId: string | null,
  frameworkId: string | null,
  acronymId: string | null,
) {
  await db.query(
    'INSERT INTO game.challenges (editorial_key, mode, snippet_id, framework_id, acronym_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
    [key, mode, snippetId, frameworkId, acronymId],
  );
  const {
    rows: [row],
  } = await db.query<{ id: string }>('SELECT id FROM game.challenges WHERE editorial_key = $1', [
    key,
  ]);
  return row.id;
}
