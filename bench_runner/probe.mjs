import puppeteer from 'puppeteer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'klik-probe-'))
const browser = await puppeteer.launch({
	headless: true,
	userDataDir,
	args: [
		'--no-sandbox',
		'--enable-experimental-web-platform-features',
		'--enable-features=WebCryptoCurve25519',
	],
})
const page = await browser.newPage()
await page.goto('http://localhost:9080/bog/klik/app/-/test.html', { waitUntil: 'domcontentloaded' })

const r1 = await page.evaluate(async () => {
	try {
		const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])
		return { ok: true, type: pair.privateKey.algorithm.name }
	} catch(e) { return { ok: false, err: String(e) } }
})
console.log('Ed25519:', r1)

const r2 = await page.evaluate(async () => {
	try {
		const pair = await crypto.subtle.generateKey('X25519', true, ['deriveKey', 'deriveBits'])
		return { ok: true, type: pair.privateKey.algorithm.name }
	} catch(e) { return { ok: false, err: String(e) } }
})
console.log('X25519:', r2)

const r3 = await page.evaluate(async () => {
	const result = { error: null, steps: [] }
	try {
		const $ = window.$
		result.steps.push('pre-generate')
		const t0 = Date.now()
		const auth = await $.$giper_baza_auth.generate()
		result.steps.push('post-generate t=' + (Date.now() - t0) + 'ms')
		result.auth = auth?.pass?.()?.lord?.()?.str
	} catch(e) {
		result.error = e?.message || String(e).slice(0, 300)
	}
	return result
})
console.log('auth.generate():', r3)

await browser.close()
