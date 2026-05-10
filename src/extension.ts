// ============================================================
// Code.Align.Columns — VS Code Extension
// Архитектура: иерархия управляющих машин состояний (Шалыто А.Н.)
// ============================================================

// ── 1. IMPORTS ───────────────────────────────────────────────
import * as vscode from 'vscode'
import { buildPipelineFSM } from './fsm_Main'

// ============================================================
// ── 2. ГЛОБАЛЬНЫЕ СОСТОЯНИЯ АВТОМАТОВ (enum, PascalCase) ─────
// ============================================================

/** А1: Главный конвейерный автомат */
enum СостоянияКонвейера {
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

/** А2: Автомат сканера строк */
enum СостоянияСканера {
    ЧтениеКода          = 'ЧТЕНИЕ_КОДА'                  ,
    СтрокаДвойная       = 'СТРОКА_ДВОЙНАЯ'            ,
    СтрокаОдинарная     = 'СТРОКА_ОДИНАРНАЯ'        ,
    ШаблонОбратныйСлеш  = 'ШАБЛОН_ОБРАТНЫЙ_СЛЕШ' ,
    БлочныйКомментарий  = 'БЛОЧНЫЙ_КОММЕНТАРИЙ'  ,
    КомментарийЗавершён = 'КОММЕНТАРИЙ_ЗАВЕРШЁН',
}

/** А3: Автомат группировки блоков */
enum СостоянияГруппировщика {
    ОжиданиеНачала = 'ОЖИДАНИЕ_НАЧАЛА',
    Накопление     = 'НАКОПЛЕНИЕ'         ,
}

/** А4: Автомат транзитивного распространения */
enum СостоянияРаспространения {
    ПоискСерии = 'ПОИСК_СЕРИИ',
    Накопление = 'НАКОПЛЕНИЕ' ,
}

/** А5: Автомат поиска блоков (иерархия) */
enum СостоянияПоискаБлоков {
    ОжиданиеДанных     = 'ОЖИДАНИЕ_ДАННЫХ'        ,
    ВалидацияКонтекста = 'ВАЛИДАЦИЯ_КОНТЕКСТА',
    АнализВыделения    = 'АНАЛИЗ_ВЫДЕЛЕНИЯ'      ,
    СканированиеВверх  = 'СКАНИРОВАНИЕ_ВВЕРХ'  ,
    СканированиеВниз   = 'СКАНИРОВАНИЕ_ВНИЗ'    ,
    ИзвлечениеСтрок    = 'ИЗВЛЕЧЕНИЕ_СТРОК'      ,
    ГруппировкаБлоков  = 'ГРУППИРОВКА_БЛОКОВ'  ,
    Завершение         = 'ЗАВЕРШЕНИЕ'                 ,
    Ошибка             = 'ОШИБКА'                         ,
}

/** А5.1: Под-автомат анализа выделения */
enum СостоянияАнализаВыделения {
    ПроверкаПустоты        = 'ПРОВЕРКА_ПУСТОТЫ'              ,
    АвтоПоискОтступ        = 'АВТО_ПОИСК_ОТСТУП'             ,
    ИспользованиеВыделения = 'ИСПОЛЬЗОВАНИЕ_ВЫДЕЛЕНИЯ',
}

// ── 3. БАЗОВЫЕ ТИПЫ И РЕЗУЛЬТАТЫ ─────────────────────────────
type Result<T, E = string> = { ok   : true; value: T } | { ok: false; error: E }
const ok     = <T    ,>(v          : T): Result<T>    => ({ ok: true, value: v })
const err    = <E   ,>(e         : E): Result<never, E>      => ({ ok: false, error: e })

type LanguageRules = {
    lineComments    : string[]
    blockComments   : { start: string; end: string }[]
    stringDelimiters: string[]
    alignChars      : string[]
}

type LineBlock = { startLine: number; lines: string[] }

type ParsedLine = { raw: string; tokens: Token[]; markers: Marker[] }

type Token =
    | { kind: 'code'; text   : string }
    | { kind: 'string'; text : string }
    | { kind: 'comment'; text: string }

type Marker = { symbol: string; startCol: number }

type NSData = {
    editor       : vscode.TextEditor | false
    languageRules: LanguageRules | false
    blocks       : LineBlock[]
    parsedLines  : ParsedLine[][]
    alignedLines : string[][]
}

export type NS = {
    result : Result<unknown>
    s_Error: string
    config : typeof CONFIG
    data   : NSData
    [k     : string]: unknown
}

const ns_Error    = (ns   : NS): boolean => ns.result.ok === false
const ns_SetError = (ns: NS        , e          : string): void => { ns.result = err(e); ns.s_Error = e }

// ── 4. ДЕКОРАТОРЫ ДЛЯ ЛОГИРОВАНИЯ ────────────────────────────
const timers = new Map<string, number>()
const line   = (ch          : string): string => ch.repeat(50)

function decor_Start(name: string): void {
    timers.set(name, performance.now())
    console.log(`\n${line('═')}\n▶  ${name}\n${line('─')}`)
}
function decor_Finish(name: string): void {
    const start    = timers.get(name)
    const duration = start ? (performance.now() - start).toFixed(2) : '?'
    console.log(`${line('─')}\n◀  ${name} (${duration}ms)\n${line('═')}\n`)
    timers.delete(name)
}
function rwd(fn: (ns: NS) => void, ns: NS): void {
    if(ns_Error(ns)) { return }
    decor_Start(fn.name)
    fn(ns)
    decor_Finish(fn.name)
}

// ── 5. КОНФИГУРАЦИЯ ──────────────────────────────────────────
const CONFIG = {
    b_Debug             : false               ,
    defaultAlignChars   : ['==='    , '!=='       , '<=>', '=>', '->', '==', '!=', '>=', '<=', '+=', '-=', '*=', '/=', '%=', '**=', ':', '{', '=', ','],
    maxBlockSize        : 500            ,
    preserveComments    : true       ,
    preserveStrings     : true        ,
    alignMultilineBlocks: false  ,
    skipTemplates       : true          ,
    greedyMatch         : true            ,
    minColumns          : 1                ,
    maxSpaces           : 10                ,
    testData            : {} as Record<string, unknown>,
}

function NS_Container(cfg: typeof CONFIG): NS {
    return {
        result         : ok({}), s_Error: ''         , config        : cfg          ,
        data           : { editor: false  , languageRules: false, blocks: [], parsedLines: [], alignedLines: [] },
        ...cfg.testData,
    }
}

// ── 6. ПРАВИЛА ЯЗЫКОВ ────────────────────────────────────────
const LANGUAGE_RULES: Record<string, LanguageRules> = {
    typescript: { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }], stringDelimiters: ['"', "'", '`'], alignChars: CONFIG.defaultAlignChars },
    javascript: { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }], stringDelimiters: ['"', "'", '`'], alignChars: CONFIG.defaultAlignChars },
    python    : { lineComments    : ['#']     , blockComments     : []                               , stringDelimiters                               : ['"', "'"]                                    , alignChars                                    : CONFIG.defaultAlignChars }                                    ,
    rust      : { lineComments      : ['//']      , blockComments      : [{ start: '/*', end: '*/' }]      , stringDelimiters      : ['"']                , alignChars                : CONFIG.defaultAlignChars }                ,
    go        : { lineComments        : ['//']        , blockComments        : [{ start: '/*', end: '*/' }]        , stringDelimiters        : ['"', '`']             , alignChars             : CONFIG.defaultAlignChars }             ,
    lua       : { lineComments       : ['--']       , blockComments       : [{ start: '--[[', end: ']]' }]     , stringDelimiters     : ['"', "'"]          , alignChars          : CONFIG.defaultAlignChars }          ,
    sql       : { lineComments       : ['--']       , blockComments       : [{ start: '/*', end: '*/' }]       , stringDelimiters       : ['"', "'"]            , alignChars            : CONFIG.defaultAlignChars }            ,
}
const DEFAULT_LANGUAGE_RULES: LanguageRules = {
    lineComments    : ['//']  , blockComments: [{ start: '/*', end: '*/' }],
    stringDelimiters: ['"', "'"        , '`']                                , alignChars: CONFIG.defaultAlignChars,
}

// ============================================================
// ── 7. А1 — ГЛАВНЫЙ КОНВЕЙЕРНЫЙ АВТОМАТ ─────────────────────
// ============================================================
const pipelineFSM = buildPipelineFSM(
    config_Load_Decor,
    language_Detect_Decor,
    block_Find_Decor,
    lines_Parse_Decor,
    alignment_Apply_Decor,
    text_Replace_Decor,
    rwd
)
function a_Chain(ns: NS): void { pipelineFSM(ns) }

// ── Фазовые обёртки ─────────────────────────────────────────
function config_Load_Decor(ns: NS): void {
    if(ns.config.b_Debug) { ns.data.languageRules = DEFAULT_LANGUAGE_RULES; return }
    try {
        const vsConfig   = vscode.workspace.getConfiguration('codeAlign')
        const alignChars = vsConfig.get<string[]>('alignChars', ns.config.defaultAlignChars)
        ns.config        = { ...ns.config                            , ...loadConfig(vsConfig, alignChars, ns.config) }
        ns.result        = ok(ns.config)
    } catch(e) { ns_SetError(ns, (e as Error).message) }
}

function language_Detect_Decor(ns: NS): void {
    if(ns.config.b_Debug) { ns.data.languageRules = DEFAULT_LANGUAGE_RULES; return }
    try {
        const editor          = vscode.window.activeTextEditor
        if(!editor) { ns_SetError(ns, 'No active editor'); return }
        ns.data.editor        = editor
        ns.data.languageRules = detectLanguageRules(editor.document.languageId, ns.config.defaultAlignChars)
        ns.result             = ok(ns.data.languageRules)
    } catch(e) { ns_SetError(ns, (e as Error).message) }
}

function lines_Parse_Decor(ns: NS): void {
    if(ns.config.b_Debug) {
        ns.data.parsedLines = (ns['testParsedLines'] as ParsedLine[][] | undefined) ?? []
        ns.result           = ok(ns.data.parsedLines); return
    }
    try {
        const rules         = ns.data.languageRules
        if(!rules) { ns_SetError(ns, 'No language rules'); return }
        ns.data.parsedLines = ns.data.blocks.map(block => block.lines.map(raw => а2_АвтоматСканера(raw, rules)))
        ns.result           = ok(ns.data.parsedLines)
    } catch(e) { ns_SetError(ns, (e as Error).message) }
}

function alignment_Apply_Decor(ns: NS): void {
    if(ns.config.b_Debug) {
        ns.data.alignedLines = (ns['testAlignedLines'] as string[][] | undefined) ?? []
        ns.result            = ok(ns.data.alignedLines); return
    }
    try {
        ns.data.alignedLines = ns.data.parsedLines.map(blockLines => alignBlock(blockLines, ns.config.maxSpaces))
        ns.result            = ok(ns.data.alignedLines)
    } catch(e) { ns_SetError(ns, (e as Error).message) }
}

function text_Replace_Decor(ns: NS): void {
    if(ns.config.b_Debug) { ns.result = ok('debug-no-replace'); return }
    try {
        const editor           = ns.data.editor
        if(!editor) { ns_SetError(ns, 'No active editor'); return }
        applyEditorReplacements(editor, ns.data.blocks, ns.data.alignedLines)
        ns.result           = ok('replaced')
    } catch(e) { ns_SetError(ns, (e as Error).message) }
}

// ============================================================
// ── 8. А2 — АВТОМАТ СКАНЕРА СТРОК (исправлен: default-кейс) ─
// ============================================================
function а2_АвтоматСканера(raw: string, rules: LanguageRules): ParsedLine {
    const alignChars = [...rules.alignChars].sort((a, b) => b.length - a.length)
    const tokens     : Token[]           = []; const markers: Marker[] = []
    let состояние    = СостоянияСканера.ЧтениеКода
    let i            = 0          , codeStart           = 0          , blockEndMarker = '', nestingDepth = 0

    const pushCode = (end: number) => { if(end > codeStart) { tokens.push({ kind: 'code', text: raw.slice(codeStart, end) }) } }

    mainLoop: while(i <= raw.length) {
        switch(состояние) {
            case СостоянияСканера.ЧтениеКода: {
                if(i >= raw.length) { pushCode(i); break mainLoop }
                for(const bc of rules.blockComments) {
                    if(raw.startsWith(bc.start, i)) {
                        pushCode(i); codeStart = i; blockEndMarker         = bc.end
                        состояние              = СостоянияСканера.БлочныйКомментарий; i += bc.start.length; continue mainLoop
                    }
                }
                for(const lc of rules.lineComments) {
                    if(raw.startsWith(lc, i)) {
                        pushCode(i); tokens.push({ kind: 'comment', text: raw.slice(i) })
                        состояние = СостоянияСканера.КомментарийЗавершён; break mainLoop
                    }
                }
                const ch        = raw[i]
                if(ch           === '"' && rules.stringDelimiters.includes('"')) { pushCode(i); codeStart = i; состояние = СостоянияСканера.СтрокаДвойная; i++; continue mainLoop }
                if(ch           === "'" && rules.stringDelimiters.includes("'")) { pushCode(i); codeStart = i; состояние = СостоянияСканера.СтрокаОдинарная; i++; continue mainLoop }
                if(ch           === '`' && rules.stringDelimiters.includes('`')) { pushCode(i); codeStart = i; состояние = СостоянияСканера.ШаблонОбратныйСлеш; i++; continue mainLoop }
                if(ch           === '(' || ch           === '[' || ch           === '{') { nestingDepth++; i++; continue mainLoop }
                if(ch           === ')' || ch           === ']' || ch           === '}') { nestingDepth = Math.max(0, nestingDepth - 1); i++; continue mainLoop }
                if(nestingDepth <= 1) {
                    for(const ac of alignChars) {
                        if(raw.startsWith(ac, i)) {
                            if(!(ac === ':' && i > 0 && raw[i - 1] === ')')) { markers.push({ symbol: ac, startCol: i }) }
                            i += ac.length; continue mainLoop
                        }
                    }
                }
                i++; break
            }
            case СостоянияСканера.СтрокаДвойная     :
            case СостоянияСканера.СтрокаОдинарная   :
            case СостоянияСканера.ШаблонОбратныйСлеш: {
                const delim = состояние === СостоянияСканера.СтрокаДвойная ? '"' : состояние === СостоянияСканера.СтрокаОдинарная ? "'" : '`'
                if(i        >= raw.length) { tokens.push({ kind: 'string', text: raw.slice(codeStart) }); break mainLoop }
                if(raw[i]   === '\\') { i += 2; continue mainLoop }
                if(raw[i]   === delim) {
                    i++; tokens.push({ kind: 'string', text: raw.slice(codeStart, i) }); codeStart = i
                    состояние                                                                      = СостоянияСканера.ЧтениеКода; continue mainLoop
                }
                i++; break
            }
            case СостоянияСканера.БлочныйКомментарий: {
                if(i >= raw.length) { tokens.push({ kind: 'comment', text: raw.slice(codeStart) }); break mainLoop }
                if(raw.startsWith(blockEndMarker, i)) {
                    i         += blockEndMarker.length; tokens.push({ kind: 'comment', text: raw.slice(codeStart, i) }); codeStart = i
                    состояние = СостоянияСканера.ЧтениеКода; continue mainLoop
                }
                i++; break
            }
            default:
                // Терминальное состояние — выход из цикла
                break mainLoop
        }
    }
    return { raw, tokens, markers }
}

// ============================================================
// ── 9. А3 — АВТОМАТ ГРУППИРОВКИ БЛОКОВ ──────────────────────
// ============================================================
function а3_АвтоматГруппировки(rawLines: string[], startOffset: number, rules: LanguageRules, maxBlockSize: number): LineBlock[] {
    const blocks  : LineBlock[] = []
    let состояние = СостоянияГруппировщика.ОжиданиеНачала
    let curBlock  : LineBlock   = { startLine: 0, lines: [] }, curIndent = ''

    const flush                = ()           => { if(curBlock.lines.length > 1) { blocks.push(curBlock) } curBlock = { startLine: 0, lines: [] }; состояние = СостоянияГруппировщика.ОжиданиеНачала }
    const пустаяИлиКомментарий = (r: string)           => { const t                                                                           = r.trim(); return t === '' || rules.lineComments.some(lc => t.startsWith(lc)) }
    const получитьОтступ       = (r      : string)                 => r.match(/^(\s*)/)?.[1] ?? ''

    outer: for(let idx = 0; idx < rawLines.length; idx++) {
        const raw = rawLines[idx]
        switch(состояние) {
            case СостоянияГруппировщика.ОжиданиеНачала:
                if(пустаяИлиКомментарий(raw)) { continue }
                curIndent = получитьОтступ(raw); curBlock = { startLine: startOffset + idx, lines: [raw] }
                состояние = СостоянияГруппировщика.Накопление; break
            case СостоянияГруппировщика.Накопление:
                if(пустаяИлиКомментарий(raw)) { flush(); continue }
                const indent = получитьОтступ(raw)
                if(indent    !== curIndent || curBlock.lines.length >= maxBlockSize) { flush(); curIndent = indent; curBlock = { startLine: startOffset + idx, lines: [raw] } }
                else { curBlock.lines.push(raw) }
                break
        }
    }
    flush(); return blocks
}

// ============================================================
// ── 10. А4 — АВТОМАТ РАСПРОСТРАНЕНИЯ ─────────────────────────
// ============================================================
function а4_АвтоматРаспространения(parsedLines: ParsedLine[], posMap: Map<string, number>, mk: number): void {
    let состояние       = СостоянияРаспространения.ПоискСерии, началоСерии = 0, конецСерии = 0
    const применитьМакс = ()           => {
        let макс  = 0
        for(let i = началоСерии; i <= конецСерии; i++) { макс = Math.max(макс, posMap.get(`${i}:${mk}`) ?? 0) }
        if(макс > 0) { for(let i = началоСерии; i <= конецСерии; i++) { const k = `${i}:${mk}`; if(posMap.has(k)) { posMap.set(k, макс) } } }
    }
    for(let i = 0; i < parsedLines.length; i++) {
        switch(состояние) {
            case СостоянияРаспространения.ПоискСерии:
                if(parsedLines[i].markers[mk] !== undefined) { началоСерии = конецСерии = i; состояние = СостоянияРаспространения.Накопление }
                break
            case СостоянияРаспространения.Накопление: {
                const cur           = parsedLines[i].markers[mk]?.symbol, last = parsedLines[конецСерии].markers[mk]?.symbol
                if(cur           !== undefined && cur           === last) { конецСерии   = i }
                else { применитьМакс(); состояние = СостоянияРаспространения.ПоискСерии; if(parsedLines[i].markers[mk] !== undefined) { началоСерии = конецСерии = i; состояние = СостоянияРаспространения.Накопление } }
                break
            }
        }
    }
    if(состояние === СостоянияРаспространения.Накопление) { применитьМакс() }
}

// ============================================================
// ── 11. ПОСТРОЕНИЕ КАРТЫ ПОЗИЦИЙ ─────────────────────────────
// ============================================================
function buildPairwisePositionMap(parsedLines: ParsedLine[], maxSpaces: number): Map<string, number> {
    const posMap     = new Map<string, number>()
    if(parsedLines.length < 2) { return posMap }
    const maxMarkers = Math.max(0, ...parsedLines.map(pl => pl.markers.length))
    for(let mk       = 0; mk < maxMarkers; mk++) {
        let maxCol  = -1
        for(const pl of parsedLines) { if(pl.markers[mk]) { maxCol = Math.max(maxCol, pl.markers[mk].startCol) } }
        if(maxCol < 0) { continue }
        const count = parsedLines.filter(pl => pl.markers[mk]).length
        if(count < 2) { continue }
        for(let i   = 0; i < parsedLines.length; i++) {
            const m                = parsedLines[i].markers[mk]; if(!m) { continue }
            const target           = m.startCol >= maxCol ? m.startCol : Math.min(maxCol, m.startCol + maxSpaces)
            posMap.set(`${i}:${mk}`, Math.max(posMap.get(`${i}:${mk}`) ?? 0, target))
        }
    }
    for(let mk = 0; mk < maxMarkers; mk++) { а4_АвтоматРаспространения(parsedLines, posMap, mk) }
    return posMap
}

// ── 12. ПРИМЕНЕНИЕ КАРТЫ ПОЗИЦИЙ (упрощено: без автомата А6) ─
function applyPositionMap(parsedLines: ParsedLine[], posMap: Map<string, number>): string[] {
    return parsedLines.map((pl, lineIdx) => {
        let out    = '', srcPos = 0, shift = 0
        for(let mk = 0; mk < pl.markers.length; mk++) {
            const marker = pl.markers[mk]
            out          += pl.raw.slice(srcPos, marker.startCol)
            srcPos       = marker.startCol
            const key    = `${lineIdx}:${mk}`
            if(posMap.has(key)) {
                const target      = posMap.get(key)!          , targetOut = target + shift, pad = targetOut - out.length
                if(pad > 0) { out += ' '.repeat(pad); shift += pad }
            }
            out    += marker.symbol
            srcPos = marker.startCol + marker.symbol.length
        }
        out += pl.raw.slice(srcPos)
        return out
    })
}

function alignBlock(parsedLines: ParsedLine[], maxSpaces: number): string[] {
    if(parsedLines.length < 2) { return parsedLines.map(pl => pl.raw) }
    const posMap       = buildPairwisePositionMap(parsedLines, maxSpaces)
    return posMap.size === 0 ? parsedLines.map(pl      => pl.raw) : applyPositionMap(parsedLines, posMap)
}

// ============================================================
// ── 13. А5 — АВТОМАТ ПОИСКА БЛОКОВ (ИЕРАРХИЯ ШАЛЫТО) ─────────
// ============================================================
type КонтекстПоиска = {
    editor   : vscode.TextEditor; rules: LanguageRules; doc: vscode.TextDocument; selection: vscode.Selection
    startLine: number; endLine      : number; initialIndent   : string; activeLine               : number; rawLines: string[]
}

function а5_АвтоматПоискаБлоков(ns: NS): void {
    const ctx: КонтекстПоиска = {
        editor   : ns.data.editor as vscode.TextEditor        , rules            : ns.data.languageRules as LanguageRules                     ,
        doc      : (ns.data.editor as vscode.TextEditor).document, selection: (ns.data.editor as vscode.TextEditor).selection,
        startLine: 0                                       , endLine                                         : 0                                                                                       , initialIndent: '', activeLine: 0, rawLines: [],
    }
    let состояние = СостоянияПоискаБлоков.ОжиданиеДанных

    main: while(true) {
        switch(состояние) {
            case СостоянияПоискаБлоков.ОжиданиеДанных    : состояние = СостоянияПоискаБлоков.ВалидацияКонтекста; break
            case СостоянияПоискаБлоков.ВалидацияКонтекста:
                if(!ctx.editor) { ns_SetError(ns, 'No active editor'); состояние = СостоянияПоискаБлоков.Ошибка; break }
                if(!ctx.rules) { ns_SetError(ns, 'No language rules'); состояние = СостоянияПоискаБлоков.Ошибка; break }
                ctx.doc                                                          = ctx.editor.document; ctx.selection = ctx.editor.selection
                состояние                                                        = СостоянияПоискаБлоков.АнализВыделения; break
            case СостоянияПоискаБлоков.АнализВыделения: {
                const res            = а5_1_АнализВыделения(ctx)
                if(!res) { состояние = СостоянияПоискаБлоков.Ошибка; break }
                ctx.startLine        = res.startLine; ctx.endLine = res.endLine
                состояние            = СостоянияПоискаБлоков.ИзвлечениеСтрок; break
            }
            case СостоянияПоискаБлоков.ИзвлечениеСтрок:
                ctx.rawLines = extractRawLines(ctx.doc, ctx.startLine, ctx.endLine)
                состояние    = СостоянияПоискаБлоков.ГруппировкаБлоков; break
            case СостоянияПоискаБлоков.ГруппировкаБлоков:
                ns.data.blocks = а3_АвтоматГруппировки(ctx.rawLines, ctx.startLine, ctx.rules, ns.config.maxBlockSize)
                состояние      = СостоянияПоискаБлоков.Завершение; break
            case СостоянияПоискаБлоков.Завершение: ns.result = ok(ns.data.blocks); break main
            case СостоянияПоискаБлоков.Ошибка    : break main
        }
    }
}

function а5_1_АнализВыделения(ctx: КонтекстПоиска): { startLine: number; endLine: number } | null {
    let состояние = СостоянияАнализаВыделения.ПроверкаПустоты
    while(true) {
        switch(состояние) {
            case СостоянияАнализаВыделения.ПроверкаПустоты:
                состояние = ctx.selection.isEmpty ? СостоянияАнализаВыделения.АвтоПоискОтступ : СостоянияАнализаВыделения.ИспользованиеВыделения; break
            case СостоянияАнализаВыделения.АвтоПоискОтступ: {
                ctx.activeLine    = ctx.selection.active.line
                ctx.initialIndent = ctx.doc.lineAt(ctx.activeLine).text.match(/^\s*/)?.[0] ?? ''
                const up          = а5_2_СканированиеВверх(ctx); if(up    === null) { return null } ctx.startLine  = up
                const down        = а5_2_СканированиеВниз(ctx); if(down === null) { return null } ctx.endLine = down
                return { startLine: ctx.startLine          , endLine          : ctx.endLine }
            }
            case СостоянияАнализаВыделения.ИспользованиеВыделения:
                return { startLine: ctx.selection.start.line, endLine: ctx.selection.end.line }
        }
    }
}

function а5_2_СканированиеВверх(ctx: КонтекстПоиска): number | null {
    let line = ctx.activeLine
    while(line > 0) {
        const prev           = ctx.doc.lineAt(line - 1)
        if(prev.isEmptyOrWhitespace) { break }
        if((prev.text.match(/^\s*/)?.[0] ?? '') !== ctx.initialIndent) { break }
        line--
    }
    return line
}

function а5_2_СканированиеВниз(ctx: КонтекстПоиска): number | null {
    let line = ctx.activeLine, last = ctx.doc.lineCount - 1
    while(line < last) {
        const next           = ctx.doc.lineAt(line + 1)
        if(next.isEmptyOrWhitespace) { break }
        if((next.text.match(/^\s*/)?.[0] ?? '') !== ctx.initialIndent) { break }
        line++
    }
    return line
}

function block_Find_Decor(ns: NS): void {
    if(ns.config.b_Debug) { ns.data.blocks = (ns['testBlocks'] as LineBlock[] | undefined) ?? []; ns.result = ok(ns.data.blocks); return }
    try { а5_АвтоматПоискаБлоков(ns) } catch(e) { ns_SetError(ns, (e as Error).message) }
}

// ── 14. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ──────────────────────────────
function loadConfig(vsConfig: vscode.WorkspaceConfiguration, alignChars: string[], defaults: typeof CONFIG): Partial<typeof CONFIG> {
    return {
        defaultAlignChars: alignChars                    , maxBlockSize          : vsConfig.get('maxBlockSize', defaults.maxBlockSize) ,
        preserveComments : vsConfig.get('preserveComments', defaults.preserveComments),
        preserveStrings  : vsConfig.get('preserveStrings'  , defaults.preserveStrings)   ,
        maxSpaces        : vsConfig.get('maxSpaces'              , defaults.maxSpaces)                     , greedyMatch   : vsConfig.get('greedyMatch', defaults.greedyMatch),
    }
}
function detectLanguageRules(langId: string, defaultAlignChars: string[]): LanguageRules {
    return LANGUAGE_RULES[langId] ? { ...LANGUAGE_RULES[langId], alignChars: defaultAlignChars } : { ...DEFAULT_LANGUAGE_RULES, alignChars: defaultAlignChars }
}
function extractRawLines(doc: vscode.TextDocument, start: number, end: number): string[] {
    const out: string[] = []; for(let i = start; i <= end; i++) { out.push(doc.lineAt(i).text) } return out
}
function applyEditorReplacements(editor: vscode.TextEditor, blocks: LineBlock[], aligned: string[][]): void {
    editor.edit(builder => {
        for(let bi = 0; bi < blocks.length; bi++) {
            const block = blocks[bi], lines = aligned[bi]
            for(let li  = 0; li < block.lines.length; li++) {
                const idx = block.startLine + li; builder.replace(editor.document.lineAt(idx).range, lines[li])
            }
        }
    })
}

// ── 15. ОБЁРТКИ ДЛЯ ТЕСТОВ ───────────────────────────────────
function parseLineIgnoringStrings(raw: string, rules   : LanguageRules): ParsedLine { return а2_АвтоматСканера(raw, rules) }
function findAlignCharsGreedy(code   : string   , alignChars : string[], rules: LanguageRules): Marker[] { return а2_АвтоматСканера(code, { ...rules, alignChars }).markers }
function findLineBlocks(rawLines     : string[]   , startOffset: number , rules : LanguageRules, maxBlockSize: number): LineBlock[] { return а3_АвтоматГруппировки(rawLines, startOffset, rules, maxBlockSize) }

// ── 16. ACTIVATE / DEACTIVATE ────────────────────────────────
export function activate(context: vscode.ExtensionContext): void {
    const runAlign = () => { const ns = NS_Container(CONFIG); a_Chain(ns); if(ns.s_Error) { vscode.window.showErrorMessage(`Code.Align: ${ns.s_Error}`) } else { vscode.window.showInformationMessage('Code aligned successfully') } }
    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-better-align-columns.align', runAlign),
        vscode.commands.registerCommand('CodeAlign.AlignBlock'             , runAlign)             ,
        vscode.commands.registerCommand('CodeAlign.Configure'              , ()           => vscode.commands.executeCommand('workbench.action.openSettings', 'codeAlign')),
    )
}
export function deactivate(): void { }

// ── EXPORTS ──────────────────────────────────────────────────
export {
    ok                   , err                                       , NS_Container                                           , a_Chain                                                            ,
    findAlignCharsGreedy , buildPairwisePositionMap, applyPositionMap, parseLineIgnoringStrings, findLineBlocks        , alignBlock                  ,
    detectLanguageRules  , DEFAULT_LANGUAGE_RULES   , CONFIG             , LanguageRules                        , ParsedLine                                    , Marker                                                  ,
}