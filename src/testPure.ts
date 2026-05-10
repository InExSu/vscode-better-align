// Test entry - only pure functions, no VS Code dependencies

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

const CONFIG = {
    defaultAlignChars: ['===', '!==', '<=>', '=>', '->', '==', '!=', '>=', '<=', '+=', '-=', '*=', '/=', '%=', '**=', ':', '{', '=', ','],
    maxBlockSize: 500,
    maxSpaces: 10,
}

const DEFAULT_LANGUAGE_RULES: LanguageRules = {
    lineComments    : ['//'],
    blockComments: [{ start: '/*', end: '*/' }],
    stringDelimiters: ['"', "'", '`'],
    alignChars      : CONFIG.defaultAlignChars,
}

function findLineBlocks(
    rawLines   : string[],
    startOffset: number ,
    rules      : LanguageRules,
    maxBlockSize: number
): LineBlock[] {
    type State = 'idle_Waiting' | 'block_Building'
    const blocks: LineBlock[] = []
    let state   : State       = 'idle_Waiting'
    let curBlock: LineBlock   = { startLine: 0, lines: [] }
    let curIndent = ''

    const flush = (): void => {
        if(curBlock.lines.length > 1) { blocks.push(curBlock) }
        curBlock = { startLine: 0, lines: [] }
        state = 'idle_Waiting'
    }

    const isBlankOrComment = (raw: string): boolean => {
        const trimmed = raw.trim()
        if(trimmed === '') { return true }
        for(const lc of rules.lineComments) {
            if(trimmed.startsWith(lc)) { return true }
        }
        return false
    }

    const getIndent = (raw: string): string => {
        const m = raw.match(/^(\s*)/)
        return m ? m[1] : ''
    }

    outerLoop: for(let i = 0; i < rawLines.length; i++) {
        const raw = rawLines[i]
        switch(state) {
            case 'idle_Waiting': {
                if(isBlankOrComment(raw)) { continue outerLoop }
                curIndent = getIndent(raw)
                curBlock  = { startLine: startOffset + i, lines: [raw] }
                state     = 'block_Building'
                break
            }
            case 'block_Building': {
                if(isBlankOrComment(raw)) { flush(); continue outerLoop }
                const indent = getIndent(raw)
                if(indent !== curIndent || curBlock.lines.length >= maxBlockSize) {
                    flush()
                    curIndent = indent
                    curBlock  = { startLine: startOffset + i, lines: [raw] }
                    state     = 'block_Building'
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

function parseLineIgnoringStrings(raw: string, rules: LanguageRules): ParsedLine {
    type State =
        | 'code_Reading'
        | 'string_Double'
        | 'string_Single'
        | 'template_Backtick'
        | 'lineComment_Done'
        | 'blockComment_Open'

    const alignChars = [...rules.alignChars].sort((a, b) => b.length - a.length)
    const tokens : Token[]  = []
    const markers: Marker[] = []

    let state: State = 'code_Reading'
    let i           = 0
    let codeStart   = 0
    let blockCommentEnd = ''

    const pushCode = (end: number): void => {
        if(end > codeStart) { tokens.push({ kind: 'code', text: raw.slice(codeStart, end) }) }
    }

    outerLoop: while(i <= raw.length) {
        switch(state) {
            case 'code_Reading': {
                if(i >= raw.length) { pushCode(i); break outerLoop }
                let foundBlock = false
                for(const bc of rules.blockComments) {
                    if(raw.startsWith(bc.start, i)) {
                        pushCode(i)
                        codeStart       = i
                        blockCommentEnd = bc.end
                        state           = 'blockComment_Open'
                        i += bc.start.length
                        foundBlock      = true
                        break
                    }
                }
                if(foundBlock) { continue outerLoop }

                let foundLine = false
                for(const lc of rules.lineComments) {
                    if(raw.startsWith(lc, i)) {
                        pushCode(i)
                        tokens.push({ kind: 'comment', text: raw.slice(i) })
                        state     = 'lineComment_Done'
                        foundLine = true
                        break
                    }
                }
                if(foundLine) { break outerLoop }

                const ch = raw[i]
                if(ch === '"' && rules.stringDelimiters.includes('"')) {
                    pushCode(i); codeStart = i; state = 'string_Double'; i++; continue outerLoop
                }
                if(ch === "'" && rules.stringDelimiters.includes("'")) {
                    pushCode(i); codeStart = i; state = 'string_Single'; i++; continue outerLoop
                }
                if(ch === '`' && rules.stringDelimiters.includes('`')) {
                    pushCode(i); codeStart = i; state = 'template_Backtick'; i++; continue outerLoop
                }

                let foundMarker = false
                for(const ac of alignChars) {
                    if(raw.startsWith(ac, i)) {
                        markers.push({ symbol: ac, startCol: i })
                        i += ac.length
                        foundMarker = true
                        break
                    }
                }
                if(!foundMarker) { i++ }
                break
            }

            case 'string_Double': {
                if(i >= raw.length) { tokens.push({ kind: 'string', text: raw.slice(codeStart) }); break outerLoop }
                if(raw[i] === '\\') { i += 2; continue outerLoop }
                if(raw[i] === '"') { i++; tokens.push({ kind: 'string', text: raw.slice(codeStart, i) }); codeStart = i; state = 'code_Reading'; continue outerLoop }
                i++
                break
            }

            case 'string_Single': {
                if(i >= raw.length) { tokens.push({ kind: 'string', text: raw.slice(codeStart) }); break outerLoop }
                if(raw[i] === '\\') { i += 2; continue outerLoop }
                if(raw[i] === "'") { i++; tokens.push({ kind: 'string', text: raw.slice(codeStart, i) }); codeStart = i; state = 'code_Reading'; continue outerLoop }
                i++
                break
            }

            case 'template_Backtick': {
                if(i >= raw.length) { tokens.push({ kind: 'string', text: raw.slice(codeStart) }); break outerLoop }
                if(raw[i] === '\\') { i += 2; continue outerLoop }
                if(raw[i] === '`') { i++; tokens.push({ kind: 'string', text: raw.slice(codeStart, i) }); codeStart = i; state = 'code_Reading'; continue outerLoop }
                i++
                break
            }

            case 'blockComment_Open': {
                if(i >= raw.length) { tokens.push({ kind: 'comment', text: raw.slice(codeStart) }); break outerLoop }
                if(raw.startsWith(blockCommentEnd, i)) {
                    i += blockCommentEnd.length
                    tokens.push({ kind: 'comment', text: raw.slice(codeStart, i) })
                    codeStart = i
                    state     = 'code_Reading'
                    continue outerLoop
                }
                i++
                break
            }

            case 'lineComment_Done':
                break outerLoop
        }
    }

    return { raw, tokens, markers }
}

function buildPairwisePositionMap(
    parsedLines: ParsedLine[],
    maxSpaces: number
): Map<string, number> {
    const posMap = new Map<string, number>()

    if(parsedLines.length < 2) { return posMap }

    // Phase 1: pairwise sliding window
    for(let i = 0; i < parsedLines.length - 1; i++) {
        const mA = parsedLines[i].markers
        const mB = parsedLines[i + 1].markers
        const minLen = Math.min(mA.length, mB.length)

        let commonLen = 0
        while(commonLen < minLen && mA[commonLen].symbol === mB[commonLen].symbol) {
            commonLen++
        }
        if(commonLen === 0) { continue }

        for(let mk = 0; mk < commonLen; mk++) {
            const colA = mA[mk].startCol
            const colB = mB[mk].startCol
            const target = Math.min(
                Math.max(colA, colB),
                Math.min(colA, colB) + maxSpaces
            )

            const keyA = `${i}:${mk}`
            const keyB = `${i + 1}:${mk}`
            posMap.set(keyA, Math.max(posMap.get(keyA) ?? 0, target))
            posMap.set(keyB, Math.max(posMap.get(keyB) ?? 0, target))
        }
    }

    // Phase 2: transitive propagation
    for(let mk = 0; mk < 20; mk++) {
        let runStart = -1
        let runEnd = -1

        for(let i = 0; i < parsedLines.length; i++) {
            const m = parsedLines[i].markers[mk]
            if(!m) {
                if(runStart >= 0) {
                    propagateMaxInPlace(posMap, runStart, runEnd, mk)
                    runStart = -1
                    runEnd = -1
                }
                continue
            }

            if(runStart < 0) {
                runStart = i
                runEnd = i
            } else {
                const prevSymbol = parsedLines[i - 1].markers[mk]?.symbol
                if(m.symbol !== prevSymbol) {
                    propagateMaxInPlace(posMap, runStart, runEnd, mk)
                    runStart = i
                    runEnd = i
                } else {
                    runEnd = i
                }
            }
        }

        if(runStart >= 0) {
            propagateMaxInPlace(posMap, runStart, runEnd, mk)
        }
    }

    return posMap
}

function propagateMaxInPlace(posMap: Map<string, number>, runStart: number, runEnd: number, mk: number): void {
    if(runStart === runEnd) { return }
    
    let runMax = 0
    for(let i = runStart; i <= runEnd; i++) {
        runMax = Math.max(runMax, posMap.get(`${i}:${mk}`) ?? 0)
    }

    if(runMax > 0) {
        for(let i = runStart; i <= runEnd; i++) {
            const key = `${i}:${mk}`
            if(posMap.has(key)) {
                posMap.set(key, runMax)
            }
        }
    }
}

function applyPositionMap(
    parsedLines: ParsedLine[],
    posMap: Map<string, number>
): string[] {
    return parsedLines.map((pl, lineIdx) => {
        let out    = ''
        let srcPos = 0

        for(let mk = 0; mk < pl.markers.length; mk++) {
            const marker = pl.markers[mk]

            out += pl.raw.slice(srcPos, marker.startCol)
            srcPos = marker.startCol

            const key = `${lineIdx}:${mk}`
            if(posMap.has(key)) {
                const target = posMap.get(key)!
                const curCol = out.length
                if(target > curCol) {
                    out += ' '.repeat(target - curCol)
                }
            }

            out   += marker.symbol
            srcPos = marker.startCol + marker.symbol.length
        }

        out += pl.raw.slice(srcPos)
        return out
    })
}

function alignBlock(parsedLines: ParsedLine[], maxSpaces: number): string[] {
    if(parsedLines.length < 2) { return parsedLines.map(pl => pl.raw) }
    const posMap = buildPairwisePositionMap(parsedLines, maxSpaces)
    if(posMap.size === 0) { return parsedLines.map(pl => pl.raw) }
    return applyPositionMap(parsedLines, posMap)
}

export {
    parseLineIgnoringStrings,
    findLineBlocks,
    alignBlock,
    DEFAULT_LANGUAGE_RULES,
    CONFIG,
}