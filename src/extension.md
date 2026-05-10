# Function Call Map — src/extension.ts

```mermaid
flowchart TB
    subgraph Entry["VS Code Entry Point"]
        activate["activate(context)"]
        runAlign["runAlign()"]
    end

    subgraph NS_Creation["NS Creation"]
        NS_Container["NS_Container(cfg)"]
    end

    subgraph Chain["a_Chain - Main Pipeline"]
        config_Load["config_Load_Decor"]
        language_Detect["language_Detect_Decor"]
        block_Find["block_Find_Decor"]
        lines_Parse["lines_Parse_Decor"]
        pattern_Compute["pattern_Compute_Decor"]
        alignment_Apply["alignment_Apply_Decor"]
        text_Replace["text_Replace_Decor"]
    end

    subgraph Config["Configuration"]
        loadConfig["loadConfig()"]
    end

    subgraph Language["Language Detection"]
        detectLanguageRules["detectLanguageRules()"]
    end

    subgraph Block["Block Finding"]
        extractRawLines["extractRawLines()"]
        findLineBlocks["findLineBlocks()"]
    end

    subgraph Parse["Line Parsing"]
        parseLineIgnoringStrings["parseLineIgnoringStrings()"]
    end

    subgraph Pattern["Pattern Computation"]
        findAlignCharsGreedy["findAlignCharsGreedy()"]
        findDominantPrefix["findDominantPrefix()"]
    end

    subgraph Alignment["Alignment Application"]
        computeColumnPositionsWithLength["computeColumnPositionsWithLength()"]
        applySpacingRespectingMultichar["applySpacingRespectingMultichar()"]
        alignBlock["alignBlock()"]
    end

    subgraph Replace["Text Replacement"]
        applyEditorReplacements["applyEditorReplacements()"]
    end

    activate --> runAlign
    runAlign --> NS_Container
    NS_Container --> Chain

    Chain --> config_Load
    config_Load --> loadConfig

    Chain --> language_Detect
    language_Detect --> detectLanguageRules

    Chain --> block_Find
    block_Find --> extractRawLines
    block_Find --> findLineBlocks

    Chain --> lines_Parse
    lines_Parse --> parseLineIgnoringStrings

    Chain --> pattern_Compute
    pattern_Compute --> findAlignCharsGreedy
    pattern_Compute --> findDominantPrefix
    findAlignCharsGreedy --> parseLineIgnoringStrings

    Chain --> alignment_Apply
    alignment_Apply --> computeColumnPositionsWithLength
    alignment_Apply --> applySpacingRespectingMultichar
    alignment_Apply --> alignBlock
    applySpacingRespectingMultichar --> alignBlock

    Chain --> text_Replace
    text_Replace --> applyEditorReplacements
```

## Call Sequence

1. `activate` → registers VS Code commands
2. `runAlign` → creates NS via `NS_Container`
3. `a_Chain` executes 7 decorators sequentially:

| Step | Decorator | Pure Function |
|------|----------|--------------|
| 1 | `config_Load_Decor` | `loadConfig` |
| 2 | `language_Detect_Decor` | `detectLanguageRules` |
| 3 | `block_Find_Decor` | `extractRawLines`, `findLineBlocks` |
| 4 | `lines_Parse_Decor` | `parseLineIgnoringStrings` |
| 5 | `pattern_Compute_Decor` | `findDominantPrefix` |
| 6 | `alignment_Apply_Decor` | `alignBlock`, `computeColumnPositionsWithLength`, `applySpacingRespectingMultichar` |
| 7 | `text_Replace_Decor` | `applyEditorReplacements` |

## Data Flow

```
CONFIG (defaults)
    ↓
NS_Container → NS
    ↓
a_Chain → NS.data {
    editor,
    languageRules,
    blocks[],
    parsedLines[][],
    commonPrefix[][],
    alignedLines[][]
}
```