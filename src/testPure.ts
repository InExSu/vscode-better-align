// Test entry - only pure functions, no VS Code dependencies

export {
    parseLineIgnoringStrings,
    findLineBlocks,
    alignBlock,
    buildPairwisePositionMap,
    applyPositionMap,
    DEFAULT_LANGUAGE_RULES,
    DEFAULT_CONFIG,
    type LanguageRules,
    type LineBlock,
    type ParsedLine,
    type Marker,
    type Token,
    type Result,
} from './fsm_Main'
