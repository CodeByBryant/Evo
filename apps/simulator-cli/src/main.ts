import { DEFAULT_PRESET, presetByName } from '@evo/config'
import { ENGINE_VERSION, World, observatoryCsv } from '@evo/simulation'

/** `--name value` from the arguments, or `undefined`. */
function option(args: readonly string[], name: string): string | undefined {
  const at = args.indexOf(`--${name}`)
  return at === -1 ? undefined : args[at + 1]
}

const args = process.argv.slice(2)
if (args.includes('--observatory')) {
  // Runs a world and prints the evolution observatory's indicators over time as CSV (ADR 0024).
  const seed = Number(option(args, 'seed') ?? 1)
  const ticks = Number(option(args, 'ticks') ?? 30_000)
  const presetName = option(args, 'preset') ?? DEFAULT_PRESET
  const preset = presetByName(presetName)
  if (preset === undefined) {
    console.error(`unknown preset "${presetName}"`)
    process.exit(1)
  }
  const world = World.create({ seed, config: preset.overrides })
  world.run(ticks)
  const series = world.observatory()
  if (series === null) {
    console.error('the observatory is switched off for this world')
    process.exit(1)
  }
  process.stdout.write(observatoryCsv(series))
} else {
  console.log(`evo simulator ${ENGINE_VERSION}`)
  console.log(
    'usage: --observatory [--seed N] [--ticks N] [--preset NAME]  (CSV of the evolution indicators)'
  )
}
