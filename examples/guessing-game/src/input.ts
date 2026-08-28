import type { Interface } from 'node:readline/promises'

export async function getGuess(terminal: Interface): Promise<number> {
  while (true) {
    const response = await terminal.question('Your guess: ')
    const guess = Number(response)
    if (Number.isInteger(guess) && guess >= 1 && guess <= 100) {
      return guess
    }
    console.log('Please enter a whole number from 1 to 100.')
  }
}

