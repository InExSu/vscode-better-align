"use strict"
// ============================================================
// fsm_Main.ts - Pure Logic FSM Module
// Architecture: Hierarchical State Machines (Shalyto A.N.)
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true })
exports.buildPipelineFSM = exports.ns_SetError = exports.ns_Error = exports.PipelineState = exports.alignBlock = exports.applyPositionMap = exports.buildPairwisePositionMap = exports.propagatePositions = exports.PropagationState = exports.findLineBlocks = exports.GroupingState = exports.parseLineIgnoringStrings = exports.ScannerState = exports.detectLanguageRules = exports.LANGUAGE_RULES = exports.DEFAULT_LANGUAGE_RULES = exports.DEFAULT_CONFIG = exports.err = exports.ok = void 0
const ok = (v) => ({ ok: true, value: v })
exports.ok = ok
const err = (e) => ({ ok: false, error: e })
exports.err = err
// ── 3. CONFIG ──────────────────────────────────────────────────
exports.DEFAULT_CONFIG = {
    b_Debug: false,
    defaultAlignChars: ['===', '!==', '<=>', '=>', '->', '==', '!=', '>=', '<=', '+=', '-=', '*=', '/=', '%=', '**=', ':', '{', '=', ','],
    maxBlockSize: 500,
    preserveComments: true,
    preserveStrings: true,
    alignMultilineBlocks: false,
    skipTemplates: true,
    greedyMatch: true,
    minColumns: 1,
    maxSpaces: 10,
    testData: {},
}
// ── 4. LANGUAGE RULES ──────────────────────────────────────────
exports.DEFAULT_LANGUAGE_RULES = {
    lineComments: ['//'],
    blockComments: [{ start: '/*', end: '*/' }],
    stringDelimiters: ['"', "'", '`'],
    alignChars: exports.DEFAULT_CONFIG.defaultAlignChars,
}
exports.LANGUAGE_RULES = {
    typescript: { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }], stringDelimiters: ['"', "'", '`'], alignChars: exports.DEFAULT_CONFIG.defaultAlignChars },
    javascript: { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }], stringDelimiters: ['"', "'", '`'], alignChars: exports.DEFAULT_CONFIG.defaultAlignChars },
    python: { lineComments: ['#'], blockComments: [], stringDelimiters: ['"', "'"], alignChars: exports.DEFAULT_CONFIG.defaultAlignChars },
    rust: { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }], stringDelimiters: ['"'], alignChars: exports.DEFAULT_CONFIG.defaultAlignChars },
    go: { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }], stringDelimiters: ['"', '`'], alignChars: exports.DEFAULT_CONFIG.defaultAlignChars },
    lua: { lineComments: ['--'], blockComments: [{ start: '--[[', end: ']]' }], stringDelimiters: ['"', "'"], alignChars: exports.DEFAULT_CONFIG.defaultAlignChars },
    sql: { lineComments: ['--'], blockComments: [{ start: '/*', end: '*/' }], stringDelimiters: ['"', "'"], alignChars: exports.DEFAULT_CONFIG.defaultAlignChars },
}
function detectLanguageRules(langId, defaultAlignChars) {
    return exports.LANGUAGE_RULES[langId]
        ? { ...exports.LANGUAGE_RULES[langId], alignChars: defaultAlignChars }
        : { ...exports.DEFAULT_LANGUAGE_RULES, alignChars: defaultAlignChars }
}
exports.detectLanguageRules = detectLanguageRules
// ── 5. A2 — SCANNER FSM (PascalCase states) ───────────────────
var ScannerState;
(function(ScannerState) {
    ScannerState["CodeReading"] = "CodeReading"
    ScannerState["StringDouble"] = "StringDouble"
    ScannerState["StringSingle"] = "StringSingle"
    ScannerState["TemplateBacktick"] = "TemplateBacktick"
    ScannerState["BlockComment"] = "BlockComment"
    ScannerState["CommentDone"] = "CommentDone"
})(ScannerState = exports.ScannerState || (exports.ScannerState = {}))
function parseLineIgnoringStrings(raw, rules) {
    const alignChars = [...rules.alignChars].sort((a, b) => b.length - a.length)
    const tokens = []
    const markers = []
    let state = ScannerState.CodeReading
    let i = 0, codeStart = 0, blockEndMarker = '', nestingDepth = 0
    const pushCode = (end) => {
        if(end > codeStart) {
            tokens.push({ kind: 'code', text: raw.slice(codeStart, end) })
        }
    }
    mainLoop: while(i <= raw.length) {
        switch(state) {
            case ScannerState.CodeReading: {
                if(i >= raw.length) {
                    pushCode(i)
                    break mainLoop
                }
                for(const bc of rules.blockComments) {
                    if(raw.startsWith(bc.start, i)) {
                        pushCode(i)
                        codeStart = i
                        blockEndMarker = bc.end
                        state = ScannerState.BlockComment
                        i += bc.start.length
                        continue mainLoop
                    }
                }
                for(const lc of rules.lineComments) {
                    if(raw.startsWith(lc, i)) {
                        pushCode(i)
                        tokens.push({ kind: 'comment', text: raw.slice(i) })
                        state = ScannerState.CommentDone
                        break mainLoop
                    }
                }
                const ch = raw[i]
                if(ch === '"' && rules.stringDelimiters.includes('"')) {
                    pushCode(i)
                    codeStart = i
                    state = ScannerState.StringDouble
                    i++
                    continue mainLoop
                }
                if(ch === "'" && rules.stringDelimiters.includes("'")) {
                    pushCode(i)
                    codeStart = i
                    state = ScannerState.StringSingle
                    i++
                    continue mainLoop
                }
                if(ch === '`' && rules.stringDelimiters.includes('`')) {
                    pushCode(i)
                    codeStart = i
                    state = ScannerState.TemplateBacktick
                    i++
                    continue mainLoop
                }
                if(ch === '(' || ch === '[' || ch === '{') {
                    nestingDepth++
                    i++
                    continue mainLoop
                }
                if(ch === ')' || ch === ']' || ch === '}') {
                    nestingDepth = Math.max(0, nestingDepth - 1)
                    i++
                    continue mainLoop
                }
                if(nestingDepth <= 1) {
                    for(const ac of alignChars) {
                        if(raw.startsWith(ac, i)) {
                            if(!(ac === ':' && i > 0 && raw[i - 1] === ')')) {
                                markers.push({ symbol: ac, startCol: i })
                            }
                            i += ac.length
                            continue mainLoop
                        }
                    }
                }
                i++
                break
            }
            case ScannerState.StringDouble:
            case ScannerState.StringSingle:
            case ScannerState.TemplateBacktick: {
                const delim = state === ScannerState.StringDouble ? '"' : state === ScannerState.StringSingle ? "'" : '`'
                if(i >= raw.length) {
                    tokens.push({ kind: 'string', text: raw.slice(codeStart) })
                    break mainLoop
                }
                if(raw[i] === '\\') {
                    i += 2
                    continue mainLoop
                }
                if(raw[i] === delim) {
                    i++
                    tokens.push({ kind: 'string', text: raw.slice(codeStart, i) })
                    codeStart = i
                    state = ScannerState.CodeReading
                    continue mainLoop
                }
                i++
                break
            }
            case ScannerState.BlockComment: {
                if(i >= raw.length) {
                    tokens.push({ kind: 'comment', text: raw.slice(codeStart) })
                    break mainLoop
                }
                if(raw.startsWith(blockEndMarker, i)) {
                    i += blockEndMarker.length
                    tokens.push({ kind: 'comment', text: raw.slice(codeStart, i) })
                    codeStart = i
                    state = ScannerState.CodeReading
                    continue mainLoop
                }
                i++
                break
            }
            default:
                break mainLoop
        }
    }
    return { raw, tokens, markers }
}
exports.parseLineIgnoringStrings = parseLineIgnoringStrings
// ── 6. A3 — BLOCK GROUPING FSM (PascalCase states) ──────────────
var GroupingState;
(function(GroupingState) {
    GroupingState["WaitingForStart"] = "WaitingForStart"
    GroupingState["Accumulating"] = "Accumulating"
})(GroupingState = exports.GroupingState || (exports.GroupingState = {}))
function findLineBlocks(rawLines, startOffset, rules, maxBlockSize) {
    const blocks = []
    let state = GroupingState.WaitingForStart
    let curBlock = { startLine: 0, lines: [] }, curIndent = ''
    const flush = () => {
        if(curBlock.lines.length > 1) {
            blocks.push(curBlock)
        }
        curBlock = { startLine: 0, lines: [] }
        curIndent = ''
    }
    const isBlankOrComment = (r) => {
        const t = r.trim()
        return t === '' || rules.lineComments.some(lc => t.startsWith(lc))
    }
    const getIndent = (r) => r.match(/^(\s*)/)?.[1] ?? ''
    outer: for(let idx = 0; idx < rawLines.length; idx++) {
        const raw = rawLines[idx]
        const indent = getIndent(raw)
        switch(state) {
            case GroupingState.WaitingForStart:
                if(isBlankOrComment(raw)) {
                    continue
                }
                curIndent = indent
                curBlock = { startLine: startOffset + idx, lines: [raw] }
                state = GroupingState.Accumulating
                break
            case GroupingState.Accumulating:
                if(isBlankOrComment(raw)) {
                    flush()
                    continue
                }
                if(indent !== curIndent || curBlock.lines.length >= maxBlockSize) {
                    flush()
                    curIndent = indent
                    curBlock = { startLine: startOffset + idx, lines: [raw] }
                    state = GroupingState.Accumulating
                }
                else {
                    curBlock.lines.push(raw)
                }
                break
        }
    }
    flush()
    return blocks
}
exports.findLineBlocks = findLineBlocks
// ── 7. A4 — PROPAGATION FSM (PascalCase states) ───────────────
var PropagationState;
(function(PropagationState) {
    PropagationState["FindingSeries"] = "FindingSeries"
    PropagationState["Accumulating"] = "Accumulating"
})(PropagationState = exports.PropagationState || (exports.PropagationState = {}))
function propagatePositions(parsedLines, posMap, mk) {
    let state = PropagationState.FindingSeries, startOfSeries = 0, endOfSeries = 0
    const applyMax = () => {
        let max = 0
        for(let i = startOfSeries; i <= endOfSeries; i++) {
            max = Math.max(max, posMap.get(`${i}:${mk}`) ?? 0)
        }
        if(max > 0) {
            for(let i = startOfSeries; i <= endOfSeries; i++) {
                const k = `${i}:${mk}`
                if(posMap.has(k)) {
                    posMap.set(k, max)
                }
            }
        }
    }
    for(let i = 0; i < parsedLines.length; i++) {
        switch(state) {
            case PropagationState.FindingSeries:
                if(parsedLines[i].markers[mk] !== undefined) {
                    startOfSeries = endOfSeries = i
                    state = PropagationState.Accumulating
                }
                break
            case PropagationState.Accumulating: {
                const cur = parsedLines[i].markers[mk]?.symbol, last = parsedLines[endOfSeries].markers[mk]?.symbol
                if(cur !== undefined && cur === last) {
                    endOfSeries = i
                }
                else {
                    applyMax()
                    state = PropagationState.FindingSeries
                    if(parsedLines[i].markers[mk] !== undefined) {
                        startOfSeries = endOfSeries = i
                        state = PropagationState.Accumulating
                    }
                }
                break
            }
        }
    }
    if(state === PropagationState.Accumulating) {
        applyMax()
    }
}
exports.propagatePositions = propagatePositions
// ── 8. POSITION MAP BUILDING & APPLICATION ────────────────────
function buildPairwisePositionMap(parsedLines, maxSpaces) {
    const posMap = new Map()
    if(parsedLines.length < 2) {
        return posMap
    }
    const maxMarkers = Math.max(0, ...parsedLines.map(pl => pl.markers.length))
    for(let mk = 0; mk < maxMarkers; mk++) {
        let maxCol = -1
        for(const pl of parsedLines) {
            if(pl.markers[mk]) {
                maxCol = Math.max(maxCol, pl.markers[mk].startCol)
            }
        }
        if(maxCol < 0) {
            continue
        }
        const count = parsedLines.filter(pl => pl.markers[mk]).length
        if(count < 2) {
            continue
        }
        for(let i = 0; i < parsedLines.length; i++) {
            const m = parsedLines[i].markers[mk]
            if(!m) {
                continue
            }
            const target = m.startCol >= maxCol ? m.startCol : Math.min(maxCol, m.startCol + maxSpaces)
            posMap.set(`${i}:${mk}`, Math.max(posMap.get(`${i}:${mk}`) ?? 0, target))
        }
    }
    for(let mk = 0; mk < maxMarkers; mk++) {
        propagatePositions(parsedLines, posMap, mk)
    }
    return posMap
}
exports.buildPairwisePositionMap = buildPairwisePositionMap
function applyPositionMap(parsedLines, posMap) {
    return parsedLines.map((pl, lineIdx) => {
        let out = ''
        let srcPos = 0

        for(let mk = 0; mk < pl.markers.length; mk++) {
            const marker = pl.markers[mk]

            // Копируем текст до маркера
            out += pl.raw.slice(srcPos, marker.startCol)
            srcPos = marker.startCol

            const key = `${lineIdx}:${mk}`

            if(posMap.has(key)) {
                const target = posMap.get(key)

                // Текущее положение маркера в результирующей строке
                const currentCol = out.length

                // Сколько пробелов нужно добавить
                const pad = target - currentCol

                if(pad > 0) {
                    out += ' '.repeat(pad)
                }
            }

            // Добавляем сам маркер
            out += marker.symbol

            // Пропускаем маркер в исходной строке
            srcPos = marker.startCol + marker.symbol.length
        }

        // Хвост строки
        out += pl.raw.slice(srcPos)

        return out
    })
}
exports.applyPositionMap = applyPositionMap
function alignBlock(parsedLines, maxSpaces) {
    if(parsedLines.length < 2) {
        return parsedLines.map(pl => pl.raw)
    }
    const posMap = buildPairwisePositionMap(parsedLines, maxSpaces)
    return posMap.size === 0 ? parsedLines.map(pl => pl.raw) : applyPositionMap(parsedLines, posMap)
}
exports.alignBlock = alignBlock
// ── 9. PIPELINE FSM ───────────────────────────────────────────
var PipelineState;
(function(PipelineState) {
    PipelineState["Idle"] = "Idle"
    PipelineState["LoadConfig"] = "LoadConfig"
    PipelineState["DetectLanguage"] = "DetectLanguage"
    PipelineState["FindBlocks"] = "FindBlocks"
    PipelineState["ParseLines"] = "ParseLines"
    PipelineState["Align"] = "Align"
    PipelineState["ReplaceText"] = "ReplaceText"
    PipelineState["Done"] = "Done"
    PipelineState["Error"] = "Error"
})(PipelineState = exports.PipelineState || (exports.PipelineState = {}))
function ns_Error(ns) { return ns.result.ok === false }
exports.ns_Error = ns_Error
function ns_SetError(ns, e) { ns.result = (0, exports.err)(e); ns.s_Error = e }
exports.ns_SetError = ns_SetError
function buildPipelineFSM(config_Load_Decor, language_Detect_Decor, block_Find_Decor, lines_Parse_Decor, alignment_Apply_Decor, text_Replace_Decor, rwd) {
    return function pipelineFSM(ns) {
        let state = PipelineState.Idle
        mainLoop: while(true) {
            switch(state) {
                case PipelineState.Idle:
                    state = PipelineState.LoadConfig
                    break
                case PipelineState.LoadConfig:
                    rwd(config_Load_Decor, ns)
                    state = ns_Error(ns) ? PipelineState.Error : PipelineState.DetectLanguage
                    break
                case PipelineState.DetectLanguage:
                    rwd(language_Detect_Decor, ns)
                    state = ns_Error(ns) ? PipelineState.Error : PipelineState.FindBlocks
                    break
                case PipelineState.FindBlocks:
                    rwd(block_Find_Decor, ns)
                    state = ns_Error(ns) ? PipelineState.Error : PipelineState.ParseLines
                    break
                case PipelineState.ParseLines:
                    rwd(lines_Parse_Decor, ns)
                    state = ns_Error(ns) ? PipelineState.Error : PipelineState.Align
                    break
                case PipelineState.Align:
                    rwd(alignment_Apply_Decor, ns)
                    state = ns_Error(ns) ? PipelineState.Error : PipelineState.ReplaceText
                    break
                case PipelineState.ReplaceText:
                    rwd(text_Replace_Decor, ns)
                    state = ns_Error(ns) ? PipelineState.Error : PipelineState.Done
                    break
                case PipelineState.Done:
                case PipelineState.Error:
                    break mainLoop
            }
        }
    }
}
exports.buildPipelineFSM = buildPipelineFSM
//# sourceMappingURL=fsm_Main.js.map