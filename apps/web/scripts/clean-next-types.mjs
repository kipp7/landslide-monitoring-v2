import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')

const candidates = ['.next_v2/types', '.next_web/types', '.next/types']

for (const rel of candidates) {
  const full = path.join(appRoot, rel)
  try {
    if (!fs.existsSync(full)) continue
    fs.rmSync(full, { recursive: true, force: true })
    // eslint-disable-next-line no-console
    console.log(`[clean-next-types] removed ${full}`)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[clean-next-types] failed to remove ${full}:`, err)
  }
}

