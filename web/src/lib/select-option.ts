/** Match only an option actually offered by a Select control. */
export function findSelectOption<T extends { value: string }>(
  options: readonly T[],
  value: string,
): T | undefined {
  return options.find((option) => option.value === value)
}
