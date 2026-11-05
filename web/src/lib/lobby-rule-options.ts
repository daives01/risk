export const FORTIFY_MODE_OPTIONS = [
  { value: 'connected', label: 'Connected' },
  { value: 'adjacent', label: 'Adjacent' },
] as const

export const MAX_FORTIFY_OPTIONS = [
  { value: 'unlimited', label: 'Unlimited' },
  { value: '0', label: '0' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
] as const

export const TIMING_MODE_OPTIONS = [
  { value: 'realtime', label: 'Realtime (no turn timer)' },
  { value: 'async_1d', label: 'Async (1 day / turn)' },
  { value: 'async_3d', label: 'Async (3 days / turn)' },
] as const

export type GameTimingMode = (typeof TIMING_MODE_OPTIONS)[number]['value']

// Resolve emitted select text through the rendered options, preserving literal types.
export function findLobbyOption<Value extends string>(
  options: readonly { value: Value }[],
  value: string,
): Value | undefined {
  return options.find((option) => option.value === value)?.value
}
