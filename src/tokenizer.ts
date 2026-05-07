/**
 * tokenizer.ts — Машина состояний Шалыто для лексического разбора строки.
 *
 * Состояния (TokenizerState) строго именованы.
 * Каждый переход — отдельная чистая функция.
 * Никакого скрытого состояния через флаги и вложенные if-else.
 */

import { Token, TokenType, LanguageSyntaxConfig } from './types'
import * as vscode from 'vscode'

// ---------------------------------------------------------------------------
// Состояния автомата
// ---------------------------------------------------------------------------

const enum TokenizerState {
    Default,        // Обычный текст — смотрим на следующий символ
    InString,       // Внутри строки (', ", `)
    InBlock,        // Внутри блока ({}, [], ())
    InLineComment,  // После маркера строкового комментария
    InBlockComment, // Внутри блочного комментария
}

interface ScanState {
    state       : TokenizerState
    quoteChar   : string   // для InString: начальный символ кавычки
    blockOpen   : string   // для InBlock: открывающий символ
    blockDepth  : number   // глубина вложенных блоков
    blockEnd    : string   // для InBlockComment: закрывающая последовательность
    tokenStart  : number   // позиция начала текущего токена
    lastType    : TokenType
    partial     : boolean  // незакрытый блок или строка
}

// ---------------------------------------------------------------------------
// Вспомогательные чистые функции
// ---------------------------------------------------------------------------

const BRACKET_PAIR: Record<string, string> = { '{': '}', '[': ']', '(': ')' }

function sortedByLengthDesc<T extends string | { start: string }>(
    arr: T[],
): T[] {
    return [...arr].sort((a, b) => {
        const la = typeof a === 'string' ? a.length : a.start.length
        const lb = typeof b === 'string' ? b.length : b.start.length
        return lb - la
    })
}

/** Проверяет, начинается ли в позиции pos строкового комментария. */
function matchLineComment(
    text: string, pos: number,
    config: LanguageSyntaxConfig,
): string | null {
    for(const marker of sortedByLengthDesc(config.lineComments)) {
        if(text.startsWith(marker, pos)) {
            // Не трактуем '//' в '://' как комментарий
            if(marker === '//' && pos > 0 && text[pos - 1] === ':') {continue}
            return marker
        }
    }
    return null
}

/** Проверяет, начинается ли блочный комментарий; возвращает закрывающую последовательность. */
function matchBlockComment(
    text: string, pos: number,
    config: LanguageSyntaxConfig,
): string | null {
    for(const bc of sortedByLengthDesc(config.blockComments)) {
        if(text.startsWith(bc.start, pos)) {return bc.end}
    }
    return null
}

/** Возвращает TokenType для одного символа в состоянии Default.
 *  Возвращает null если символ является частью предыдущего слова. */
function classifyChar(
    text: string, pos: number,
    config: LanguageSyntaxConfig,
    leadingTokenCount: number, // кол-во токенов до этой позиции (для CommaAsWord)
): { type: TokenType; seek: number } {
    const char  = text[pos]     ?? ''
    const next  = text[pos + 1] ?? ''
    const third = text[pos + 2] ?? ''

    if(/\s/.test(char)) {return { type: TokenType.Whitespace, seek: 1 }}

    if(char === '"' || char === "'" || char === '`')
        {return { type: TokenType.String, seek: 1 }}

    if(char === '{' || char === '(' || char === '[')
        {return { type: TokenType.Block, seek: 1 }}

    if(char === '}' || char === ')' || char === ']')
        {return { type: TokenType.EndOfBlock, seek: 1 }}

    if(matchLineComment(text, pos, config) !== null)
        {return { type: TokenType.Comment, seek: 1 }}

    if(matchBlockComment(text, pos, config) !== null)
        {return { type: TokenType.Comment, seek: 1 }}

    if(char === ',') {
        const isCommaFirst = leadingTokenCount === 0
            || (leadingTokenCount === 1 && false /* проверяем снаружи */)
        return { type: isCommaFirst ? TokenType.CommaAsWord : TokenType.Comma, seek: 1 }
    }

    if(char === '<' && next === '=' && third === '>') {return { type: TokenType.Spaceship,   seek: 3 }}
    if(char === '<' && next === '?' && third === '=') {return { type: TokenType.PHPShortEcho, seek: 3 }}
    if(char === '=' && next === '>')                  {return { type: TokenType.Arrow,        seek: 2 }}

    // Операторы присваивания: +=, -=, *=, /=, %=, ~=, |=, ^=, .=, :=, !=, &=, ==, ===
    const assignOps = new Set(['+','-','*','/','%','~','|','^','.','!','&','=',':'])
    if(assignOps.has(char) && next === '=') {
        const seek = third === '=' ? 3 : 2
        return { type: TokenType.Assignment, seek }
    }

    if(char === '=' && next !== '=') {return { type: TokenType.Assignment, seek: 1 }}

    if(char === ':' && next === ':') {return { type: TokenType.Word,  seek: 2 }}
    if(char === ':' && next !== ':') {return { type: TokenType.Colon, seek: 1 }}
    if(char === '?' && next === ':') {return { type: TokenType.Colon, seek: 1 }}

    return { type: TokenType.Word, seek: 1 }
}

// ---------------------------------------------------------------------------
// Машина состояний (автомат Шалыто)
// ---------------------------------------------------------------------------

/** Одна итерация автомата. Возвращает новое состояние и, если токен завершён, токен. */
function transition(
    text    : string,
    pos     : number,
    scan    : ScanState,
    config  : LanguageSyntaxConfig,
    tokens  : Token[], // нужен для определения CommaAsWord
): { nextPos: number; nextScan: ScanState; emitToken?: Token } {
    const char  = text[pos]     ?? ''
    const next  = text[pos + 1] ?? ''

    switch(scan.state) {

    // -----------------------------------------------------------------------
    case TokenizerState.InString: {
        if(char === scan.quoteChar && text[pos - 1] !== '\\') {
            // Строка закрыта
            return {
                nextPos : pos + 1,
                nextScan: { ...scan, state: TokenizerState.Default, partial: false },
            }
        }
        return { nextPos: pos + 1, nextScan: scan }
    }

    // -----------------------------------------------------------------------
    case TokenizerState.InBlock: {
        const closeChar = BRACKET_PAIR[scan.blockOpen]
        if(char === scan.blockOpen) {
            return { nextPos: pos + 1, nextScan: { ...scan, blockDepth: scan.blockDepth + 1 } }
        }
        if(char === closeChar && text[pos - 1] !== '\\') {
            if(scan.blockDepth === 1) {
                return {
                    nextPos : pos + 1,
                    nextScan: { ...scan, state: TokenizerState.Default, blockDepth: 0, partial: false },
                }
            }
            return { nextPos: pos + 1, nextScan: { ...scan, blockDepth: scan.blockDepth - 1 } }
        }
        return { nextPos: pos + 1, nextScan: scan }
    }

    // -----------------------------------------------------------------------
    case TokenizerState.InLineComment: {
        // Строковый комментарий поглощает всё до конца строки
        return { nextPos: text.length, nextScan: scan }
    }

    // -----------------------------------------------------------------------
    case TokenizerState.InBlockComment: {
        if(text.startsWith(scan.blockEnd, pos)) {
            return {
                nextPos : pos + scan.blockEnd.length,
                nextScan: { ...scan, state: TokenizerState.Default, partial: false },
            }
        }
        return { nextPos: pos + 1, nextScan: scan }
    }

    // -----------------------------------------------------------------------
    case TokenizerState.Default: {
        // Определяем тип следующего символа
        const nonWsTokensBefore = tokens.filter(t => t.type !== TokenType.Whitespace).length
        const classified        = classifyChar(text, pos, config, nonWsTokensBefore)

        // Если тип сменился — эмитируем накопленный токен, переключаем тип
        if(classified.type !== scan.lastType && scan.tokenStart !== -1) {
            const emitToken: Token = {
                type: scan.lastType,
                text: text.substring(scan.tokenStart, pos),
            }

            let nextState = TokenizerState.Default
            let quoteChar = ''
            let blockOpen = ''
            let blockEnd  = ''
            let partial   = false

            if(classified.type === TokenType.String) {
                nextState = TokenizerState.InString
                quoteChar = text[pos]
            } else if(classified.type === TokenType.Block) {
                nextState = TokenizerState.InBlock
                blockOpen = text[pos]
            } else if(classified.type === TokenType.Comment) {
                const lineMarker  = matchLineComment(text, pos, config)
                const blockEndSeq = matchBlockComment(text, pos, config)
                if(lineMarker !== null) {
                    nextState = TokenizerState.InLineComment
                } else if(blockEndSeq !== null) {
                    nextState = TokenizerState.InBlockComment
                    blockEnd  = blockEndSeq
                }
            }

            return {
                nextPos : pos + classified.seek,
                emitToken,
                nextScan: {
                    ...scan,
                    state     : nextState,
                    lastType  : classified.type,
                    tokenStart: pos,
                    quoteChar,
                    blockOpen,
                    blockEnd,
                    partial,
                },
            }
        }

        // Тот же тип или первый токен — просто входим в нужное подсостояние
        if(scan.tokenStart === -1) {
            let nextState = TokenizerState.Default
            let quoteChar = ''
            let blockOpen = ''
            let blockEnd  = ''

            if(classified.type === TokenType.String) {
                nextState = TokenizerState.InString
                quoteChar = text[pos]
            } else if(classified.type === TokenType.Block) {
                nextState = TokenizerState.InBlock
                blockOpen = text[pos]
            } else if(classified.type === TokenType.Comment) {
                const lineMarker  = matchLineComment(text, pos, config)
                const blockEndSeq = matchBlockComment(text, pos, config)
                if(lineMarker !== null) {
                    nextState = TokenizerState.InLineComment
                } else if(blockEndSeq !== null) {
                    nextState = TokenizerState.InBlockComment
                    blockEnd  = blockEndSeq
                }
            }

            return {
                nextPos : pos + classified.seek,
                nextScan: {
                    ...scan,
                    state     : nextState,
                    lastType  : classified.type,
                    tokenStart: pos,
                    quoteChar,
                    blockOpen,
                    blockEnd,
                },
            }
        }

        return { nextPos: pos + classified.seek, nextScan: scan }
    }

    } // switch
}

// ---------------------------------------------------------------------------
// Публичный интерфейс
// ---------------------------------------------------------------------------

const JS_LIKE_LANGS = new Set([
    'javascript', 'javascriptreact', 'typescript', 'typescriptreact',
])

const SIGNIFICANT_TYPES = new Set([
    TokenType.Assignment,
    TokenType.Colon,
    TokenType.Arrow,
    TokenType.Comment,
])

/** Токенизирует одну строку текстового редактора. */
export function tokenizeLine(
    textLine : vscode.TextLine,
    config   : LanguageSyntaxConfig,
    langId   : string,
): { tokens: Token[]; sgfntTokens: TokenType[] } {
    const text   = textLine.text
    const tokens : Token[] = []

    let pos  = 0
    let scan : ScanState = {
        state     : TokenizerState.Default,
        quoteChar : '',
        blockOpen : '',
        blockDepth: 0,
        blockEnd  : '',
        tokenStart: -1,
        lastType  : TokenType.Invalid,
        partial   : false,
    }

    while(pos < text.length) {
        const result = transition(text, pos, scan, config, tokens)

        if(result.emitToken) {
            // Корректируем CommaAsWord на основе уже накопленных токенов
            let emitted = result.emitToken
            if(emitted.type === TokenType.Comma) {
                const nonWs = tokens.filter(t => t.type !== TokenType.Whitespace)
                if(nonWs.length === 0
                || (nonWs.length === 1 && nonWs[0].type === TokenType.Whitespace)) {
                    emitted = { ...emitted, type: TokenType.CommaAsWord }
                }
            }
            tokens.push(emitted)
        }

        pos  = result.nextPos
        scan = result.nextScan
    }

    // Эмитируем последний незакрытый токен
    if(scan.tokenStart !== -1) {
        let finalType = scan.lastType

        if(scan.state === TokenizerState.InString)       {finalType = TokenType.PartialString}
        if(scan.state === TokenizerState.InBlock)        {finalType = TokenType.PartialBlock}
        if(scan.state === TokenizerState.InBlockComment) {finalType = TokenType.Comment}

        tokens.push({
            type: finalType,
            text: text.substring(scan.tokenStart),
        })
    }

    // Post-process: 'from' в JS/TS
    if(JS_LIKE_LANGS.has(langId)) {
        for(const token of tokens) {
            if(token.type === TokenType.Word && token.text === 'from') {
                token.type = TokenType.From
            }
        }
    }

    // Значимые типы токенов (для определения блока выравнивания)
    const sgfntTokens: TokenType[] = []
    for(const token of tokens) {
        if(SIGNIFICANT_TYPES.has(token.type) && !sgfntTokens.includes(token.type)) {
            sgfntTokens.push(token.type)
        }
    }
    if(JS_LIKE_LANGS.has(langId)) {
        const hasFrom = tokens.some(t => t.type === TokenType.From)
        if(hasFrom && !sgfntTokens.includes(TokenType.From)) {
            sgfntTokens.push(TokenType.From)
        }
    }

    return { tokens, sgfntTokens }
}
