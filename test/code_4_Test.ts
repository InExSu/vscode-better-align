{
  let x = 1
  let longName = 2

  if(x === 1) { }
  if(longName === 2) { }
  if(x === 1) { }

  function fn_AutoSearchIndent() {
    let z = 1
    let pq = { start: 0, end: 0 }
    return { startLine: 0, endLine: 0 }
  }

  function test1(s1: string, s2: string): string {
    return s1 + s2
  }

  let t1 = {
    z: test1('1', ''),
    y: test1('333', ''),
  }

  let z = {
    s1: test1('maxBlockSize', ''),
    preserveComments: test1('preserveComments', ''),
  }

  type Token =
    | { kind: 'code'; text: string }
    | { kind: 'string'; text: string }

}