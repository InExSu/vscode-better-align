import { LanguageSyntaxConfig } from './types'

// ---------------------------------------------------------------------------
// Default syntax configs per language (read-only registry)
// ---------------------------------------------------------------------------

const DEFAULT_LANGUAGE_CONFIGS: Readonly<Record<string, LanguageSyntaxConfig>> = {
    bash       : { lineComments: ['#'],    blockComments: [] },
    c          : { lineComments: ['//'],   blockComments: [{ start: '/*', end: '*/' }] },
    clojure    : { lineComments: [';'],    blockComments: [] },
    cpp        : { lineComments: ['//'],   blockComments: [{ start: '/*', end: '*/' }] },
    csharp     : { lineComments: ['//'],   blockComments: [{ start: '/*', end: '*/' }] },
    css        : { lineComments: [],       blockComments: [{ start: '/*', end: '*/' }] },
    dockerfile : { lineComments: ['#'],    blockComments: [] },
    elm        : { lineComments: ['--'],   blockComments: [{ start: '{-', end: '-}' }] },
    fish       : { lineComments: ['#'],    blockComments: [] },
    go         : { lineComments: ['//'],   blockComments: [{ start: '/*', end: '*/' }] },
    haskell    : { lineComments: ['--'],   blockComments: [{ start: '{-', end: '-}' }] },
    html       : { lineComments: [],       blockComments: [{ start: '<!--', end: '-->' }] },
    ini        : { lineComments: ['#',';'],blockComments: [] },
    java       : { lineComments: ['//'],   blockComments: [{ start: '/*', end: '*/' }] },
    javascript : { lineComments: ['//'],   blockComments: [{ start: '/*', end: '*/' }] },
    julia      : { lineComments: ['#'],    blockComments: [{ start: '#=', end: '=#' }] },
    kotlin     : { lineComments: ['//'],   blockComments: [{ start: '/*', end: '*/' }] },
    less       : { lineComments: ['//'],   blockComments: [{ start: '/*', end: '*/' }] },
    lisp       : { lineComments: [';'],    blockComments: [] },
    lua        : { lineComments: ['--'],   blockComments: [{ start: '--[[', end: ']]' }] },
    makefile   : { lineComments: ['#'],    blockComments: [] },
    matlab     : { lineComments: ['%'],    blockComments: [{ start: '%{', end: '%}' }] },
    perl       : { lineComments: ['#'],    blockComments: [] },
    php        : { lineComments: ['//', '#'], blockComments: [{ start: '/*', end: '*/' }] },
    powershell : { lineComments: ['#'],    blockComments: [] },
    python     : { lineComments: ['#'],    blockComments: [] },
    r          : { lineComments: ['#'],    blockComments: [] },
    ruby       : { lineComments: ['#'],    blockComments: [] },
    rust       : { lineComments: ['//'],   blockComments: [{ start: '/*', end: '*/' }] },
    scala      : { lineComments: ['//'],   blockComments: [{ start: '/*', end: '*/' }] },
    scheme     : { lineComments: [';'],    blockComments: [] },
    scss       : { lineComments: ['//'],   blockComments: [{ start: '/*', end: '*/' }] },
    shellscript: { lineComments: ['#'],    blockComments: [] },
    sql        : { lineComments: ['--'],   blockComments: [{ start: '/*', end: '*/' }] },
    swift      : { lineComments: ['//'],   blockComments: [{ start: '/*', end: '*/' }] },
    toml       : { lineComments: ['#'],    blockComments: [] },
    typescript : { lineComments: ['//'],   blockComments: [{ start: '/*', end: '*/' }] },
    vim        : { lineComments: ['"'],    blockComments: [] },
    xml        : { lineComments: [],       blockComments: [{ start: '<!--', end: '-->' }] },
    yaml       : { lineComments: ['#'],    blockComments: [] },
    zsh        : { lineComments: ['#'],    blockComments: [] },
}

const FALLBACK_CONFIG: LanguageSyntaxConfig = {
    lineComments : ['//'],
    blockComments: [{ start: '/*', end: '*/' }],
}

// ---------------------------------------------------------------------------
// Lookup — SRP: pure function, no side-effects
// ---------------------------------------------------------------------------

export function getLanguageSyntaxConfig(
    languageId       : string,
    userOverrides    : Record<string, LanguageSyntaxConfig> = {},
): LanguageSyntaxConfig {
    return userOverrides[languageId]
        ?? DEFAULT_LANGUAGE_CONFIGS[languageId]
        ?? FALLBACK_CONFIG
}
