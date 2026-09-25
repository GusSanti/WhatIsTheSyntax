// Catálogo de DEMONSTRAÇÃO exclusivo do servidor. Nunca importar em web/ ou shared/.
// Para um jogo público, cadastre conteúdo inédito diretamente no banco privado.
import type { Database, Queryable } from './db.js';
import { gameDate, shiftDate, normalizeLanguage, normalizeAcronym } from './domain.js';

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
const aliases: Record<string, string[]> = {
  'C#': ['csharp', 'c sharp'],
  'C++': ['cpp', 'c plus plus'],
  JavaScript: ['js', 'java script'],
  TypeScript: ['ts', 'type script'],
  Python: ['py'],
  Ruby: ['rb'],
  Go: ['golang'],
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
    for (const name of languageNames) {
      await tx.query(
        'INSERT INTO game.languages (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
        [name],
      );
      const {
        rows: [language],
      } = await tx.query<{ id: string }>('SELECT id FROM game.languages WHERE name = $1', [name]);
      languageIds.set(name, language.id);
      for (const alias of [name, ...(aliases[name] || [])]) {
        await tx.query('INSERT INTO game.language_aliases VALUES ($1, $2) ON CONFLICT DO NOTHING', [
          normalizeLanguage(alias),
          language.id,
        ]);
      }
    }
    const addAnswer = async (challengeId: string, language?: string, text?: string) => {
      await tx.query(
        'INSERT INTO game.challenge_answers (challenge_id, language_id, normalized_text) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [
          challengeId,
          language ? languageIds.get(language) : null,
          text ? normalizeAcronym(text) : null,
        ],
      );
    };
    for (let offset = 0; offset < 8; offset++) {
      const day = shiftDate(gameDate(now), -offset);
      for (const difficulty of ['easy', 'medium', 'hard'] as const) {
        const key = `demo-${day}-${difficulty}`;
        const template = codeTemplates[difficulty][offset % 3];
        const n = 50 + (Number(day.replaceAll('-', '')) % 39);
        await tx.query(
          'INSERT INTO game.code_snippets (editorial_key, language_id, source_code) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [key, languageIds.get(template.language), template.code(n)],
        );
        const {
          rows: [snippet],
        } = await tx.query<{ id: string }>(
          'SELECT id FROM game.code_snippets WHERE editorial_key = $1',
          [key],
        );
        const challengeId = await addChallenge(tx, key, 'code', difficulty, null, snippet.id);
        if ('extra' in template && template.extra) await addAnswer(challengeId, template.extra);
        await tx.query(
          'INSERT INTO game.daily_challenges (day, slot, challenge_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [day, `code-${difficulty}`, challengeId],
        );
      }
      for (const mode of ['acronym', 'framework'] as const) {
        const [prompt, answer] = (mode === 'acronym' ? acronyms : frameworks)[offset];
        const id = await addChallenge(tx, `demo-${day}-${mode}`, mode, 'standard', prompt, null);
        await addAnswer(
          id,
          mode === 'framework' ? answer : undefined,
          mode === 'acronym' ? answer : undefined,
        );
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
  difficulty: string,
  prompt: string | null,
  snippetId: string | null,
) {
  await db.query(
    'INSERT INTO game.challenges (editorial_key, mode, difficulty, prompt, snippet_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
    [key, mode, difficulty, prompt, snippetId],
  );
  const {
    rows: [row],
  } = await db.query<{ id: string }>('SELECT id FROM game.challenges WHERE editorial_key = $1', [
    key,
  ]);
  return row.id;
}
