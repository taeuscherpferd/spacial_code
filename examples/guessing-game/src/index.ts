import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { checkGuess } from './game.js'
import { getGuess } from './input.js'
import { randomBetween } from './random.js'

async function main(): Promise<void> {
  const terminal = createInterface({ input: stdin, output: stdout })
  const answer = randomBetween(1, 100)
  let attempts = 0

  console.log('I picked a number from 1 to 100.')
  while (true) {
    const guess = await getGuess(terminal)
    attempts += 1
    const result = checkGuess(guess, answer)
    if (result === 'correct') {
      console.log(`Correct — you found it in ${attempts} attempts.`)
      break
    }
    console.log(`Try ${result}.`)
  }
  terminal.close()
}

await main()

