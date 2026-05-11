## 📁 СТРУКТУРА ПРОЕКТА
- **Разделение на два файла** — `src/extension.ts` (эффекты, VS Code API) и `src/fsm_Main.ts` (чистые функции, логика)

```
src/
├── extension.ts          # Взаимодействие с VS Code, _Decor функции, activate/deactivate
└── fsm_Main.ts           # Чистые функции, FSM a_FSM_Main, типы, утилиты
```

---

## 📁 Стиль наименования

### Имена функций:
- `noun_Verb` — объект_Действие (например, `block_Find`, `lines_Parse`)

### Переменные — венгерская нотация:
- буква или несколько букв — признак типа, затем `_`, затем название с заглавной буквы
- например: `i_Counter`, `b_HasMarkers`, `s_Line`, `a_Lines`

---

## 📁 extension.ts — Эффект-оболочка

- Содержит только `_Decor` функции (каждая с `@effect` JSDoc)
- Содержит `rwd`, `a_Chain`, `NS` тип, `activate`/`deactivate`
- Импортирует чистые функции из `fsm_Main.ts`
- **Запрещена любая бизнес-логика** — только вызовы pure-функций и работа с VS Code API

## 📁 fsm_Main.ts — Чистое ядро

- Содержит **главный конечный автомат** `a_FSM_Main`
- Содержит все `pure` функции: `lines_Sanitize`, `chars_FindGreedy`, `map_BuildRaw`, `map_Normalize`, `lines_Align` и др.
- Содержит типы (`AlignToken`, `AlignColumn`, `FSMContext`, `FSMResult`), константы (`LANGUAGE_RULES`), утилиты
- **Запрещён импорт `vscode`** — никаких эффектов, только чистая детерминированная логика

---

## 🎯 ГЛАВНЫЙ АВТОМАТ: a_FSM_Main

Это **единственная экспортируемая функция** из `fsm_Main.ts`, которую вызывает цепочка `_Decor` функций.

```typescript
export interface FSMContext {
  lines: string[];
  alignChars: string[];
  preserveStrings: boolean;
  preserveComments: boolean;
}

export interface FSMResult {
  alignedLines: string[];
  changesApplied: boolean;
}

export function a_FSM_Main(ctx: FSMContext): FSMResult {
  // Состояния:
  //   block_Find      — найти следующий блок строк для выравнивания
  //   lines_Sanitize  — создать «чистую» копию строк (маскировка не-кода)
  //   chars_Scan      — найти признаки в каждой строке, построить сырую карту
  //   map_Normalize   — нормализовать карту: общий префикс колонок, максимальные позиции
  //   lines_Align     — применить карту к оригинальным строкам
  //   result_Emit     — вернуть результат

  type State = 'block_Find' | 'lines_Sanitize' | 'chars_Scan' | 'map_Normalize' | 'lines_Align' | 'result_Emit';
  let state: State = 'block_Find';

  outerLoop: while (true) {
    switch (state) {
      case 'block_Find':     state = block_Find(ctx);     break;
      case 'lines_Sanitize': state = lines_Sanitize_State(ctx); break;
      case 'chars_Scan':     state = chars_Scan(ctx);     break;
      case 'map_Normalize':  state = map_Normalize_State(ctx);  break;
      case 'lines_Align':    state = lines_Align_State(ctx);    break;
      case 'result_Emit':    break outerLoop;
    }
  }

  return { alignedLines: ctx.lines, changesApplied: false };
}
```

**Требования к `a_FSM_Main`:**
- Классический switch FSM Шалыто: `while(true) switch(state)`
- Имена состояний: `noun_Verb`
- Тип `State` — union всех состояний; компилятор предупреждает о необработанных
- В каждом `case` — вызов одной функции SRP, возвращающей следующее состояние
- Выход из цикла — `break outerLoop`
- Функция детерминирована: одинаковый вход → одинаковый выход

---

## 🗺️ ПОСТРОЕНИЕ КАРТЫ ВЫРАВНИВАНИЯ

### Шаг 1 — `lines_Sanitize`: маскировка не-кода

Создаётся копия каждой строки, в которой символы **не относящиеся к коду** заменяются на `\0` (ASCII 0):

- строковые литералы (`"..."`, `'...'`, `` `...` ``)
- однострочные комментарии (`//...`, `#...`)
- многострочные комментарии (`/* ... */`)

Оригинальные строки остаются нетронутыми — маскированная копия используется **только для поиска признаков**.

```
оригинал:  let x = "hello=world"; // set x
маска:     let x = \0\0\0\0\0\0\0\0\0\0\0  \0\0\0\0\0\0
```

---

### Шаг 2 — `chars_Scan`: построение сырой карты признаков

Проход по маскированным строкам. Для каждой строки строится упорядоченный список `AlignToken[]`.

**Жадный поиск (greedy):** длинные признаки имеют приоритет над короткими подстроками.  
`=>` перекрывает `=` и `>`; `===` перекрывает `==` и `=`.

```typescript
export interface AlignToken {
  s_Char: string;   // найденный признак
  i_Pos: number;    // позиция в строке
}
```

Пример сырой карты (`AlignToken[][]`) для трёх строк:

```
строка 0: [{ s_Char:"=", i_Pos:6  }, { s_Char:"{", i_Pos:10 }, { s_Char:":", i_Pos:19 }, { s_Char:"(", i_Pos:32 }]
строка 1: [{ s_Char:"=", i_Pos:7  }, { s_Char:"{", i_Pos:10 }, { s_Char:":", i_Pos:19 }, { s_Char:"=", i_Pos:31 }]
строка 2: [{ s_Char:"=", i_Pos:6  }, { s_Char:"{", i_Pos:12 }, { s_Char:":", i_Pos:19 }, { s_Char:":", i_Pos:32 }]
```

---

### Шаг 3 — `map_Normalize`: нормализация карты

**Цель:** превратить сырую карту в единую таблицу колонок, где каждая колонка — один признак с максимальной позицией по всем строкам.

**Алгоритм:**

1. Число колонок = минимальная длина строк в сырой карте
2. Для каждой колонки `i` — проверить, что `s_Char` одинаков во **всех** строках. Если хотя бы в одной строке признак отличается — эта колонка и все последующие **отсекаются**
3. Для оставшихся колонок вычислить `i_MaxPos = max(i_Pos)` по всем строкам

```typescript
export interface AlignColumn {
  s_Char: string;   // признак выравнивания
  i_MaxPos: number; // целевая позиция для всех строк
}
```

Пример — колонки 0..2 проходят проверку, колонка 3 отсекается (разные признаки: `"("`, `"="`, `":"`):

```
col 0: s_Char="=" @ [6,7,6]    →  { s_Char:"=", i_MaxPos:7  }
col 1: s_Char="{" @ [10,10,12] →  { s_Char:"{", i_MaxPos:12 }
col 2: s_Char=":" @ [19,19,19] →  { s_Char:":", i_MaxPos:19 }
col 3: отсечена — разные признаки ("(", "=", ":")
```

---

### Шаг 4 — `lines_Align`: применение карты

Для каждой строки и каждой колонки из нормализованной карты:
- найти признак в **оригинальной** строке (та же жадная логика)
- добавить пробелы перед признаком так, чтобы он оказался на позиции `i_MaxPos`

---

## 🔧 Чистые функции в `fsm_Main.ts`

```typescript
// Маскировка не-кода (строки, комментарии → \0)
export function lines_Sanitize(
  a_Lines: string[],
  flags: SanitizeFlags
): string[]

// Жадный поиск признаков в одной маскированной строке
export function chars_FindGreedy(
  s_Masked: string,
  a_AlignChars: string[]
): AlignToken[]

// Построение сырой карты по всем строкам
export function map_BuildRaw(
  a_MaskedLines: string[],
  a_AlignChars: string[]
): AlignToken[][]

// Нормализация: общий префикс признаков + максимальные позиции
export function map_Normalize(
  a_RawMap: AlignToken[][]
): AlignColumn[]

// Применение нормализованной карты к оригинальным строкам
export function lines_Align(
  a_OrigLines: string[],
  a_Columns: AlignColumn[]
): string[]
```

---

## 🔧 ЦЕПОЧКА ВЫЗОВОВ В extension.ts

```typescript
function a_Chain(ns: NS): void {
  rwd(config_Load_Decor,    ns);  // эффект: читает конфиг VS Code
  rwd(language_Detect_Decor, ns); // эффект: определяет язык файла
  rwd(selection_Get_Decor,  ns);  // эффект: получает выделенный текст
  rwd(fsm_Run_Decor,        ns);  // вызывает a_FSM_Main (чистый)
  rwd(text_Replace_Decor,   ns);  // эффект: заменяет текст в редакторе
}
```

**`fsm_Run_Decor` — единственный мост между эффектами и чистым ядром:**

```typescript
function fsm_Run_Decor(ns: NS): void {
  const ctx: FSMContext = {
    lines:            ns.data.selectedLines,
    alignChars:       ns.data.config.alignChars,
    preserveStrings:  ns.data.config.preserveStrings,
    preserveComments: ns.data.config.preserveComments,
  };

  const result = a_FSM_Main(ctx);

  ns.data.alignedLines   = result.alignedLines;
  ns.data.changesApplied = result.changesApplied;
  ns.result = ok(result);
}
```

---

## 📋 СПЕЦИФИКАЦИИ

| # | Описание |
|---|----------|
| 1 | Выравнивание `=` в переменных |
| 2 | Выравнивание `===` (многосимвольный признак) |
| 3 | Нет выравнивания при разных признаках в одной колонке (`===`, `==`, `=`) |
| 4 | Выравнивание `:` в объектах |
| 5 | Игнорирование комментариев |
| 6 | Игнорирование строковых литералов |
| 7 | Выравнивание `=>` в стрелочных функциях |
| 8 | Только общий префикс колонок признаков |
| 9 | Пропуск строк без признаков |
| 10 | Нет выравнивания строк из разных контекстов |
| 11 | Выравнивание составных операторов (`+=`, `-=`) |

---

## ⚙️ КОНФИГУРАЦИЯ ПО УМОЛЧАНИЮ

```json
{
  "defaultAlignChars": [":", "{", "=", ",", "===", "=>", "->", "<=>", "!=="],
  "maxBlockSize": 500,
  "preserveComments": true,
  "preserveStrings": true,
  "greedyMatch": true
}
```

---

## 🔬 РАЗРАБОТКА ЧЕРЕЗ TDD

### Процесс:

1. **Красный** — написать verify-тест под спецификацию в `test/verify/`
2. **Зелёный** — минимальная реализация в `fsm_Main.ts`
3. **Рефактор** — улучшить код, тесты зелёные
4. **Коммит** — `feat(fsm): implement spec N`

### Пример verify-теста (Спецификация 8):

```typescript
// test/verify/spec8_commonPrefix.spec.ts
import { a_FSM_Main, FSMContext } from '../../src/fsm_Main';

describe('Spec 8: align only by common prefix of columns', () => {
  it('should align "=" and ":" but cut off mismatched 3rd column', () => {
    const ctx: FSMContext = {
      lines: [
        'let x   = foo(a,  b)',
        'let yy  = foo(aa, b)',
        'let zzz = foo(a,  bb)',
      ],
      alignChars: ['=', '(', ','],
      preserveStrings: true,
      preserveComments: true,
    };
    const result = a_FSM_Main(ctx);
    // "(" выравнивается, но "," после — разные позиции у b/aa/a → отсечение
    expect(result.alignedLines[0]).toContain('=');
    expect(result.changesApplied).toBe(true);
  });
});
```

### Пример unit-теста для `map_Normalize`:

```typescript
// test/unit/mapNormalize.spec.ts
import { map_Normalize, AlignToken } from '../../src/fsm_Main';

describe('map_Normalize', () => {
  it('should cut columns where chars differ', () => {
    const a_RawMap: AlignToken[][] = [
      [{ s_Char:'=', i_Pos:6  }, { s_Char:'{', i_Pos:10 }, { s_Char:':', i_Pos:19 }, { s_Char:'(', i_Pos:32 }],
      [{ s_Char:'=', i_Pos:7  }, { s_Char:'{', i_Pos:10 }, { s_Char:':', i_Pos:19 }, { s_Char:'=', i_Pos:31 }],
      [{ s_Char:'=', i_Pos:6  }, { s_Char:'{', i_Pos:12 }, { s_Char:':', i_Pos:19 }, { s_Char:':', i_Pos:32 }],
    ];
    const result = map_Normalize(a_RawMap);
    expect(result).toEqual([
      { s_Char:'=', i_MaxPos:7  },
      { s_Char:'{', i_MaxPos:12 },
      { s_Char:':', i_MaxPos:19 },
      // колонка 3 отсечена
    ]);
  });
});
```

### Структура тестов:

```
test/
├── verify/
│   ├── spec1_variables.spec.ts
│   ├── spec2_multichar.spec.ts
│   ├── spec3_mismatch.spec.ts
│   ├── spec4_objects.spec.ts
│   ├── spec5_comments.spec.ts
│   ├── spec6_strings.spec.ts
│   ├── spec7_arrows.spec.ts
│   ├── spec8_commonPrefix.spec.ts
│   ├── spec9_skipNoChar.spec.ts
│   ├── spec10_context.spec.ts
│   └── spec11_compound.spec.ts
├── unit/
│   ├── linesSanitize.spec.ts
│   ├── charsFindGreedy.spec.ts
│   ├── mapBuildRaw.spec.ts
│   ├── mapNormalize.spec.ts
│   └── linesAlign.spec.ts
└── helpers/
    └── mockVsCode.ts
```

---

## 📄 КОД В ДВУХ ФАЙЛАХ (шаблон)

### src/fsm_Main.ts

```typescript
// ─── Типы ────────────────────────────────────────────────────────────────────

export interface AlignToken  { s_Char: string; i_Pos: number; }
export interface AlignColumn { s_Char: string; i_MaxPos: number; }
export interface SanitizeFlags { b_PreserveStrings: boolean; b_PreserveComments: boolean; }
export interface FSMContext  { lines: string[]; alignChars: string[]; preserveStrings: boolean; preserveComments: boolean; }
export interface FSMResult   { alignedLines: string[]; changesApplied: boolean; }

// ─── Главный автомат ─────────────────────────────────────────────────────────

export function a_FSM_Main(ctx: FSMContext): FSMResult {
  // Состояния:
  //   block_Find      — найти следующий блок строк
  //   lines_Sanitize  — маскировать не-код (\0)
  //   chars_Scan      — построить сырую карту AlignToken[][]
  //   map_Normalize   — нормализовать карту → AlignColumn[]
  //   lines_Align     — применить карту к оригинальным строкам
  //   result_Emit     — вернуть результат

  type State = 'block_Find' | 'lines_Sanitize' | 'chars_Scan'
             | 'map_Normalize' | 'lines_Align' | 'result_Emit';

  let state: State = 'block_Find';
  let a_AlignedLines: string[] = [...ctx.lines];
  let b_Changed = false;

  outerLoop: while (true) {
    switch (state) {
      case 'block_Find':     state = block_Find(ctx);                     break;
      case 'lines_Sanitize': state = lines_Sanitize_State(ctx);           break;
      case 'chars_Scan':     state = chars_Scan_State(ctx);               break;
      case 'map_Normalize':  state = map_Normalize_State(ctx);            break;
      case 'lines_Align':  { a_AlignedLines = lines_Align_State(ctx);
                              b_Changed = true;   state = 'result_Emit';  break; }
      case 'result_Emit':    break outerLoop;
    }
  }

  return { alignedLines: a_AlignedLines, changesApplied: b_Changed };
}

// ─── Чистые функции ───────────────────────────────────────────────────────────

export function lines_Sanitize(a_Lines: string[], flags: SanitizeFlags): string[] { /* ... */ return a_Lines; }
export function chars_FindGreedy(s_Masked: string, a_AlignChars: string[]): AlignToken[] { /* ... */ return []; }
export function map_BuildRaw(a_MaskedLines: string[], a_AlignChars: string[]): AlignToken[][] { /* ... */ return []; }
export function map_Normalize(a_RawMap: AlignToken[][]): AlignColumn[] { /* ... */ return []; }
export function lines_Align(a_OrigLines: string[], a_Columns: AlignColumn[]): string[] { /* ... */ return a_OrigLines; }
```

### src/extension.ts

```typescript
import * as vscode from 'vscode';
import { a_FSM_Main, FSMContext, FSMResult } from './fsm_Main';

type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };
const ok  = <T,>(v: T): Result<T>          => ({ ok: true,  value: v });
const err = <E,>(e: E): Result<never, E>   => ({ ok: false, error: e });

type NS = { result: Result<any>; s_Error: string; data: any; };

const ns_HasError  = (ns: NS): boolean => !ns.result.ok;
const ns_SetError  = (ns: NS, s: string): void => { ns.result = err(s); ns.s_Error = s; };

function rwd(fn: (ns: NS) => void, ns: NS): void {
  if (ns_HasError(ns)) return;
  fn(ns);
}

function a_Chain(ns: NS): void {
  rwd(config_Load_Decor,     ns);
  rwd(language_Detect_Decor, ns);
  rwd(selection_Get_Decor,   ns);
  rwd(fsm_Run_Decor,         ns);
  rwd(text_Replace_Decor,    ns);
}

/** @effect reads VS Code workspace configuration */
function config_Load_Decor(ns: NS): void { /* ... */ }

/** @effect reads active editor language id */
function language_Detect_Decor(ns: NS): void { /* ... */ }

/** @effect reads selected text from active editor */
function selection_Get_Decor(ns: NS): void { /* ... */ }

/** @effect pure bridge — calls a_FSM_Main, no VS Code API */
function fsm_Run_Decor(ns: NS): void {
  const ctx: FSMContext = {
    lines:            ns.data.selectedLines,
    alignChars:       ns.data.config.alignChars,
    preserveStrings:  ns.data.config.preserveStrings,
    preserveComments: ns.data.config.preserveComments,
  };
  const result: FSMResult = a_FSM_Main(ctx);
  ns.data.alignedLines   = result.alignedLines;
  ns.data.changesApplied = result.changesApplied;
  ns.result = ok(result);
}

/** @effect replaces selected text in active editor */
function text_Replace_Decor(ns: NS): void { /* ... */ }

export function activate(context: vscode.ExtensionContext): void {
  const cmd = vscode.commands.registerCommand('alignColumns.align', () => {
    const ns: NS = { result: ok({}), s_Error: '', data: {} };
    a_Chain(ns);
    if (ns.s_Error) vscode.window.showErrorMessage(ns.s_Error);
    else            vscode.window.showInformationMessage('Columns aligned');
  });
  context.subscriptions.push(cmd);
}

export function deactivate(): void {}
```

---

## ✅ ЧЕКЛИСТ

- [ ] Два файла: `extension.ts` (эффекты) и `fsm_Main.ts` (чистая логика)
- [ ] `a_FSM_Main` — FSM Шалыто, тип `State` — union, компилятор покрывает все ветки
- [ ] Каждый `case` вызывает ровно одну SRP-функцию, возвращающую следующее `State`
- [ ] `lines_Sanitize` маскирует строки и комментарии символом `\0`
- [ ] `chars_FindGreedy` использует жадный поиск (длинные признаки приоритетнее)
- [ ] `map_Normalize` отсекает колонки с несовпадающими признаками и вычисляет `i_MaxPos`
- [ ] `_Decor` функции имеют JSDoc `@effect`; бизнес-логика в них запрещена
- [ ] `fsm_Main.ts` не импортирует `vscode`
- [ ] Каждая спецификация (1–11) покрыта verify-тестом
- [ ] `map_Normalize` покрыта отдельным unit-тестом с примером отсечения
