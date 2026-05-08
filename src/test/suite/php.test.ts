/// <reference types = "mocha" />

const phpAssert = require('assert')

const enum TokenType {
    Invalid       = 'Invalid'      ,
    Word          = 'Word'         ,
    Assignment    = 'Assignment'   ,
    Arrow         = 'Arrow'        ,
    Block         = 'Block'        ,
    PartialBlock  = 'PartialBlock' ,
    EndOfBlock    = 'EndOfBlock'   ,
    String        = 'String'       ,
    PartialString = 'PartialString',
    Comment       = 'Comment'      ,
    Whitespace    = 'Whitespace'   ,
    Colon         = 'Colon'        ,
    Comma         = 'Comma'        ,
    CommaAsWord   = 'CommaAsWord'  ,
    Insertion     = 'Insertion'    ,
    Spaceship     = 'Spaceship'    ,
    PHPShortEcho  = 'PHPShortEcho' ,
    From          = 'From'         ,
    Comparison    = 'Comparison'   ,
}

interface Token                { type: TokenType; text: string }
interface BlockComment         { start: string; end: string }
interface LanguageSyntaxConfig { lineComments: string[]; blockComments: BlockComment[] }

const DEFAULT_LANG: Record<string, LanguageSyntaxConfig> = {
    php : { lineComments : ['//', '#'], blockComments : [{ start: '/*', end: '*/' }] },
}

const FALLBACK: LanguageSyntaxConfig = { lineComments: ['//'], blockComments: [{ start: '/*', end: '*/' }] }

const getLangConfig = (lang: string, overrides: Record<string, LanguageSyntaxConfig> = {}) =>
    overrides[lang] ?? DEFAULT_LANG[lang] ?? FALLBACK

const sortByLenDesc = <T extends string | { start: string }>(arr: T[]): T[] =>
    [...arr].sort((a, b) => {
        const len = (x: T) => typeof x === 'string' ? x.length : (x as BlockComment).start.length
        return len(b) - len(a)
    })

const matchPrefix = (text: string, pos: number, markers: string[]): string | null => {
    for (const m of sortByLenDesc(markers)) {
        if(text.startsWith(m, pos)) { return m }
    }
    return null
}

const findLineComment = (text: string, pos: number, cfg: LanguageSyntaxConfig): string | null => {
    const m = matchPrefix(text, pos, cfg.lineComments)
    return m === '//' && pos > 0 && text[pos - 1] === ':' ? null : m
}

const findBlockCommentEnd = (text: string, pos: number, cfg: LanguageSyntaxConfig): string | null => {
    for (const bc of sortByLenDesc(cfg.blockComments)) {
        if(text.startsWith(bc.start, pos)) { return bc.end }
    }
    return null
}

const isGenericOpen = (text: string, pos: number): boolean => {
    if(pos === 0) { return false }
    const prev = text[pos - 1]!
    return /[\w>\\]/.test(prev)
}

const consumeGeneric = (text: string, pos: number): number => {
    let depth = 0
    let i     = pos
    while (i < text.length) {
        if(text[i] === '<') { depth++; i++; continue }
        if (text[i] === '>') {
            depth--
            i++
            if(depth === 0) { return i }
            continue
        }
        i++
    }
    return -1
}

function classifyAtDefault(
    text : string, pos : number, cfg : LanguageSyntaxConfig
): { type: TokenType; advance: number } {
    const ch = text[pos] ?? ''
    const nx = text[pos + 1] ?? ''
    const rd = text[pos + 2] ?? ''

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        return { type: TokenType.Whitespace, advance: 1 }
    }

    switch (ch) {
        case '"' : 
        case "'" : 
        case '`' : 
            return { type: TokenType.String, advance: 1 }

        case '{' : 
        case '(' : 
        case '[' : 
            return { type: TokenType.Block, advance: 1 }

        case '}' : 
        case ')' : 
        case ']' : 
            return { type: TokenType.EndOfBlock, advance: 1 }

        case ',' : 
            return { type: TokenType.Comma, advance: 1 }

        case '<': {
            if (nx === '?') {
                let end = pos + 2
                while(end < text.length && /[a-zA-Z]/.test(text[end]!)) { end++ }
                return { type: TokenType.Word, advance: end - pos }
            }

            if(nx === '=' && rd === '>') { return { type: TokenType.Spaceship, advance: 3 } }

            if(nx === '=' && rd === '=') { return { type: TokenType.Comparison, advance: 3 } }
            if(nx === '=') { return { type: TokenType.Comparison, advance: 2 } }

            if (isGenericOpen(text, pos)) {
                const end = consumeGeneric(text, pos)
                if(end !== -1) { return { type: TokenType.Word, advance: end - pos } }
            }

            return { type: TokenType.Comparison, advance: 1 }
        }

        case '>' : 
            if(nx === '=' && rd === '=') { return { type: TokenType.Comparison, advance: 3 } }
            if(nx === '=') { return { type: TokenType.Comparison, advance: 2 } }
            return { type: TokenType.Comparison, advance: 1 }

        case '!' : 
            if(nx === '=' && rd === '=') { return { type: TokenType.Comparison, advance: 3 } }
            if(nx === '=') { return { type: TokenType.Comparison, advance: 2 } }
            return { type: TokenType.Word, advance: 1 }

        case '=' : 
            if(nx === '>') { return { type: TokenType.Arrow, advance: 2 } }
            if(nx === '=' && rd === '=') { return { type: TokenType.Comparison, advance: 3 } }
            if(nx === '=') { return { type: TokenType.Comparison, advance: 2 } }
            return { type: TokenType.Assignment, advance: 1 }

        case '-' : 
            if(nx === '>') { return { type: TokenType.Word, advance: 2 } }
            if(nx === '=') { return { type: TokenType.Assignment, advance: 2 } }
            return { type: TokenType.Word, advance: 1 }

        case '+' : 
        case '*' : 
        case '%' : 
        case '~' : 
        case '|' : 
        case '^' : 
        case '.' : 
        case '&' : 
            if(nx === '=') { return { type: TokenType.Assignment, advance: 2 } }
            return { type: TokenType.Word, advance: 1 }

        case '/': {
            const lc = findLineComment(text, pos, cfg)
            if(lc) { return { type: TokenType.Comment, advance: 1 } }
            const bcEnd = findBlockCommentEnd(text, pos, cfg)
            if(bcEnd) { return { type: TokenType.Comment, advance: 1 } }
            if(nx === '=') { return { type: TokenType.Assignment, advance: 2 } }
            return { type: TokenType.Word, advance: 1 }
        }

        case ':' : 
            if(nx === ':') { return { type: TokenType.Word, advance: 2 } }
            if(nx === '=') { return { type: TokenType.Assignment, advance: 2 } }
            return { type: TokenType.Colon, advance: 1 }
    }

    if(findLineComment(text, pos, cfg)) { return { type: TokenType.Comment, advance: 1 } }
    if(findBlockCommentEnd(text, pos, cfg)) { return { type: TokenType.Comment, advance: 1 } }

    return { type: TokenType.Word, advance: 1 }
}

const enum State { Default, InString, InBlock, InLineComment, InBlockComment }

function tokenizeLine(text: string, cfg: LanguageSyntaxConfig): Token[] {
    const tokens: Token[] = []

    let state      = State.Default
    let tokenStart = -1
    let lastType   = TokenType.Invalid
    let quote      = ''
    let open       = ''
    let blockDepth = 0
    let blockEnd   = ''

    const flush = (upTo: number, overrideType?: TokenType) => {
        if         (tokenStart === -1) { return }
        tokens.push({ type: overrideType ?? lastType, text: text.substring(tokenStart, upTo) })
        tokenStart = -1
    }

    let pos = 0
    while (pos < text.length) {
        switch (state) {
            case State.InString: {
                if (text[pos] === quote) {
                    let backslashCount = 0
                    let k              = pos - 1
                    while(k >= 0 && text[k] === '\\') { backslashCount++; k-- }
                    if (backslashCount % 2 === 0) {
                        pos++
                        flush(pos)
                        state = State.Default
                        break
                    }
                }
                pos++
                break
            }

            case State.InBlock: {
                if (text[pos] === open) {
                    blockDepth++
                    pos++
                } else if (text[pos] === (open === '{' ? '}' : open === '(' ? ')' : ']')) {
                    pos++
                    if (--blockDepth === 0) {
                        flush(pos)
                        state = State.Default
                    }
                } else {
                    pos++
                }
                break
            }

            case State.InLineComment: {
                pos = text.length
                flush(text.length)
                break
            }

            case State.InBlockComment: {
                if (text.startsWith(blockEnd, pos)) {
                    pos += blockEnd.length
                    flush(pos)
                    state = State.Default
                } else {
                    pos++
                }
                break
            }

            case State.Default: {
                const { type, advance } = classifyAtDefault(text, pos, cfg)

                if (advance > 1 && type === TokenType.Word) {
                    flush      (pos)
                    tokens.push({ type: TokenType.Word, text: text.substring(pos, pos + advance) })
                    lastType    = TokenType.Word
                    tokenStart  = -1
                    pos        += advance
                    break
                }

                if (type !== lastType) {
                    flush(pos)
                    lastType   = type
                    tokenStart = pos

                    if(type === TokenType.String) { state = State.InString; quote = text[pos] ?? '' }
                    else if(type === TokenType.Block) { state = State.InBlock; open = text[pos] ?? ''; blockDepth = 1 }
                    else if (type === TokenType.Comment) {
                        if(findLineComment(text, pos, cfg)) { state = State.InLineComment }
                        else {
                            const end = findBlockCommentEnd(text, pos, cfg)
                            if(end) { state = State.InBlockComment; blockEnd = end }
                        }
                    }
                } else if (tokenStart === -1) {
                    tokenStart = pos
                    if(type === TokenType.String) { state = State.InString; quote = text[pos] ?? '' }
                    else if(type === TokenType.Block) { state = State.InBlock; open = text[pos] ?? ''; blockDepth = 1 }
                    else if (type === TokenType.Comment) {
                        if(findLineComment(text, pos, cfg)) { state = State.InLineComment }
                        else {
                            const end = findBlockCommentEnd(text, pos, cfg)
                            if(end) { state = State.InBlockComment; blockEnd = end }
                        }
                    }
                }

                pos += advance
                break
            }
        }
    }

    if (tokenStart !== -1) {
        flush(text.length)
    }

    return tokens
}

suite('PHP tokenization', () => {
    const phpCfg = getLangConfig('php')

    test('-> is tokenized as single Word token', () => {
        const tokens     = tokenizeLine('$this->foo', phpCfg)
        const arrowToken = tokens.find(t => t.text === '->')
        phpAssert.ok         (arrowToken, 'Should find -> token')
        phpAssert.strictEqual(arrowToken!.type, TokenType.Word, '-> should be Word type')
    })

    test('-> in method chaining is preserved', () => {
        const tokens = tokenizeLine('$obj->method()->property', phpCfg)
        const texts  = tokens.map(t => t.text).join('')
        phpAssert.strictEqual(texts, '$obj->method()->property')
    })

    test('<?php tag is tokenized as single Word token', () => {
        const tokens = tokenizeLine('<?php echo "hello";', phpCfg)
        const phpTag = tokens.find(t => t.text.startsWith('<?'))
        phpAssert.ok         (phpTag, 'Should find <?php tag')
        phpAssert.strictEqual(phpTag!.type, TokenType.Word, '<?php should be Word type')
    })

    test('<?= short echo tag is tokenized correctly', () => {
        const tokens = tokenizeLine('<?= $var ?>', phpCfg)
        const phpTag = tokens.find(t => t.text.startsWith('<?'))
        phpAssert.ok         (phpTag, 'Should find <?= tag')
        phpAssert.strictEqual(phpTag!.type, TokenType.Word, '<?= should be Word type')
    })

    test('PHP block comment /* */ is recognized', () => {
        const tokens       = tokenizeLine('$x = 1; /* block */', phpCfg)
        const commentToken = tokens.find(t => t.text.startsWith('/*'))
        phpAssert.ok         (commentToken, 'Should find /* comment token')
        phpAssert.strictEqual(commentToken!.type, TokenType.Comment, '/* should be Comment type')
    })

    test('generic type annotation following word is handled', () => {
        const tokens   = tokenizeLine('array<string> $param', phpCfg)
        const hasArray = tokens.some(t => t.text.startsWith('array'))
        phpAssert.ok(hasArray, 'Should have array token')
    })

    test('complex PHP code with all features', () => {
        const code = `<?php
class Foo {
    public function bar(array<array<string>> $a_1S): void {
        $this->foo()
            ->method()
            ->chain ();
    }
}`
        const lines = code.split('\n')
        for (const line of lines) {
            const tokens = tokenizeLine(line, phpCfg)
            const texts  = tokens.map(t => t.text).join('')
            phpAssert.strictEqual(texts, line, `Line should tokenize correctly: "${line}"`)
        }
    })

    test('spaceship operator <=> works in PHP', () => {
        const tokens    = tokenizeLine('$a <=> $b', phpCfg)
        const spaceship = tokens.find(t => t.text === '<=>')
        phpAssert.ok(spaceship, 'Should find <=> operator')
    })

    test('PHP variables with $ are preserved', () => {
        const tokens = tokenizeLine('$name = "test"', phpCfg)
        const texts  = tokens.map(t => t.text).join('')
        phpAssert.strictEqual(texts, '$name = "test"')
    })
})