2026-05-12 12:55:26
src/extension.ts ведёт себя так:
1 - ничего не выделено, курсор в коде, нажимаю alt+a - код выравнивается
2 - выделяю блок кода, нажимаю alt+a - код выравнивается
3 - выделяю весь код,, нажимаю alt+a - код НЕ выравнивается.
Сделай чтобы при выделении всего кода и нажатии alt+a код выравнивался в нужных местах.

2026-05-12 13:12:18
Выделил весь код, нажал alt+a, произошло выравнивание кода, но неправильное.
Например код
    lineComments: string[]
    blockComments: { start: string; end: string }[]
    stringDelimiters: string[]
    alignChars: string[]
Превратился в 
export type LanguageRules = {
    lineComments: string[]
    blockComments: { start             : string; end: string }[]
    stringDelimiters: string[]
    alignChars: string[]
}
А если я без выделения, находясь в этом коде нажму alt+a, то код выравнивается правильно
export type LanguageRules = {
    lineComments    : string[]
    blockComments   : { start: string; end: string }[]
    stringDelimiters: string[]
    alignChars      : string[]
}

2026-05-12 13:24:47
Проанализируй файлы:
src/extension.ts
src/fsm_Main.ts
AGENTS.md
AI Prompt_General.md
AI Prompt_This.md
И создай файлы настроек скиллов для этого проекта для claude code cli