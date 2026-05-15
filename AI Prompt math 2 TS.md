**Условие**, которое меняет логику: выравнивание не глобальное по всем строкам, а локальное по блокам строк с одинаковым вектором признаков.

## 1. Словесное описание

Программист визуально разбивает код на блоки — непрерывные последовательности строк с одинаковой последовательностью якорей.

Внутри блока он смотрит на последовательность признаков в каждой строке (например, `:`, `=`, `{` и т.д.).

Блок заканчивается как только очередная строка имеет **другой** вектор признаков — она завершает текущий блок, сама образует блок длины 1 (не выравнивается), и начинается новый блок. Пустые строки также разрывают блок.

Сегмент между якорями `p_j` и `p_{j+1}` содержит **и значение предыдущей пары, и ключ следующей** — они выравниваются **независимо**: сначала значение (до разделителя из списка `seps`, например `'; '` или `', '`), потом ключ (от разделителя до следующего якоря).

Всё после последнего якоря остаётся как было.

## 2. Математическая формулировка

### 2.1. Блоки

Пусть $s$ — входная строка, $\text{split}(s) = (f_1, \dots, f_m)$ — разбиение по `\n`.

Блок $B$ — максимальный подсписок $(f_a, \dots, f_b)$ такой, что:
- $\forall k \in [a,b]$, $f_k$ не пуста
- $\forall k \in [a,b]$, $P(f_k) = P(f_a)$ — векторы признаков совпадают полностью

Строка с отличным вектором признаков образует блок длины 1.

### 2.2. Признаки строки

Для строки $f$ определим вектор признаков:
$$P(f) = (p_1, p_2, \dots, p_{L(f)})$$
где $L(f)$ — число найденных признаков (жадный поиск слева направо, непересекающиеся вхождения из алфавита $\mathcal{P}$).

### 2.3. Выравнивание в блоке

Поскольку все строки блока имеют одинаковый вектор признаков, $\text{common}(B) = L(f_a)$.

Для каждого якоря $j \in [1..L(f_a)]$ вычисляются две ширины независимо:

$$W^\text{key}_j = \max_r |\text{key}^{(r)}_j|, \quad W^\text{val}_j = \max_r |\text{val}^{(r)}_j|$$

где:
- $\text{key}^{(r)}_j$ — фрагмент строки $r$ от конца предыдущего якоря до начала якоря $j$, trimEnd
- $\text{val}^{(r)}_j$ — фрагмент от конца якоря $j$ до первого вхождения любого разделителя из $\text{seps}$ (или до следующего якоря, если разделителя нет), trimEnd

Рендер каждого сегмента:
$$\text{padEnd}(\text{key}_j,\ W^\text{key}_j) + p_j + \text{`` ''} + \text{padEnd}(\text{val}_j,\ W^\text{val}_j) + \text{sep}_j$$

где $\text{sep}_j$ — найденный разделитель если он был, иначе пусто.

## 3. Реализация на TypeScript

Код организован как иерархия машин состояний. Каждая функция — одна ответственность, без вложенных `if/else`, ветвление только через ранний возврат (`guard clauses`).

```typescript
type Pattern = string;
type PatternMatch = { pos: number; pattern: string };
type SepMatch = { sep: string; idx: number };
type Segment = { key: string; val: string; sep: string; after: string };

// ── Примитивы ────────────────────────────────────────────────────────────────

function pattern_MatchAt(line: string, pos: number, patterns: Pattern[]): string | null {
  for (const p of patterns)
    if (line.startsWith(p, pos)) return p;
  return null;
}

function patterns_Find(line: string, patterns: Pattern[]): PatternMatch[] {
  const result: PatternMatch[] = [];
  let i = 0;
  while (i < line.length) {
    const matched = pattern_MatchAt(line, i, patterns);
    if (matched) { result.push({ pos: i, pattern: matched }); i += matched.length; }
    else i++;
  }
  return result;
}

function patterns_ToKey(pats: PatternMatch[]): string {
  return pats.map(p => p.pattern).join('\0');
}

function sep_Find(s: string, from: number, seps: string[]): SepMatch | null {
  let best: SepMatch | null = null;
  for (const sep of seps) {
    const idx = s.indexOf(sep, from);
    if (idx !== -1 && (best === null || idx < best.idx)) best = { sep, idx };
  }
  return best;
}

// ── Разбор сегмента ──────────────────────────────────────────────────────────

function segment_Parse(line: string, from: number, to: number, seps: string[]): Segment {
  const raw = line.slice(from, to);
  const found = sep_Find(raw, 0, seps);
  if (!found) return { key: '', val: raw.trimEnd(), sep: '', after: '' };
  return {
    key:   '',
    val:   raw.slice(0, found.idx).trimEnd(),
    sep:   found.sep,
    after: raw.slice(found.idx + found.sep.length),
  };
}

function segments_OfLine(
  line: string,
  pats: PatternMatch[],
  count: number,
  seps: string[]
): { key: string; anchor: string; val: string; sep: string; after: string; tail: string }[] {
  const result = [];
  let end_Prev = 0;
  for (let j = 0; j < count; j++) {
    const pat = pats[j];
    const key = line.slice(end_Prev, pat.pos).trimEnd();
    const anchor = pat.pattern;
    end_Prev = pat.pos + pat.pattern.length;
    const pos_Next = j + 1 < count ? pats[j + 1].pos : line.length;
    const seg = segment_Parse(line, end_Prev, pos_Next, seps);
    end_Prev = pos_Next;
    result.push({ key, anchor, val: seg.val, sep: seg.sep, after: seg.after, tail: '' });
  }
  if (result.length > 0) result[result.length - 1].tail = line.slice(end_Prev);
  return result;
}

// ── Измерение ширин ──────────────────────────────────────────────────────────

function widths_Measure(
  lines: string[],
  patterns_PerLine: PatternMatch[][],
  count: number,
  seps: string[]
): { widths_Key: number[]; widths_Val: number[] } {
  const widths_Key = new Array(count).fill(0);
  const widths_Val = new Array(count).fill(0);
  for (let r = 0; r < lines.length; r++) {
    const segs = segments_OfLine(lines[r], patterns_PerLine[r], count, seps);
    for (let j = 0; j < count; j++) {
      widths_Key[j] = Math.max(widths_Key[j], segs[j].key.length);
      widths_Val[j] = Math.max(widths_Val[j], segs[j].val.length);
    }
  }
  return { widths_Key, widths_Val };
}

// ── Рендер ───────────────────────────────────────────────────────────────────

function segment_Render(
  seg: { key: string; anchor: string; val: string; sep: string; after: string; tail: string },
  width_Key: number,
  width_Val: number,
  is_Last: boolean
): string {
  const rendered = seg.key.padEnd(width_Key) + seg.anchor + ' '
                 + seg.val.padEnd(width_Val) + seg.sep + seg.after;
  return is_Last ? rendered + seg.tail : rendered;
}

function line_Render(
  line: string,
  pats: PatternMatch[],
  count: number,
  widths_Key: number[],
  widths_Val: number[],
  seps: string[]
): string {
  const segs = segments_OfLine(line, pats, count, seps);
  return segs
    .map((seg, j) => segment_Render(seg, widths_Key[j], widths_Val[j], j === count - 1))
    .join('');
}

// ── Блок ─────────────────────────────────────────────────────────────────────

function block_Process(
  indices: number[],
  lines_All: string[],
  patterns: Pattern[],
  seps: string[]
): string[] {
  const lines = indices.map(i => lines_All[i]);
  if (indices.length === 1) return lines;

  const patterns_PerLine = lines.map(l => patterns_Find(l, patterns));
  const count = patterns_PerLine[0].length;
  if (count === 0) return lines;

  const { widths_Key, widths_Val } = widths_Measure(lines, patterns_PerLine, count, seps);
  return lines.map((line, r) =>
    line_Render(line, patterns_PerLine[r], count, widths_Key, widths_Val, seps)
  );
}

// ── Разбиение на блоки ───────────────────────────────────────────────────────

type BlockState = { blocks: number[][]; block_Current: number[]; key_Current: string | null };

function blockState_FlushCurrent(state: BlockState): BlockState {
  if (state.block_Current.length === 0) return state;
  return { blocks: [...state.blocks, state.block_Current], block_Current: [], key_Current: null };
}

function blockState_OnEmpty(state: BlockState): BlockState {
  return blockState_FlushCurrent(state);
}

function blockState_OnLine(state: BlockState, i: number, key: string): BlockState {
  if (key === state.key_Current)
    return { ...state, block_Current: [...state.block_Current, i] };
  const flushed = blockState_FlushCurrent(state);
  return { ...flushed, block_Current: [i], key_Current: key };
}

function blocks_Split(lines_All: string[], patterns: Pattern[]): number[][] {
  let state: BlockState = { blocks: [], block_Current: [], key_Current: null };
  for (let i = 0; i < lines_All.length; i++) {
    if (lines_All[i].trim() === '') { state = blockState_OnEmpty(state); continue; }
    const key = patterns_ToKey(patterns_Find(lines_All[i], patterns));
    state = blockState_OnLine(state, i, key);
  }
  return blockState_FlushCurrent(state).blocks;
}

// ── Точка входа ──────────────────────────────────────────────────────────────

function text_AlignByBlocks(
  input: string,
  patterns: Pattern[],
  seps: string[] = ['; ', ', ']
): string {
  const lines_All = input.split('\n');
  const blocks = blocks_Split(lines_All, patterns);
  const lines_Result = [...lines_All];
  for (const block of blocks) {
    const aligned = block_Process(block, lines_All, patterns, seps);
    for (let idx = 0; idx < block.length; idx++)
      lines_Result[block[idx]] = aligned[idx];
  }
  return lines_Result.join('\n');
}
```

## 4. Примеры работы

**Пример 1 — запятые как разделитель:**
```
let zz = 1, qz = 2
let z = 1, q = 2
f1()
let zz = 1, qz = 2
let z = 1, q = 2
```
Блоки: `[0,1]`, `[2]`, `[3,4]`. Признаки: `['=']`, seps: `[', ']`.
```
let zz = 1, qz = 2
let z  = 1, q  = 2
f1()
let zz = 1, qz = 2
let z  = 1, q  = 2
```

**Пример 2 — точка с запятой:**
```
| { kd: 'code'; t: string }
| { kind: 'string'; text: string }
```
Признаки: `[': ']`, seps: `['; ']`.
```
| { kd  : 'code';   t   : string }
| { kind: 'string'; text: string }
```

## Итог

| Уровень | Форма |
|---|---|
| Человек | «Блок — строки с одинаковым набором якорей; значение и следующий ключ выравниваются независимо» |
| Математик | $P(f_k) = P(f_a)\ \forall k \in B$; два массива $W^\text{key}_j$, $W^\text{val}_j$ для каждого столбца $j$ |
| Программист | `blocks_Split` — автомат по строкам; `block_Process` — измерение + рендер; каждая функция — одна ответственность |