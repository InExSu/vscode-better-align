function compute(a                        : number, b: number) {
    const sum     = a + b
    const diff    = a - b
    const product = a * b
    const longVariableName = 12345
    const obj = { keyOne: 'value1', keyTwo: 'value2' }
    if(a === b) {
        console.log('equal')
    }
    return { sum, diff, product }
}