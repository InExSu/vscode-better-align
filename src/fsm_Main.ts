// ============================================================
// А1: Главный конвейерный автомат (FSM)
// ============================================================
import { NS } from './extension'

/** А1: Главный конвейерный автомат */
export enum PipelineState {
    Idle = 'Idle',
    LoadConfig = 'LoadConfig',
    DetectLanguage = 'DetectLanguage',
    FindBlocks = 'FindBlocks',
    ParseLines = 'ParseLines',
    Align = 'Align',
    ReplaceText = 'ReplaceText',
    Done = 'Done',
    Error = 'Error',
}

export type Decorator = (ns: NS) => void

export function buildPipelineFSM(
    config_Load_Decor: Decorator,
    language_Detect_Decor: Decorator,
    block_Find_Decor: Decorator,
    lines_Parse_Decor: Decorator,
    alignment_Apply_Decor: Decorator,
    text_Replace_Decor: Decorator,
    rwd: (fn: Decorator, ns: NS) => void
): (ns: NS) => void {
    const ns_Error = (ns: NS): boolean => ns.result.ok === false

    return function а1_PipelineFSM(ns: NS): void {
        let state = PipelineState.Idle

        mainLoop: while (true) {
            switch (state) {
                case PipelineState.Idle:
                    state = PipelineState.LoadConfig
                    break

                case PipelineState.LoadConfig:
                    rwd(config_Load_Decor, ns)
                    state = ns_Error(ns) ? PipelineState.Error : PipelineState.DetectLanguage
                    break

                case PipelineState.DetectLanguage:
                    rwd(language_Detect_Decor, ns)
                    state = ns_Error(ns) ? PipelineState.Error : PipelineState.FindBlocks
                    break

                case PipelineState.FindBlocks:
                    rwd(block_Find_Decor, ns)
                    state = ns_Error(ns) ? PipelineState.Error : PipelineState.ParseLines
                    break

                case PipelineState.ParseLines:
                    rwd(lines_Parse_Decor, ns)
                    state = ns_Error(ns) ? PipelineState.Error : PipelineState.Align
                    break

                case PipelineState.Align:
                    rwd(alignment_Apply_Decor, ns)
                    state = ns_Error(ns) ? PipelineState.Error : PipelineState.ReplaceText
                    break

                case PipelineState.ReplaceText:
                    rwd(text_Replace_Decor, ns)
                    state = ns_Error(ns) ? PipelineState.Error : PipelineState.Done
                    break

                case PipelineState.Done:
                case PipelineState.Error:
                    break mainLoop
            }
        }
    }
}