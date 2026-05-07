export function whitespace(count: number): string {
    if(count <= 0) { return '' }
    if(!isFinite(count) || count > 1e6) { count = 1e6 }
    return ' '.repeat(count)
}
