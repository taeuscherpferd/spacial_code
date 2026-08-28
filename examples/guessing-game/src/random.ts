export function randomBetween(minimum: number, maximum: number): number {
  const range = maximum - minimum + 1
  return Math.floor(Math.random() * range) + minimum
}

