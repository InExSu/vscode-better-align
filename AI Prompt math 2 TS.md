# TS Structural Alignment Engine

Реализуй deterministic idempotent structural code alignment engine на TypeScript.

Архитектура:
- pure functions
- hierarchical FSM
- no hidden mutable state
- no recursive formatting passes
- no regex-based alignment
- guard clauses instead of nested if/else
- one responsibility per function
- deterministic output
- mathematically idempotent

══════════════════════════════════════════════════════════════════
1. ОСНОВНАЯ ИДЕЯ
══════════════════════════════════════════════════════════════════

Выравнивание НЕ глобальное.

Код разбивается на ЛОКАЛЬНЫЕ БЛОКИ строк.

Блок = максимальная непрерывная последовательность строк,
имеющих одинаковый вектор признаков.

Выравнивание выполняется ТОЛЬКО внутри блока.

Пустые строки разрывают блок.

Строка с отличным вектором признаков:
- завершает текущий блок
- сама образует singleton block
- singleton block НЕ выравнивается

Алгоритм обязан быть:

F(F(x)) = F(x)

То есть строго идемпотентным.

Повторный запуск не должен:
- добавлять пробелы
- смещать колонки
- изменять spacing
- изменять tail
- изменять alignment widths

══════════════════════════════════════════════════════════════════
2. ПРИЗНАКИ СТРОКИ
══════════════════════════════════════════════════════════════════

Пусть:

P = alphabet of alignment anchors

Например:

[
  '===',
  '!==',
  '<=>',
  '=>',
  '->',
  '==',
  '!=',
  '>=',
  '<=',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '**=',
  ':',
  '=',
  ',',
]

Для строки f:

V(f) = ordered vector of matched anchors

Жадный поиск:
- left-to-right
- longest-match-first
- non-overlapping

Пример:

line:
a: b = c

V(line):
[':', '=']

Ключ блока:

K(f) = serialize(V(f))

Например:

[':', '=']
→ ":\0="

══════════════════════════════════════════════════════════════════
3. DEPTH TRACKING
══════════════════════════════════════════════════════════════════

Alignment anchors разрешены ТОЛЬКО на structural top-level.

Нельзя выравнивать anchors внутри:

- ()
- []
- <>
- nested type literals
- nested object literals
- generic parameter lists

Нужен structural depth tracker:

{
  braceDepth,
  parenDepth,
  bracketDepth,
  angleDepth
}

Anchor считается valid iff:

parenDepth   == 0
bracketDepth == 0
angleDepth   == 0

ВАЖНО:

braceDepth НЕ запрещает alignment.

Иначе невозможно выравнивание object fields:

{
  a: number
  bb: string
}

Но nested braces должны работать:

{
  x: { a: 1; bb: 2 }
}

Здесь:
- x: выравнивается
- a: и bb: НЕ выравниваются

══════════════════════════════════════════════════════════════════
4. BLOCK SPLITTING
══════════════════════════════════════════════════════════════════

Input:

f1
f2
f3
...

FSM:

WaitingForBlock
AccumulatingBlock

Rules:

empty line:
- flush current block

same vector:
- append to current block

different vector:
- flush current block
- start singleton/new block

Singleton blocks:
- preserved exactly as-is

══════════════════════════════════════════════════════════════════
5. КАНОНИЧЕСКАЯ МОДЕЛЬ
══════════════════════════════════════════════════════════════════

Главный принцип:

Alignment НЕ может зависеть
от spacing предыдущего прохода.

Нельзя использовать:
- текущие колонки
- текущие пробелы
- positions from previously aligned text

Иначе возникает drift.

Поэтому перед измерением widths
каждый segment canonicalized.

══════════════════════════════════════════════════════════════════
6. SEGMENT MODEL
══════════════════════════════════════════════════════════════════

Для anchor_j:

segment_j consists of:

[key_j][anchor_j][value_j][sep_j][after_j]

Где:

key_j:
- text between previous anchor and current anchor
- trim()
- canonicalized

value_j:
- text after anchor_j
- until first separator from seps
- OR until next anchor
- trim()

sep_j:
- separator itself
- preserved

after_j:
- everything after separator
- trim()

tail:
- everything after last anchor
- preserved EXACTLY

══════════════════════════════════════════════════════════════════
7. WIDTH MEASUREMENT
══════════════════════════════════════════════════════════════════

For every column j independently:

W_key[j] =
max length(key_j)

W_val[j] =
max length(value_j)

Measured ONLY from canonicalized segments.

NOT from rendered spacing.

══════════════════════════════════════════════════════════════════
8. CANONICAL RENDERING
══════════════════════════════════════════════════════════════════

Render rule:

padEnd(key_j, W_key[j])
+ anchor_j
+ ' '
+ padEnd(value_j, W_val[j])
+ sep_j
+ after_j

Important:

Exactly ONE space after anchor.

Never preserve previous alignment spacing.

Spacing before anchor determined ONLY by padEnd.

Therefore rendering is canonical.

══════════════════════════════════════════════════════════════════
9. IDEMPOTENCE
══════════════════════════════════════════════════════════════════

The algorithm MUST satisfy:

Align(Align(x)) == Align(x)

for ALL valid inputs.

This is mandatory.

Implementation MUST NOT:
- accumulate spaces
- shift anchors
- widen columns on repeated execution

══════════════════════════════════════════════════════════════════
10. STRINGS AND COMMENTS
══════════════════════════════════════════════════════════════════

Anchors inside:
- strings
- template literals
- comments

must be ignored.

Need masking/sanitization phase.

Masked regions:
- preserve length
- replaced with sentinel chars

This guarantees stable positions.

══════════════════════════════════════════════════════════════════
11. FSM ARCHITECTURE
══════════════════════════════════════════════════════════════════

Required FSM hierarchy:

MAIN FSM

blocks_Split
→ blocks_Process
→ result_Emit

BLOCK FSM

measure_Widths
→ render_Lines

PIPELINE FSM

Idle
→ LoadConfig
→ DetectLanguage
→ FindBlocks
→ ParseLines
→ Align
→ ReplaceText
→ Done

══════════════════════════════════════════════════════════════════
12. FUNCTIONAL REQUIREMENTS
══════════════════════════════════════════════════════════════════

Every function:
- pure
- deterministic
- single responsibility

No hidden side effects.

No mutation of input arrays.

No regex-only parsing.

No nested formatting passes.

No AST parser.

Use lightweight structural scanning.

══════════════════════════════════════════════════════════════════
13. REQUIRED TESTS
══════════════════════════════════════════════════════════════════

Must include tests for:

1. idempotence

2. nested object literals

3. generic parameters

4. comments

5. strings

6. singleton blocks

7. empty line block splitting

8. multiple alignment columns

9. separators

10. mixed anchors

══════════════════════════════════════════════════════════════════
14. REQUIRED EXAMPLE
══════════════════════════════════════════════════════════════════

INPUT:

export type LanguageRules = {
    lineComments: string[]
    blockComments: { start: string; end: string }[]
    stringDelimiters: string[]
    alignChars: string[]
}

OUTPUT:

export type LanguageRules = {
    lineComments    : string[]
    blockComments   : { start: string; end: string }[]
    stringDelimiters: string[]
    alignChars      : string[]
}

Repeated alignment MUST produce identical output.

══════════════════════════════════════════════════════════════════
15. IMPLEMENTATION STYLE
══════════════════════════════════════════════════════════════════

TypeScript only.

No external dependencies.

Strong typing required.

Prefer:

type aliases
readonly data
small composable functions
explicit state machines

Avoid:
- giant functions
- implicit state
- formatting heuristics
- unstable spacing logic

Output:
FULL WORKING CODE ONLY.
NO EXPLANATION.