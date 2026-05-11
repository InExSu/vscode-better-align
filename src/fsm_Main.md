# FSM Documentation

## ScannerState (A2 - line_Parse)
```mermaid
graph LR
    CodeReading --> StringDouble
    CodeReading --> StringSingle
    CodeReading --> TemplateBacktick
    CodeReading --> BlockComment
    CodeReading --> CommentDone
```

## GroupingState (A3 - blocks_Find)
```mermaid
graph LR
    WaitingForStart --> Accumulating
    Accumulating --> WaitingForStart
```

## PropagationState (A4 - positions_Propagate)
```mermaid
graph LR
    FindingSeries --> Accumulating
    Accumulating --> FindingSeries
```

## PositionMapState (positionMap_Build)
```mermaid
graph LR
    Collect --> ProcessSymbols
    ProcessSymbols --> Propagate
    Propagate --> Done
```

## PipelineState (pipeline_Build)
```mermaid
graph LR
    Idle --> LoadConfig
    LoadConfig --> DetectLanguage
    DetectLanguage --> FindBlocks
    FindBlocks --> ParseLines
    ParseLines --> Align
    Align --> ReplaceText
    ReplaceText --> Done
    ReplaceText --> Error
    LoadConfig --> Error
    DetectLanguage --> Error
    FindBlocks --> Error
    ParseLines --> Error
    Align --> Error
```

## BlockSearchState (extension.ts - blockSearchFSM)
```mermaid
graph LR
    WaitingForData --> ValidatingContext
    ValidatingContext --> AnalyzingSelection
    AnalyzingSelection --> ExtractingLines
    ExtractingLines --> GroupingBlocks
    GroupingBlocks --> Done
    AnalyzingSelection --> Error
    ValidatingContext --> Error
```