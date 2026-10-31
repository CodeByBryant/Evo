import type { BrainArchitecture } from '@evo/contracts'

/** Where one weight block sits inside the genome's flat weight vector. */
export interface BlockSpan {
  readonly offset: number
  readonly length: number
}

/**
 * The positions of the eight weight blocks for one brain architecture (docs/learning/brain.md).
 * The order and shapes are part of the hash schema: changing them changes what every stored
 * weight means. Blocks 6-8 are contiguous at the end of the vector, so the learnable part of a
 * brain is one tail slice (`learnOffset ..`), which is what `BrainState.learned` holds.
 */
export interface BrainLayout {
  readonly architecture: BrainArchitecture
  readonly inputToHidden: BlockSpan
  readonly memoryToHidden: BlockSpan
  readonly hiddenBias: BlockSpan
  readonly hiddenToMemory: BlockSpan
  readonly memoryBias: BlockSpan
  readonly hiddenToOutput: BlockSpan
  readonly outputBias: BlockSpan
  /** Value-head weights (one per hidden unit) followed by one bias. */
  readonly hiddenToValue: BlockSpan
  readonly total: number
  /** Index in the weight vector where the learnable tail begins (the `hiddenToOutput` block). */
  readonly learnOffset: number
  /** Length of the learnable tail: actor weights, actor biases, value weights, value bias. */
  readonly learnLength: number
  /** Length of the actor part of the tail (`hiddenToOutput` plus `outputBias`). */
  readonly actorLength: number
}

/** Block lengths in storage order. */
export function brainBlockLengths(architecture: BrainArchitecture): number[] {
  const { inputSize, hiddenSize, memorySize, outputSize } = architecture
  return [
    hiddenSize * inputSize, // inputToHidden
    hiddenSize * memorySize, // memoryToHidden
    hiddenSize, // hiddenBias
    memorySize * hiddenSize, // hiddenToMemory
    memorySize, // memoryBias
    outputSize * hiddenSize, // hiddenToOutput
    outputSize, // outputBias
    hiddenSize + 1 // hiddenToValue (weights, then the value bias)
  ]
}

export function brainLayoutOf(architecture: BrainArchitecture): BrainLayout {
  const lengths = brainBlockLengths(architecture)
  const spans: BlockSpan[] = []
  let offset = 0
  for (const length of lengths) {
    spans.push({ offset, length })
    offset += length
  }
  const [
    inputToHidden,
    memoryToHidden,
    hiddenBias,
    hiddenToMemory,
    memoryBias,
    hiddenToOutput,
    outputBias,
    hiddenToValue
  ] = spans as [
    BlockSpan,
    BlockSpan,
    BlockSpan,
    BlockSpan,
    BlockSpan,
    BlockSpan,
    BlockSpan,
    BlockSpan
  ]
  return {
    architecture,
    inputToHidden,
    memoryToHidden,
    hiddenBias,
    hiddenToMemory,
    memoryBias,
    hiddenToOutput,
    outputBias,
    hiddenToValue,
    total: offset,
    learnOffset: hiddenToOutput.offset,
    learnLength: offset - hiddenToOutput.offset,
    actorLength: hiddenToOutput.length + outputBias.length
  }
}
