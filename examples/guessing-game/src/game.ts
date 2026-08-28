type GuessResult = 'correct' | 'higher' | 'lower'

export function checkGuess(guess: number, answer: number): GuessResult {
  if (guess === answer) {
    return 'correct'
  }
  return guess < answer ? 'higher' : 'lower'
}

