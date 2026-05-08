/// <reference types="mocha" />

const assert = require('assert')

const ws = (n: number): string => n <= 0 ? '' : ' '.repeat(Math.min(n, 1e6))

const formatLine = (line: string, maxLeftLen: number, operator: string): string => {
    const trimmed        = line.trimStart()
    const originalIndent = line.slice(0, line.length - trimmed.length)
    const opIdx          = trimmed.indexOf(operator)
    if(opIdx === -1) { return trimmed }
    const left  = trimmed.slice(0, opIdx).trim()
    const right = trimmed.slice(opIdx + operator.length)
    return originalIndent + ws(maxLeftLen - left.length) + left + ' ' + operator + right
}

const alignCode = (code: string, operator = '='): string => {
    const lines = code.split('\n')
    const maxLeftLen = Math.max(...lines.map(l => {
        const t = l.trimStart()
        const i = t.indexOf(operator)
        return i >= 0 ? t.slice(0, i).trim().length : 0
    }))
    return lines.map(l => formatLine(l, maxLeftLen, operator)).join('\n')
}

const show = (desc: string, input: string, output: string, op = '='): void => {
    const code   = input.split('\n').map(l => `  |${l}|`).join('\n')
    const result = output.split('\n').map(l => `  |${l}|`).join('\n')
    console.log(`${desc}:IN:\n${code}\nOUT:\n${result}`)
}

suite('Format multiline', () => {
    test('x = 1 and y = 2 stay equal', () => {
        const input  = 'x = 1\ny = 2'
        const output = alignCode(input)
        assert.strictEqual(output, 'x = 1\ny = 2')
        show              ('x=y', input, output)
    })

    test('x = 1 and xxx = 2 align', () => {
        const input  = 'x = 1\nxxx = 2'
        const output = alignCode(input)
        assert.strictEqual(output, '  x = 1\nxxx = 2')
        show              ('x=xxx', input, output)
    })

    test('>= comparison operators stay intact', () => {
        const input  = 'a >= b\nc >= d'
        const output = alignCode(input, '>=')
        assert.strictEqual(output, 'a >= b\nc >= d')
        show              ('>=', input, output, '>=')
    })

    test('<= comparison operators stay intact', () => {
        const input  = 'x <= 100\nxxx <= 200'
        const output = alignCode(input, '<=')
        assert.strictEqual(output, '  x <= 100\nxxx <= 200')
        show              ('<=', input, output, '<=')
    })

    test('!= comparison operators stay intact', () => {
        const input  = 'x != null\nxxx != null'
        const output = alignCode(input, '!=')
        assert.strictEqual(output, '  x != null\nxxx != null')
        show              ('!=', input, output, '!=')
    })

    test('=== strict equality stays intact', () => {
        const input  = 'a === b\nc === d'
        const output = alignCode(input, '===')
        assert.strictEqual(output, 'a === b\nc === d')
        show              ('===', input, output, '===')
    })

    test('!== strict inequality stays intact', () => {
        const input  = 'a !== b\nc !== d'
        const output = alignCode(input, '!==')
        assert.strictEqual(output, 'a !== b\nc !== d')
        show              ('!==', input, output, '!==')
    })

    test('+= compound assignment stays intact', () => {
        const input  = 'x += 1\nyyy += 2'
        const output = alignCode(input, '+=')
        assert.strictEqual(output, '  x += 1\nyyy += 2')
        show              ('+=', input, output, '+=')
    })

    test('<== comparison operators stay intact', () => {
        const input  = 'a <== b\nccc <== d'
        const output = alignCode(input, '<==')
        assert.strictEqual(output, '  a <== b\nccc <== d')
        show              ('<==', input, output, '<==')
    })

    test('>== comparison operators stay intact', () => {
        const input  = 'x >== 100\nyyy >== 200'
        const output = alignCode(input, '>==')
        assert.strictEqual(output, '  x >== 100\nyyy >== 200')
        show              ('>==', input, output, '>==')
    })
})

suite('Different operators', () => {
    test('=> aligns arrows', () => {
        const input  = 'x => 1\nxxx => 2'
        const output = alignCode(input, '=>')
        assert.strictEqual(output, '  x => 1\nxxx => 2')
        show              ('=>', input, output, '=>')
    })

    test(': aligns types', () => {
        const input  = 'x: number\nxxx: string'
        const output = alignCode(input, ':')
        assert.strictEqual(output, '  x : number\nxxx : string')
        show              (':', input, output, ':')
    })

    test('. aligns property access', () => {
        const input  = 'let x      = x.x\nlet y = y.y'
        const output = alignCode(input, '=')
        assert.strictEqual(output, 'let x = x.x\nlet y = y.y')
        show              ('.', input, output)
    })
})

suite('OpenBrace alignment', () => {
    test('finds { position in line', () => {
        const lines     = ['function a() { return 1 }', 'function longName() { return 2 }']
        const positions = lines.map(l => l.indexOf('{'))
        assert.strictEqual(positions[0], 13)
        assert.strictEqual(positions[1], 20)
    })

    test('max indent calculation for braces', () => {
        const lines     = ['function a() { return 1 }', 'function longName() { return 2 }']
        const positions = lines.map(l => l.indexOf('{'))
        const maxPos    = Math.max(...positions)
        assert.strictEqual(maxPos, 20)
    })
})

suite('Semicolon alignment', () => {
    test('finds ; position in line', () => {
        const lines     = ['let a = 1;', 'let bc = 2;']
        const positions = lines.map(l => l.indexOf(';'))
        assert.strictEqual(positions[0], 9)
        assert.strictEqual(positions[1], 10)
    })

    test('max prefix before semicolon', () => {
        const lines     = ['let a = 1;', 'let bc = 2;']
        const positions = lines.map(l => l.indexOf(';'))
        const maxPos    = Math.max(...positions)
        assert.strictEqual(maxPos, 10)
    })
})

suite('Colon alignment', () => {
    test('finds : position in line', () => {
        const lines     = ['a: number', 'bb: string']
        const positions = lines.map(l => l.indexOf(':'))
        assert.strictEqual(positions[0], 1)
        assert.strictEqual(positions[1], 2)
    })
})

suite('Token type classification', () => {
    test('operators detected correctly', () => {
        const ops = [
             { text: '=', expected: '=' }    ,
             { text: '===', expected: '===' },
             { text: '>=', expected: '>=' }  ,
             { text: '=>', expected: '=>' }  ,
        ]
        for(const op of ops) {
            const idx = op.text.indexOf(op.expected)
            assert.ok(idx >= 0, `Found ${op.text}`)
        }
    })

    test('whitespace trimming works', () => {
        const line    = '   let x = 1'
        const trimmed = line.trimStart()
        assert.strictEqual(trimmed, 'let x = 1')
        assert.strictEqual(line.length - trimmed.length, 3)
    })

    test('indent calculation', () => {
        const line    = '    let x = 1'
        const trimmed = line.trimStart()
        const indent  = line.slice(0, line.length - trimmed.length)
        assert.strictEqual(indent, '    ')
    })
})

suite('Alignment algorithms', () => {
    test('max width calculation', () => {
        const lines = ['a = 1', 'xxx = 2']
        const widths = lines.map(l => {
            const t = l.trimStart()
            return t.slice(0, t.indexOf('=')).trim().length
        })
        const maxWidth = Math.max(...widths)
        assert.strictEqual(maxWidth, 3)
    })

    test('padding calculation', () => {
        const maxWidth = 3
        const left     = 'x'
        const padding  = ws(maxWidth - left.length)
        assert.strictEqual(padding.length, 2)
    })

    test('multiline join', () => {
        const lines  = ['a = 1', 'xxx = 2']
        const result = lines.join('\n')
        assert.strictEqual(result, 'a = 1\nxxx = 2')
    })
})

suite('String handling', () => {
test('string with escaped quotes', () => {
        const text        = 'let s = "hello \\"world\\" end"'
        const firstQuote  = text.indexOf('"')
        const secondQuote = text.indexOf('"', firstQuote + 1)
        assert.strictEqual(firstQuote, 8)
        assert.ok         (secondQuote > firstQuote, 'second quote found')
    })

    test('backtick strings', () => {
        const text  = '`template ${var}`'
        const first = text.indexOf('`')
        const last  = text.lastIndexOf('`')
        assert.strictEqual(first, 0)
        assert.strictEqual(last, 16)
    })
})

suite('Block comment detection', () => {
    test('/* */ found', () => {
        const text  = 'code /* comment */ more'
        const start = text.indexOf('/*')
        const end   = text.indexOf('*/')
        assert.strictEqual(start, 5)
        assert.strictEqual(end, 16)
    })

    test('<!-- --> found', () => {
        const text  = '<!-- comment -->'
        const start = text.indexOf('<!--')
        const end   = text.indexOf('-->')
        assert.strictEqual(start, 0)
        assert.strictEqual(end, 13)
    })
})