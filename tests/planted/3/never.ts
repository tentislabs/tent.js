import { appendFileSync } from 'node:fs'
import { join } from 'node:path'

// A program that ends at once and never prints the line it is to be killed at.
appendFileSync(join(process.argv[2], 'starts.txt'), 'start\n')
