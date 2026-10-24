import type { BrainLayout } from './BrainLayout'

/**
 * Softsign, `x / (1 + |x|)`: bounded in (-1, 1) and smooth, and built only from `+`, `/` and
 * `abs`, so it is bit-identical on every platform (the determinism policy bans platform `exp`
 * and `tanh`).
 */
export function softsign(x: number): number {
  return x / (1 + Math.abs(x))
}

export interface HiddenPass {
  readonly hidden: number[]
  /** The memory for the next tick. */
  readonly memory: number[]
}

/**
 * The part of the network that depends only on the genome: observation and memory in, hidden
 * activations and next memory out. Learning never changes these weights during a life.
 * Sums accumulate bias first, then in index order, so the result is reproducible.
 */
export function forwardHidden(
  layout: BrainLayout,
  weights: readonly number[],
  observation: readonly number[],
  memory: readonly number[]
): HiddenPass {
  const { inputSize, hiddenSize, memorySize } = layout.architecture
  const { inputToHidden, memoryToHidden, hiddenBias, hiddenToMemory, memoryBias } = layout
  const hidden: number[] = new Array<number>(hiddenSize)
  for (let h = 0; h < hiddenSize; h++) {
    let sum = weights[hiddenBias.offset + h] as number
    const inputRow = inputToHidden.offset + h * inputSize
    for (let i = 0; i < inputSize; i++) {
      sum += (weights[inputRow + i] as number) * (observation[i] as number)
    }
    const memoryRow = memoryToHidden.offset + h * memorySize
    for (let m = 0; m < memorySize; m++) {
      sum += (weights[memoryRow + m] as number) * (memory[m] as number)
    }
    hidden[h] = softsign(sum)
  }
  const nextMemory: number[] = new Array<number>(memorySize)
  for (let m = 0; m < memorySize; m++) {
    let sum = weights[memoryBias.offset + m] as number
    const row = hiddenToMemory.offset + m * hiddenSize
    for (let h = 0; h < hiddenSize; h++) {
      sum += (weights[row + h] as number) * (hidden[h] as number)
    }
    nextMemory[m] = softsign(sum)
  }
  return { hidden, memory: nextMemory }
}

/** The actor's output layer, read from the learned overlay (`learned[0 ..]`). */
export function readOutput(
  layout: BrainLayout,
  learned: readonly number[],
  hidden: readonly number[]
): number[] {
  const { hiddenSize, outputSize } = layout.architecture
  const biasBase = outputSize * hiddenSize
  const output: number[] = new Array<number>(outputSize)
  for (let o = 0; o < outputSize; o++) {
    let sum = learned[biasBase + o] as number
    const row = o * hiddenSize
    for (let h = 0; h < hiddenSize; h++) {
      sum += (learned[row + h] as number) * (hidden[h] as number)
    }
    output[o] = softsign(sum)
  }
  return output
}

/** The critic's value estimate, read from the learned overlay. */
export function readValue(
  layout: BrainLayout,
  learned: readonly number[],
  hidden: readonly number[]
): number {
  const { hiddenSize } = layout.architecture
  const base = layout.actorLength
  let sum = learned[base + hiddenSize] as number
  for (let h = 0; h < hiddenSize; h++) {
    sum += (learned[base + h] as number) * (hidden[h] as number)
  }
  return sum
}
