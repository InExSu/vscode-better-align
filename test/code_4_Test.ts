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

  function test1(
    str1: string,
    s2: string): string {
    return str1 + s2
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
    | { kd: 'code'; t: string }
    | { kind: 'string'; text: string }

}