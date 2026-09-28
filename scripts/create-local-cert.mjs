import { mkdirSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const certificateDirectory = resolve(repositoryRoot, 'apps/xr/.cert')
const interfaceAddresses = Object.values(networkInterfaces()).flatMap((addresses) =>
  (addresses ?? [])
    .filter((address) => address.family === 'IPv4' && !address.internal)
    .map((address) => address.address),
)
const lanAddress = process.argv[2] ?? interfaceAddresses[0]

if (!lanAddress) {
  console.error('Could not find a local network IPv4 address. Pass one explicitly: pnpm https:cert -- 192.168.1.20')
  process.exit(1)
}

if (spawnSync('mkcert', ['-version'], { stdio: 'ignore' }).status !== 0) {
  console.error('Install mkcert, then run pnpm https:cert again.')
  process.exit(1)
}

mkdirSync(certificateDirectory, { recursive: true })

const certificate = spawnSync(
  'mkcert',
  [
    '-cert-file',
    resolve(certificateDirectory, 'local-cert.pem'),
    '-key-file',
    resolve(certificateDirectory, 'local-key.pem'),
    'localhost',
    '127.0.0.1',
    '::1',
    lanAddress,
  ],
  { stdio: 'inherit' },
)

if (certificate.error || certificate.status !== 0) {
  process.exit(1)
}

const caDirectory = spawnSync('mkcert', ['-CAROOT'], { encoding: 'utf8' })
const caRoot = caDirectory.stdout.trim()

console.log(`\nLocal HTTPS is ready for https://localhost:5173 and https://${lanAddress}:5173.`)
console.log(`On a headset, install and trust this local CA certificate: ${resolve(caRoot, 'rootCA.pem')}`)
console.log('Keep the CA private key on this computer. Run pnpm dev, then open the LAN address on the headset.')
