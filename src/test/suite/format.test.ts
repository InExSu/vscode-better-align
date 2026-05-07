/// <reference types="mocha" />

const assert = require('assert')

const ws = (n: number): string => n <= 0 ? '' : ' '.repeat(Math.min(n, 1e6))

const formatLine = (line: string, maxLeftLen: number, operator: string): string => {
    const trimmed = line.trimStart()
    const originalIndent = line.slice(0, line.length - trimmed.length)
    const opIdx = trimmed.indexOf(operator)
    if(opIdx === -1) { return trimmed }
    const left = trimmed.slice(0, opIdx).trim()
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
    const code = input.split('\n').map(l => `  |${l}|`).join('\n')
    const result = output.split('\n').map(l => `  |${l}|`).join('\n')
    console.log(`${desc}:IN:\n${code}\nOUT:\n${result}`)
}

suite('Format multiline', () => {
    test('x = 1 and y = 2 stay equal', () => {
        const input = 'x = 1\ny = 2'
        const output = alignCode(input)
        assert.strictEqual(output, 'x = 1\ny = 2')
        show('x=y', input, output)
    })

    test('x = 1 and xxx = 2 align', () => {
        const input = 'x = 1\nxxx = 2'
        const output = alignCode(input)
        assert.strictEqual(output, '  x = 1\nxxx = 2')
        show('x=xxx', input, output)
    })

    test('>= comparison operators stay intact', () => {
        const input = 'a >= b\nc >= d'
        const output = alignCode(input, '>=')
        assert.strictEqual(output, 'a >= b\nc >= d')
        show('>=', input, output, '>=')
    })

    test('<= comparison operators stay intact', () => {
        const input = 'x <= 100\nxxx <= 200'
        const output = alignCode(input, '<=')
        assert.strictEqual(output, '  x <= 100\nxxx <= 200')
        show('<=', input, output, '<=')
    })

    test('!= comparison operators stay intact', () => {
        const input = 'x != null\nxxx != null'
        const output = alignCode(input, '!=')
        assert.strictEqual(output, '  x != null\nxxx != null')
        show('!=', input, output, '!=')
    })
})

suite('Different operators', () => {
    test('=> aligns arrows', () => {
        const input = 'x => 1\nxxx => 2'
        const output = alignCode(input, '=>')
        assert.strictEqual(output, '  x => 1\nxxx => 2')
        show('=>', input, output, '=>')
    })

    test(': aligns types', () => {
        const input = 'x: number\nxxx: string'
        const output = alignCode(input, ':')
        assert.strictEqual(output, '  x : number\nxxx : string')
        show(':', input, output, ':')
    })

    test('. aligns property access', () => {
        const input = 'let x      = x.x\nlet y = y.y'
        const output = alignCode(input, '=')
        assert.strictEqual(output, 'let x = x.x\nlet y = y.y')
        show('.', input, output)
    })
})