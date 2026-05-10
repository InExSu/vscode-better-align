// ============================================================
// Code.Align.Columns — VS Code Extension
// Архитектура: иерархия машин состояний (автоматное программирование Шалыто)
// ============================================================

// ── 1. IMPORTS ───────────────────────────────────────────────
import * as vscode from 'vscode'

// ============================================================
// ── 2. ГЛОБАЛЬНЫЕ СОСТОЯНИЯ АВТОМАТОВ (enum) ─────────────────
// ============================================================

/** Состояния главного конвейерного автомата А1 */
enum СОСТОЯНИЯ_КОНВЕЙЕРА {
    Ожидание         = 'ОЖИДАНИЕ'                 ,
    ЗагрузкаКонфига  = 'ЗАГРУЗКА_КОНФИГА'  ,
    ОпределениеЯзыка = 'ОПРЕДЕЛЕНИЕ_ЯЗЫКА',
    ПоискБлоков      = 'ПОИСК_БЛОКОВ'          ,
    РазборСтрок      = 'РАЗБОР_СТРОК'          ,
    Выравнивание     = 'ВЫРАВНИВАНИЕ'         ,
    ЗаменаТекста     = 'ЗАМЕНА_ТЕКСТА'        ,
    Завершено        = 'ЗАВЕРШЕНО'               ,
    Ошибка           = 'ОШИБКА'                     ,
}

/** Состояния автомата сканера строк А2 */
enum СОСТОЯНИЯ_СКАНЕРА {
    ЧтениеКода          = 'ЧТЕНИЕ_КОДА'                  ,
    СтрокаДвойная       = 'СТРОКА_ДВОЙНАЯ'            ,
    СтрокаОдинарная     = 'СТРОКА_ОДИНАРНАЯ'        ,
    ШаблонОбратныйСлеш  = 'ШАБЛОН_ОБРАТНЫЙ_СЛЕШ' ,
    БлочныйКомментарий  = 'БЛОЧНЫЙ_КОММЕНТАРИЙ'  ,
    КомментарийЗавершён = 'КОММЕНТАРИЙ_ЗАВЕРШЁН',
}

/** Состояния автомата группировки блоков А3 */
enum СОСТОЯНИЯ_ГРУППИРОВЩИКА {
    ОжиданиеНачала = 'ОЖИДАНИЕ_НАЧАЛА',
    Накопление     = 'НАКОПЛЕНИЕ'         ,
}

/** Состояния автомата распространения выравнивания А4 */
enum СОСТОЯНИЯ_РАСПРОСТРАНЕНИЯ {
    ПоискСерии = 'ПОИСК_СЕРИИ',
    Накопление = 'НАКОПЛЕНИЕ' ,
}

// ── 3. RESULT + БАЗОВЫЕ ТИПЫ ─────────────────────────────────
type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E }

const ok  = <T ,>(v: T): Result<T>    => ({ ok: true, value: v })
const err = <E,>(e: E): Result<never, E> => ({ ok: false, error: e })

type LanguageRules = {
    lineComments    : string[]
    blockComments   : { start: string; end: string }[]
    stringDelimiters: string[]
    alignChars      : string[]
}

type LineBlock = {
    startLine: number
    lines    : string[]
}

type ParsedLine = {
    raw    : string
    tokens : Token[]
    markers: Marker[]
}

type Token =
    | { kind: 'code'; text   : string }
    | { kind: 'string'; text : string }
    | { kind: 'comment'; text: string }

type Marker = {
    symbol  : string
    startCol: number
}

type NSData = {
    editor       : vscode.TextEditor | false
    languageRules: LanguageRules | false
    blocks       : LineBlock[]
    parsedLines  : ParsedLine[][]
    alignedLines : string[][]
}

type NS = {
    result     : Result<unknown>
    s_Error    : string
    config     : typeof CONFIG
    data       : NSData
    [k: string]: unknown
}

const ns_Error = (ns: NS): boolean => ns.result.ok === false

const ns_SetError = (ns: NS, e: string): void => {
    ns.result  = err(e)
    ns.s_Error = e
}

// ── 4. ДЕКОРАТОРЫ ────────────────────────────────────────────
const timers = new Map<string     , number>()
const line   = (ch: string): string => ch.repeat(50)

function decor_Start(name: string): void {
    timers.set(name, performance.now())
    console.log(`\n${line('═')}`)
    console.log(`▶  ${name}`)
    console.log(`${line('─')}`)
}

function decor_Finish(name: string): void {
    const start    = timers.get(name)
    const duration = start ? (performance.now() - start).toFixed(2) : '?'
    console.log(`${line('─')}`)
    console.log(`◀  ${name} (${duration}ms)`)
    console.log(`${line('═')}\n`)
    timers.delete(name)
}

function rwd(fn: (ns: NS) => void, ns: NS): void {
    if(ns_Error(ns)) { return }
    decor_Start(fn.name)
    fn(ns)
    decor_Finish(fn.name)
}

// ── 5. CONFIG ────────────────────────────────────────────────
const CONFIG = {
    b_Debug             : false                                                                                                                       ,
    defaultAlignChars   : ['===', '!==', '<=>', '=>', '->', '==', '!=', '>=', '<=', '+=', '-=', '*=', '/=', '%=', '**=', ':', '{', '=', ','],
    maxBlockSize        : 500                                                                                                                    ,
    preserveComments    : true                                                                                                               ,
    preserveStrings     : true                                                                                                                ,
    alignMultilineBlocks: false                                                                                                          ,
    skipTemplates       : true                                                                                                                  ,
    greedyMatch         : true                                                                                                                    ,
    minColumns          : 1                                                                                                                        ,
    maxSpaces           : 10                                                                                                                        ,
    testData            :           {} as Record<string, unknown>,
}

function NS_Container(cfg: typeof CONFIG): NS {
    return {
        result : ok({}),
        s_Error: ''   ,
        config : cfg   ,
        data   :         {
            editor       : false       ,
            languageRules: false,
            blocks       : []          ,
            parsedLines  : []     ,
            alignedLines : []    ,
        }              ,
        ...cfg.testData,
    }
}

// ── 6. ПРАВИЛА ЯЗЫКОВ ─────────────────────────────────────────
const LANGUAGE_RULES: Record<string, LanguageRules> = {
    typescript: { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }], stringDelimiters: ['"', "'", '`'], alignChars: CONFIG.defaultAlignChars },
    javascript: { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }], stringDelimiters: ['"', "'", '`'], alignChars: CONFIG.defaultAlignChars },
    python    :     { lineComments    : ['#']     , blockComments     : []                               , stringDelimiters                               : ['"', "'"]                                    , alignChars                                    : CONFIG.defaultAlignChars }                                    ,
    rust      :       { lineComments      : ['//']      , blockComments      : [{ start: '/*', end: '*/' }]      , stringDelimiters      : ['"']                , alignChars                : CONFIG.defaultAlignChars }                ,
    go        :         { lineComments        : ['//']        , blockComments        : [{ start: '/*', end: '*/' }]        , stringDelimiters        : ['"', '`']             , alignChars             : CONFIG.defaultAlignChars }             ,
    lua       :        { lineComments       : ['--']       , blockComments       : [{ start: '--[[', end: ']]' }]     , stringDelimiters     : ['"', "'"]          , alignChars          : CONFIG.defaultAlignChars }          ,
    sql       :        { lineComments       : ['--']       , blockComments       : [{ start: '/*', end: '*/' }]       , stringDelimiters       : ['"', "'"]            , alignChars            : CONFIG.defaultAlignChars }            ,
}

const DEFAULT_LANGUAGE_RULES: LanguageRules = {
    lineComments    : ['//']                       ,
    blockComments   : [{ start: '/*', end: '*/' }],
    stringDelimiters: ['"', "'", '`']          ,
    alignChars      : CONFIG.defaultAlignChars       ,
}

// ============================================================
// ── 7. А1 — ГЛАВНЫЙ КОНВЕЙЕРНЫЙ АВТОМАТ ─────────────────────
// ============================================================
/**
 * Автомат А1 управляет последовательным выполнением всех фаз.
 *
 * Граф переходов:
 *   Ожидание → ЗагрузкаКонфига → ОпределениеЯзыка → ПоискБлоков
 *           → РазборСтрок → Выравнивание → ЗаменаТекста → Завершено
 *   любое состояние + ошибка → Ошибка (терминальное)
 */
function а1_КонвейерныйАвтомат(ns: NS): void {
    let состояние: СОСТОЯНИЯ_КОНВЕЙЕРА = СОСТОЯНИЯ_КОНВЕЙЕРА.Ожидание

    mainLoop: while(true) {
        switch(состояние) {

            case СОСТОЯНИЯ_КОНВЕЙЕРА.Ожидание: {
                состояние = СОСТОЯНИЯ_КОНВЕЙЕРА.ЗагрузкаКонфига
                break
            }

            case СОСТОЯНИЯ_КОНВЕЙЕРА.ЗагрузкаКонфига: {
                rwd(config_Load_Decor, ns)
                состояние = ns_Error(ns)
                    ? СОСТОЯНИЯ_КОНВЕЙЕРА.Ошибка
                    : СОСТОЯНИЯ_КОНВЕЙЕРА.ОпределениеЯзыка
                break
            }

            case СОСТОЯНИЯ_КОНВЕЙЕРА.ОпределениеЯзыка: {
                rwd(language_Detect_Decor, ns)
                состояние = ns_Error(ns)
                    ? СОСТОЯНИЯ_КОНВЕЙЕРА.Ошибка
                    : СОСТОЯНИЯ_КОНВЕЙЕРА.ПоискБлоков
                break
            }

            case СОСТОЯНИЯ_КОНВЕЙЕРА.ПоискБлоков: {
                rwd(block_Find_Decor, ns)
                состояние = ns_Error(ns)
                    ? СОСТОЯНИЯ_КОНВЕЙЕРА.Ошибка
                    : СОСТОЯНИЯ_КОНВЕЙЕРА.РазборСтрок
                break
            }

            case СОСТОЯНИЯ_КОНВЕЙЕРА.РазборСтрок: {
                rwd(lines_Parse_Decor, ns)
                состояние = ns_Error(ns)
                    ? СОСТОЯНИЯ_КОНВЕЙЕРА.Ошибка
                    : СОСТОЯНИЯ_КОНВЕЙЕРА.Выравнивание
                break
            }

            case СОСТОЯНИЯ_КОНВЕЙЕРА.Выравнивание: {
                rwd(alignment_Apply_Decor, ns)
                состояние = ns_Error(ns)
                    ? СОСТОЯНИЯ_КОНВЕЙЕРА.Ошибка
                    : СОСТОЯНИЯ_КОНВЕЙЕРА.ЗаменаТекста
                break
            }

            case СОСТОЯНИЯ_КОНВЕЙЕРА.ЗаменаТекста: {
                rwd(text_Replace_Decor, ns)
                состояние = ns_Error(ns)
                    ? СОСТОЯНИЯ_КОНВЕЙЕРА.Ошибка
                    : СОСТОЯНИЯ_КОНВЕЙЕРА.Завершено
                break
            }

            case СОСТОЯНИЯ_КОНВЕЙЕРА.Завершено:
            case СОСТОЯНИЯ_КОНВЕЙЕРА.Ошибка   : {
                break mainLoop
            }
        }
    }
}

/** Псевдоним для совместимости с декоратором rwd и старыми тестами */
function a_Chain(ns: NS): void { а1_КонвейерныйАвтомат(ns) }

// ── Фазовые функции, вызываемые А1 ───────────────────────────

function config_Load_Decor(ns: NS): void {
    if(ns.config.b_Debug) {
        ns.data.languageRules = DEFAULT_LANGUAGE_RULES
        return
    }
    try {
        const vsConfig   = vscode.workspace.getConfiguration('codeAlign')
        const alignChars = vsConfig.get<string[]>('alignChars', ns.config.defaultAlignChars)
        ns.config        = { ...ns.config, ...loadConfig(vsConfig, alignChars, ns.config) }
        ns.result        = ok(ns.config)
    } catch(e) { ns_SetError(ns, (e as Error).message) }
}

function language_Detect_Decor(ns: NS): void {
    if(ns.config.b_Debug) {
        ns.data.languageRules = DEFAULT_LANGUAGE_RULES
        return
    }
    try {
        const editor          = vscode.window.activeTextEditor
        if(!editor)           { ns_SetError(ns, 'No active editor'); return }
        ns.data.editor        = editor
        ns.data.languageRules = detectLanguageRules(editor.document.languageId, ns.config.defaultAlignChars)
        ns.result             = ok(ns.data.languageRules)
    } catch(e) { ns_SetError(ns, (e as Error).message) }
}

function block_Find_Decor(ns: NS): void {
    if(ns.config.b_Debug) {
        ns.data.blocks = (ns['testBlocks'] as LineBlock[] | undefined) ?? []
        ns.result      = ok(ns.data.blocks)
        return
    }
    try {
        const editor = ns.data.editor
        if(!editor)  { ns_SetError(ns, 'No active editor'); return }
        const rules  = ns.data.languageRules
        if(!rules)   { ns_SetError(ns, 'No language rules'); return }

        const doc       = editor.document
        const selection = editor.selection
        let startLine   : number, endLine: number

        if(selection.isEmpty) {
            const activeLine     = selection.active.line
            const initialIndent  = doc.lineAt(activeLine).text.match(/^\s*/)?.[0] ?? ''
            startLine            = activeLine
            while(startLine > 0) {
                const prev           = doc.lineAt(startLine - 1)
                if(prev.isEmptyOrWhitespace || (prev.text.match(/^\s*/)?.[0] ?? '') !== initialIndent) { break }
                startLine--
            }
            endLine           = activeLine
            while(endLine < doc.lineCount - 1) {
                const next           = doc.lineAt(endLine + 1)
                if(next.isEmptyOrWhitespace || (next.text.match(/^\s*/)?.[0] ?? '') !== initialIndent) { break }
                endLine++
            }
        } else {
            startLine = selection.start.line
            endLine   = selection.end.line
        }

        const rawLines = extractRawLines(doc, startLine, endLine)
        ns.data.blocks = а3_АвтоматГруппировки(rawLines, startLine, rules, ns.config.maxBlockSize)
        ns.result      = ok(ns.data.blocks)
    } catch(e) { ns_SetError(ns, (e as Error).message) }
}

function lines_Parse_Decor(ns: NS): void {
    if(ns.config.b_Debug) {
        ns.data.parsedLines = (ns['testParsedLines'] as ParsedLine[][] | undefined) ?? []
        ns.result           = ok(ns.data.parsedLines)
        return
    }
    try {
        const rules         = ns.data.languageRules
        if(!rules)          { ns_SetError(ns, 'No language rules'); return }
        ns.data.parsedLines = ns.data.blocks.map(block =>
            block.lines.map(raw => а2_АвтоматСканера(raw, rules))
        )
        ns.result = ok(ns.data.parsedLines)
    } catch(e) { ns_SetError(ns, (e as Error).message) }
}

function alignment_Apply_Decor(ns: NS): void {
    if(ns.config.b_Debug) {
        ns.data.alignedLines = (ns['testAlignedLines'] as string[][] | undefined) ?? []
        ns.result            = ok(ns.data.alignedLines)
        return
    }
    try {
        ns.data.alignedLines = ns.data.parsedLines.map(blockLines =>
            alignBlock(blockLines, ns.config.maxSpaces)
        )
        ns.result = ok(ns.data.alignedLines)
    } catch(e) { ns_SetError(ns, (e as Error).message) }
}

function text_Replace_Decor(ns: NS): void {
    if(ns.config.b_Debug) { ns.result = ok('debug-no-replace'); return }
    try                   {
        const editor = ns.data.editor
        if(!editor)  { ns_SetError(ns, 'No active editor'); return }
        applyEditorReplacements(editor, ns.data.blocks, ns.data.alignedLines)
        ns.result    = ok('replaced')
    } catch(e) { ns_SetError(ns, (e as Error).message) }
}

// ============================================================
// ── 8. А2 — АВТОМАТ СКАНЕРА СТРОК ───────────────────────────
// ============================================================
/**
 * Автомат А2 токенизирует одну строку кода и собирает маркеры выравнивания.
 *
 * Входные события (приоритет убывает сверху вниз в каждом состоянии):
 *   начало блочного комментария  → БлочныйКомментарий
 *   начало строчного комментария → КомментарийЗавершён (терминальное)
 *   `"`                          → СтрокаДвойная
 *   `'`                          → СтрокаОдинарная
 *   `` ` ``                      → ШаблонОбратныйСлеш
 *   `(` / `[`                    → parenDepth++ (маркеры внутри подавляются)
 *   `)` / `]`                    → parenDepth--
 *   маркер выравнивания          → запись в markers[]
 *
 * В строковых состояниях:
 *   `\`                          → пропуск следующего символа (escape)
 *   закрывающий ограничитель     → ЧтениеКода
 */
function а2_АвтоматСканера(raw: string, rules: LanguageRules): ParsedLine {
    const alignChars = [...rules.alignChars].sort((a, b) => b.length - a.length)
    const tokens     : Token[]   = []
    const markers    : Marker[] = []

    let состояние      : СОСТОЯНИЯ_СКАНЕРА = СОСТОЯНИЯ_СКАНЕРА.ЧтениеКода
    let i              = 0
    let codeStart      = 0
    let blockEndMarker = ''
    let parenDepth     = 0

    const pushCode = (end: number): void => {
        if(end > codeStart) { tokens.push({ kind: 'code', text: raw.slice(codeStart, end) }) }
    }

    mainLoop: while(i <= raw.length) {
        switch(состояние) {

            // ── ЧтениеКода ──────────────────────────────────
            case СОСТОЯНИЯ_СКАНЕРА.ЧтениеКода: {
                if(i >= raw.length) { pushCode(i); break mainLoop }

                // Событие: начало блочного комментария
                let найденБлок           = false
                for(const bc of rules.blockComments) {
                    if(raw.startsWith(bc.start, i)) {
                        pushCode(i)
                        codeStart      = i
                        blockEndMarker = bc.end
                        состояние      = СОСТОЯНИЯ_СКАНЕРА.БлочныйКомментарий
                        i           += bc.start.length
                        найденБлок     = true
                        break
                    }
                }
                if(найденБлок) { continue mainLoop }

                // Событие: начало строчного комментария
                let найденСтрочный           = false
                for(const lc of rules.lineComments) {
                    if(raw.startsWith(lc, i)) {
                        pushCode(i)
                        tokens.push({ kind: 'comment', text: raw.slice(i) })
                        состояние      = СОСТОЯНИЯ_СКАНЕРА.КомментарийЗавершён
                        найденСтрочный = true
                        break
                    }
                }
                if(найденСтрочный) { break mainLoop }

                // Событие: строковый ограничитель
                const ch           = raw[i]
                if(ch === '"' && rules.stringDelimiters.includes('"')) {
                    pushCode(i); codeStart = i; состояние = СОСТОЯНИЯ_СКАНЕРА.СтрокаДвойная; i++; continue mainLoop
                }
                if(ch === "'" && rules.stringDelimiters.includes("'")) {
                    pushCode(i); codeStart = i; состояние = СОСТОЯНИЯ_СКАНЕРА.СтрокаОдинарная; i++; continue mainLoop
                }
                if(ch === '`' && rules.stringDelimiters.includes('`')) {
                    pushCode(i); codeStart = i; состояние = СОСТОЯНИЯ_СКАНЕРА.ШаблонОбратныйСлеш; i++; continue mainLoop
                }

                // Событие: скобки — управляем parenDepth
                if(ch === '(' || ch === '[') { parenDepth++; i++; continue mainLoop }
                if(ch === ')' || ch === ']') { parenDepth = Math.max(0, parenDepth - 1); i++; continue mainLoop }

                // Событие: маркер выравнивания (только вне скобок)
                let найденМаркер     = false
                if(parenDepth === 0) {
                    for(const ac of alignChars) {
                        if(raw.startsWith(ac, i)) {
                            // Подавляем ':' сразу после ')' — аннотация возвращаемого типа
                            const этоАннотацияВозврата = ac === ':' && i > 0 && raw[i - 1] === ')'
                            if(!этоАннотацияВозврата)  {
                                markers.push({ symbol: ac, startCol: i })
                            }
                            i           += ac.length
                            найденМаркер = true
                            break
                        }
                    }
                }
                if(!найденМаркер) { i++ }
                break
            }

            // ── СтрокаДвойная ───────────────────────────────
            case СОСТОЯНИЯ_СКАНЕРА.СтрокаДвойная: {
                if(i >= raw.length) { tokens.push({ kind: 'string', text: raw.slice(codeStart) }); break mainLoop }
                if(raw[i] === '\\') { i += 2; continue mainLoop }
                if(raw[i] === '"')  {
                    i++
                    tokens.push({ kind: 'string', text: raw.slice(codeStart, i) })
                    codeStart = i
                    состояние = СОСТОЯНИЯ_СКАНЕРА.ЧтениеКода
                    continue mainLoop
                }
                i++
                break
            }

            // ── СтрокаОдинарная ─────────────────────────────
            case СОСТОЯНИЯ_СКАНЕРА.СтрокаОдинарная: {
                if(i >= raw.length) { tokens.push({ kind: 'string', text: raw.slice(codeStart) }); break mainLoop }
                if(raw[i] === '\\') { i += 2; continue mainLoop }
                if(raw[i] === "'")  {
                    i++
                    tokens.push({ kind: 'string', text: raw.slice(codeStart, i) })
                    codeStart = i
                    состояние = СОСТОЯНИЯ_СКАНЕРА.ЧтениеКода
                    continue mainLoop
                }
                i++
                break
            }

            // ── ШаблонОбратныйСлеш (template literal) ──────
            case СОСТОЯНИЯ_СКАНЕРА.ШаблонОбратныйСлеш: {
                if(i >= raw.length) { tokens.push({ kind: 'string', text: raw.slice(codeStart) }); break mainLoop }
                if(raw[i] === '\\') { i += 2; continue mainLoop }
                if(raw[i] === '`')  {
                    i++
                    tokens.push({ kind: 'string', text: raw.slice(codeStart, i) })
                    codeStart = i
                    состояние = СОСТОЯНИЯ_СКАНЕРА.ЧтениеКода
                    continue mainLoop
                }
                i++
                break
            }

            // ── БлочныйКомментарий ──────────────────────────
            case СОСТОЯНИЯ_СКАНЕРА.БлочныйКомментарий: {
                if(i >= raw.length)                   { tokens.push({ kind: 'comment', text: raw.slice(codeStart) }); break mainLoop }
                if(raw.startsWith(blockEndMarker, i)) {
                    i         += blockEndMarker.length
                    tokens.push({ kind: 'comment', text: raw.slice(codeStart, i) })
                    codeStart = i
                    состояние = СОСТОЯНИЯ_СКАНЕРА.ЧтениеКода
                    continue mainLoop
                }
                i++
                break
            }

            // ── КомментарийЗавершён (терминальное) ──────────
            case СОСТОЯНИЯ_СКАНЕРА.КомментарийЗавершён: {
                break mainLoop
            }
        }
    }

    return { raw, tokens, markers }
}

// ============================================================
// ── 9. А3 — АВТОМАТ ГРУППИРОВКИ БЛОКОВ ──────────────────────
// ============================================================
/**
 * Автомат А3 разбивает плоский список строк на блоки с одинаковым отступом.
 *
 * Граф переходов:
 *   ОжиданиеНачала + значимая строка       → Накопление
 *   Накопление      + пустая/комментарий    → flush → ОжиданиеНачала
 *   Накопление      + другой отступ         → flush → Накопление (новый блок)
 *   Накопление      + превышен maxBlockSize  → flush → Накопление (новый блок)
 *   конец ввода                              → flush
 */
function а3_АвтоматГруппировки(
    rawLines    : string[]  ,
    startOffset : number ,
    rules       : LanguageRules,
    maxBlockSize: number
): LineBlock[] {
    const blocks  : LineBlock[]              = []
    let состояние : СОСТОЯНИЯ_ГРУППИРОВЩИКА = СОСТОЯНИЯ_ГРУППИРОВЩИКА.ОжиданиеНачала
    let curBlock  : LineBlock                = { startLine: 0, lines: [] }
    let curIndent = ''

    const flush = (): void => {
        if(curBlock.lines.length > 1) { blocks.push(curBlock) }
        curBlock            = { startLine: 0, lines: [] }
        состояние           = СОСТОЯНИЯ_ГРУППИРОВЩИКА.ОжиданиеНачала
    }

    const пустаяИлиКомментарий = (raw: string): boolean => {
        const trimmed      = raw.trim()
        if(trimmed === '') { return true }
        return rules.lineComments.some(lc => trimmed.startsWith(lc))
    }

    const получитьОтступ = (raw: string): string => raw.match(/^(\s*)/)?.[1] ?? ''

    outerLoop: for(let i = 0; i < rawLines.length; i++) {
        const raw = rawLines[i]

        switch(состояние) {

            case СОСТОЯНИЯ_ГРУППИРОВЩИКА.ОжиданиеНачала: {
                if(пустаяИлиКомментарий(raw)) { continue outerLoop }
                curIndent           = получитьОтступ(raw)
                curBlock            = { startLine: startOffset + i, lines: [raw] }
                состояние           = СОСТОЯНИЯ_ГРУППИРОВЩИКА.Накопление
                break
            }

            case СОСТОЯНИЯ_ГРУППИРОВЩИКА.Накопление: {
                if(пустаяИлиКомментарий(raw))           { flush(); continue outerLoop }
                const indent           = получитьОтступ(raw)
                if(indent !== curIndent || curBlock.lines.length >= maxBlockSize) {
                    flush()
                    curIndent = indent
                    curBlock  = { startLine: startOffset + i, lines: [raw] }
                    состояние = СОСТОЯНИЯ_ГРУППИРОВЩИКА.Накопление
                } else {
                    curBlock.lines.push(raw)
                }
                break
            }
        }
    }
    flush()
    return blocks
}

// ============================================================
// ── 10. А4 — АВТОМАТ ТРАНЗИТИВНОГО РАСПРОСТРАНЕНИЯ ──────────
// ============================================================
/**
 * Автомат А4 поднимает все записи posMap в серии до максимума серии.
 *
 * Граф переходов для каждого индекса маркера mk:
 *   ПоискСерии + строка без маркера          → остаёмся в ПоискСерии
 *   ПоискСерии + строка с маркером           → Накопление
 *   Накопление  + тот же символ следующей строки → Накопление (расширяем)
 *   Накопление  + другой символ или конец     → применитьМакс → ПоискСерии
 */
function а4_АвтоматРаспространения(
    parsedLines: ParsedLine[],
    posMap     : Map<string       , number>,
    mk         : number
): void {
    let состояние   : СОСТОЯНИЯ_РАСПРОСТРАНЕНИЯ = СОСТОЯНИЯ_РАСПРОСТРАНЕНИЯ.ПоискСерии
    let началоСерии = 0
    let конецСерии  = 0

    const применитьМакс = (): void => {
        let максСерии           = 0
        for(let i = началоСерии; i <= конецСерии; i++) {
            максСерии = Math.max(максСерии, posMap.get(`${i}:${mk}`) ?? 0)
        }
        if(максСерии > 0) {
            for(let i = началоСерии; i <= конецСерии; i++) {
                const key           = `${i}:${mk}`
                if(posMap.has(key)) { posMap.set(key, максСерии) }
            }
        }
    }

    for(let i = 0; i < parsedLines.length; i++) {
        switch(состояние) {

            case СОСТОЯНИЯ_РАСПРОСТРАНЕНИЯ.ПоискСерии: {
                if(parsedLines[i].markers[mk] === undefined) { break }
                началоСерии           = i
                конецСерии            = i
                состояние             = СОСТОЯНИЯ_РАСПРОСТРАНЕНИЯ.Накопление
                break
            }

            case СОСТОЯНИЯ_РАСПРОСТРАНЕНИЯ.Накопление: {
                const символТекущий             = parsedLines[i].markers[mk]?.symbol
                const символПоследний           = parsedLines[конецСерии].markers[mk]?.symbol
                if(символТекущий !== undefined && символТекущий === символПоследний) {
                    конецСерии = i
                } else {
                    // Инлайн-применение вместо перехода через транзитное состояние
                    применитьМакс()
                    состояние = СОСТОЯНИЯ_РАСПРОСТРАНЕНИЯ.ПоискСерии
                    // Перепроверяем текущую строку как начало новой потенциальной серии
                    if(parsedLines[i].markers[mk] !== undefined) {
                        началоСерии = i
                        конецСерии  = i
                        состояние   = СОСТОЯНИЯ_РАСПРОСТРАНЕНИЯ.Накопление
                    }
                }
                break
            }
        }
    }

    // Сброс незавершённой серии по достижении конца ввода
    if(состояние === СОСТОЯНИЯ_РАСПРОСТРАНЕНИЯ.Накопление) {
        применитьМакс()
    }
}

// ============================================================
// ── 11. ПОСТРОЕНИЕ КАРТЫ ПОЗИЦИЙ ────────────────────────────
// ============================================================
/**
 * Строит карту целевых столбцов для всех маркеров блока.
 *
 * Фаза 1 — глобальный максимум          :
 *   Для каждого индекса маркера — наибольший startCol среди строк блока,
 *   записывается с ограничением maxSpaces.
 *
 * Фаза 2 — транзитивное распространение (А4):
 *   Для каждого индекса маркера — серии строк с одинаковым символом
 *   поднимаются до максимума серии.
 *
 * Ключ          : `"${индексСтроки}:${индексМаркера}"` → целевой столбец (raw-координаты).
 */
function buildPairwisePositionMap(
    parsedLines: ParsedLine[],
    maxSpaces  : number
): Map<string, number> {
    const posMap           = new Map<string, number>()
    if(parsedLines.length < 2) { return posMap }

    const maxMarkers = Math.max(0, ...parsedLines.map(pl => pl.markers.length))

    // Фаза 1: глобальный максимум по каждому индексу маркера
    for(let mk = 0; mk < maxMarkers; mk++) {
        let maxCol           = -1
        for(let i = 0; i < parsedLines.length; i++) {
            const m = parsedLines[i].markers[mk]
            if(m)   { maxCol = Math.max(maxCol, m.startCol) }
        }
        if(maxCol < 0) { continue }

        let строкСМаркером           = 0
        for(let i = 0; i < parsedLines.length; i++) {
            if(parsedLines[i].markers[mk]) { строкСМаркером++ }
        }
        if(строкСМаркером < 2) { continue }

        for(let i = 0; i < parsedLines.length; i++) {
            const m      = parsedLines[i].markers[mk]
            if(!m)       { continue }
            const target = m.startCol >= maxCol
                ? m.startCol
                : Math.min(maxCol, m.startCol + maxSpaces)
            const key = `${i}:${mk}`
            posMap.set(key, Math.max(posMap.get(key) ?? 0, target))
        }
    }

    // Фаза 2: транзитивное распространение через А4
    for(let mk = 0; mk < maxMarkers; mk++) {
        а4_АвтоматРаспространения(parsedLines, posMap, mk)
    }

    return posMap
}

// ── 12. ПРИМЕНЕНИЕ КАРТЫ ПОЗИЦИЙ ──────────────────────────────
/**
 * Перезаписывает каждую строку          , вставляя пробелы перед маркерами.
 *
 * Инвариант двух координатных пространств:
 *   posMap хранит цели в raw-координатах (смещения в pl.raw).
 *   shift           = суммарно вставленных пробелов до текущего маркера.
 *   pad             = target − C  (не зависит от shift — они компенсируются).
 */
function applyPositionMap(
    parsedLines: ParsedLine[],
    posMap     : Map<string       , number>
): string[] {
    return parsedLines.map((pl, lineIdx) => {
        let out    = ''
        let srcPos = 0
        let shift  = 0

        for(let mk = 0; mk < pl.markers.length; mk++) {
            const marker = pl.markers[mk]
            out          += pl.raw.slice(srcPos, marker.startCol)
            srcPos       = marker.startCol

            const key           = `${lineIdx}:${mk}`
            if(posMap.has(key)) {
                const target    = posMap.get(key)!
                const targetOut = target + shift
                const pad       = targetOut - out.length
                if(pad > 0)     { out += ' '.repeat(pad); shift += pad }
            }

            out    += marker.symbol
            srcPos = marker.startCol + marker.symbol.length
        }

        out += pl.raw.slice(srcPos)
        return out
    })
}

// ── 13. ВСПОМОГАТЕЛЬНЫЕ ЧИСТЫЕ ФУНКЦИИ ───────────────────────

function loadConfig(
    vsConfig  : vscode.WorkspaceConfiguration,
    alignChars: string[]                   ,
    defaults  : typeof CONFIG
): Partial<typeof CONFIG> {
    return {
        defaultAlignChars: alignChars                                                         ,
        maxBlockSize     : vsConfig.get<number>('maxBlockSize', defaults.maxBlockSize)             ,
        preserveComments : vsConfig.get<boolean>('preserveComments', defaults.preserveComments),
        preserveStrings  : vsConfig.get<boolean>('preserveStrings', defaults.preserveStrings)   ,
        maxSpaces        : vsConfig.get<number>('maxSpaces', defaults.maxSpaces)                      ,
        greedyMatch      : vsConfig.get<boolean>('greedyMatch', defaults.greedyMatch)               ,
    }
}

function detectLanguageRules(langId: string, defaultAlignChars: string[]): LanguageRules {
    const rules = LANGUAGE_RULES[langId]
    if(rules)   { return           { ...rules          , alignChars: defaultAlignChars } }
    return      { ...DEFAULT_LANGUAGE_RULES, alignChars: defaultAlignChars }
}

function extractRawLines(doc: vscode.TextDocument, start: number, end: number): string[] {
    const out          : string[] = []
    for(let i = start; i <= end; i++) { out.push(doc.lineAt(i).text) }
    return out
}

function alignBlock(parsedLines: ParsedLine[], maxSpaces: number): string[] {
    if(parsedLines.length < 2) { return parsedLines.map(pl => pl.raw) }
    const posMap           = buildPairwisePositionMap(parsedLines, maxSpaces)
    if(posMap.size === 0)      { return parsedLines.map(pl => pl.raw) }
    return applyPositionMap(parsedLines, posMap)
}

function applyEditorReplacements(
    editor      : vscode.TextEditor,
    blocks      : LineBlock[]      ,
    alignedLines: string[][]
): void {
    editor.edit(editBuilder => {
        for(let bi = 0; bi < blocks.length; bi++) {
            const block             = blocks[bi]
            const aligned           = alignedLines[bi]
            for(let li = 0; li < block.lines.length; li++) {
                const lineIdx = block.startLine + li
                const range   = editor.document.lineAt(lineIdx).range
                editBuilder.replace(range, aligned[li])
            }
        }
    })
}

// ── 14. ОБЁРТКИ ДЛЯ ОБРАТНОЙ СОВМЕСТИМОСТИ / ТЕСТОВ ──────────

function parseLineIgnoringStrings(raw: string, rules: LanguageRules): ParsedLine {
    return а2_АвтоматСканера(raw, rules)
}

function findAlignCharsGreedy(code: string, alignChars: string[], rules: LanguageRules): Marker[] {
    return а2_АвтоматСканера(code, { ...rules, alignChars }).markers
}

function findLineBlocks(
    rawLines    : string[]  ,
    startOffset : number ,
    rules       : LanguageRules,
    maxBlockSize: number
): LineBlock[] {
    return а3_АвтоматГруппировки(rawLines, startOffset, rules, maxBlockSize)
}

// ── 15. ACTIVATE / DEACTIVATE ─────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    const runAlign = (): void => {
        const ns       : NS = NS_Container(CONFIG)
        а1_КонвейерныйАвтомат(ns)
        if(ns.s_Error) {
            vscode.window.showErrorMessage(`Code.Align: ${ns.s_Error}`)
        } else {
            vscode.window.showInformationMessage('Code aligned successfully')
        }
    }

    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-better-align-columns.align', runAlign),
        vscode.commands.registerCommand('CodeAlign.AlignBlock', runAlign)             ,
        vscode.commands.registerCommand('CodeAlign.Configure', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'codeAlign')
        })
    )
}

export function deactivate(): void { }

// ── EXPORTS FOR TESTING ───────────────────────────────────────
export {
    ok          , err,
    NS_Container,
    a_Chain     ,
    // Автоматы
    а1_КонвейерныйАвтомат    ,
    а2_АвтоматСканера        ,
    а3_АвтоматГруппировки    ,
    а4_АвтоматРаспространения,
    // Глобальные состояния (enum)
    СОСТОЯНИЯ_КОНВЕЙЕРА      ,
    СОСТОЯНИЯ_СКАНЕРА        ,
    СОСТОЯНИЯ_ГРУППИРОВЩИКА  ,
    СОСТОЯНИЯ_РАСПРОСТРАНЕНИЯ,
    // Обёртки для обратной совместимости
    findAlignCharsGreedy    ,
    buildPairwisePositionMap,
    applyPositionMap        ,
    parseLineIgnoringStrings,
    findLineBlocks          ,
    alignBlock              ,
    detectLanguageRules     ,
    DEFAULT_LANGUAGE_RULES  ,
    CONFIG                  ,
    LanguageRules           ,
    ParsedLine              ,
    Marker                  ,
}