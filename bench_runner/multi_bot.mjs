#!/usr/bin/env node
/**
 * Klik multi-client load test.
 *
 * Шаги:
 *   1. Puppeteer открывает вкладку и вызывает $giper_baza_glob.land_grab
 *      (только так стабильно получаем session link — Node-only попытка вылетает OOM-ом
 *       в $mol_wire при кике sync_yard без DOM-owner).
 *   2. Для каждого N из BOT_LEVELS спавним N независимых Node-процессов
 *      (bog/klik/bot/-/node.js) — у каждого свой auth, свой WebSocket,
 *      своя запись в общий дикт через Giper Baza API.
 *   3. В течение SAMPLE_MS собираем агрегированные write-rate / errors.
 *   4. Результат печатаем таблицей и сохраняем в ./out/multi-<ts>.json.
 */

import puppeteer from 'puppeteer'
import { spawn } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'

const APP_URL = 'http://localhost:9080/bog/klik/app/-/index.html'
const MASTER = process.env.KLIK_MASTER || 'http://localhost:9090/'
const BOT_JS = path.resolve( new URL( '../bot/-/node.js', import.meta.url ).pathname )

const BOT_LEVELS = (process.env.BOT_LEVELS ?? '10,50,100,200').split(',').map(Number)
const BOT_TICK_MS = Number(process.env.BOT_TICK_MS ?? 1000)
const BOT_PER_TICK = Number(process.env.BOT_PER_TICK ?? 1)
const WARMUP_MS = Number(process.env.WARMUP_MS ?? 8000)   // плюс время на sync rank-юнита
const SAMPLE_MS = Number(process.env.SAMPLE_MS ?? 15000)
const OUT_DIR = path.resolve('./out')

const log = (...a) => console.log('[multi]', ...a)
const now = () => new Date().toISOString().replace(/[:.]/g, '-')

async function waitFor(page, fn, { timeout = 60000, interval = 200, label } = {}) {
	const deadline = Date.now() + timeout
	while (Date.now() < deadline) {
		const v = await page.evaluate(fn)
		if (v) return v
		await new Promise(r => setTimeout(r, interval))
	}
	throw new Error('Timed out waiting for ' + label)
}

async function createSession() {
	const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'klik-multi-'))
	log('userDataDir:', userDataDir)
	const browser = await puppeteer.launch({
		headless: true,
		userDataDir,
		args: [
			'--no-sandbox',
			'--disable-web-security',
			'--enable-experimental-web-platform-features',
			'--enable-features=WebCryptoCurve25519',
			'--disable-features=ServiceWorker',
		],
	})
	const page = await browser.newPage()
	page.on('pageerror', e => log('pageerror:', e.message))
	await page.evaluateOnNewDocument(() => {
		try { Object.defineProperty(navigator, 'serviceWorker', { get: () => undefined }) } catch {}
	})
	await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
	await waitFor(page, () => !!window.$?.$giper_baza_glob, { label: '$giper_baza_glob' })

	await page.evaluate(() => {
		const $ = window.$
		window.__sessionResult = 'pending'
		const rank = $.$giper_baza_rank_post('just')
		$.$mol_wire_async($.$giper_baza_glob).land_grab([[null, rank]])
			.then(land => { window.__sessionResult = land.link().str })
			.catch(e => { window.__sessionResult = 'err: ' + (e?.message || String(e)) })
	})
	const link = await waitFor(page, () => {
		const r = window.__sessionResult
		return r && r !== 'pending' ? r : null
	}, { timeout: 60000, label: 'session land link' })
	if (typeof link === 'string' && link.startsWith('err:')) throw new Error(link)
	log('session:', link)

	// Keep the creator tab open — the land needs a live seed publisher
	// so joining bots can pull rank-юнит. We return an accessor to close later.
	return { link, cleanup: () => browser.close() }
}

function spawnBot(i, session, duration_ms) {
	const env = {
		...process.env,
		KLIK_MASTER: MASTER,
		KLIK_SESSION: session,
		KLIK_BOT_ID: 'bot-' + i,
		KLIK_TICK_MS: String(BOT_TICK_MS),
		KLIK_PER_TICK: String(BOT_PER_TICK),
		KLIK_DURATION_MS: String(duration_ms),
		KLIK_REPORT_MS: '2000',
	}
	const child = spawn(process.execPath, [ '--enable-source-maps', BOT_JS ], { env, stdio: ['ignore', 'pipe', 'pipe'] })

	const state = { started: false, writes: 0, errors: 0, exited: false, exitCode: null, lastErr: '' }

	child.stdout.setEncoding('utf8')
	child.stdout.on('data', chunk => {
		for (const line of chunk.split('\n')) {
			if (!line.trim()) continue
			try {
				const ev = JSON.parse(line)
				if (ev.event === 'start') state.started = true
				if (typeof ev.writes === 'number') state.writes = ev.writes
				if (typeof ev.errors === 'number') state.errors = ev.errors
			} catch {}
		}
	})
	child.stderr.setEncoding('utf8')
	child.stderr.on('data', chunk => { state.lastErr = chunk.slice(0, 300) })
	child.on('exit', (code) => { state.exited = true; state.exitCode = code })

	return { child, state }
}

async function runLevel(session, n) {
	log(`N=${n}: spawning ${n} bot processes ...`)
	const duration = WARMUP_MS + SAMPLE_MS + 2000
	const bots = Array.from({ length: n }, (_, i) => spawnBot(i, session, duration))

	// warmup
	log(`N=${n}: warmup ${WARMUP_MS}ms`)
	await new Promise(r => setTimeout(r, WARMUP_MS))

	const started = bots.filter(b => b.state.started).length
	const tooLow = bots.filter(b => b.state.exited && b.state.exitCode === 3).length
	const startWrites = bots.reduce((a, b) => a + b.state.writes, 0)
	log(`N=${n}: ${started} of ${n} started, ${tooLow} too-low-tier, sampling ${SAMPLE_MS}ms`)

	const tStart = Date.now()
	await new Promise(r => setTimeout(r, SAMPLE_MS))
	const elapsedSec = (Date.now() - tStart) / 1000
	const endWrites = bots.reduce((a, b) => a + b.state.writes, 0)
	const errors = bots.reduce((a, b) => a + b.state.errors, 0)
	const realOps = (endWrites - startWrites) / elapsedSec

	for (const b of bots) b.child.kill('SIGTERM')
	await Promise.all(bots.map(b => new Promise(res => b.child.on('exit', res))))

	return {
		n, started, tooLow,
		writesDelta: endWrites - startWrites,
		realOps: Math.round(realOps),
		errors,
		sampleErrors: bots.filter(b => b.state.lastErr).slice(0, 3).map(b => b.state.lastErr),
	}
}

async function main() {
	await fs.mkdir(OUT_DIR, { recursive: true })
	const { link, cleanup } = await createSession()

	const results = []
	try {
		for (const n of BOT_LEVELS) {
			const r = await runLevel(link, n)
			log(`N=${n}: real=${r.realOps} ops/s writes=${r.writesDelta} started=${r.started}/${n} low-tier=${r.tooLow} errors=${r.errors}`)
			if (r.sampleErrors.length) log('  err samples:', r.sampleErrors)
			results.push(r)
			if (r.started < n * 0.5) {
				log('too many bots failed to start, stopping escalation')
				break
			}
		}
	} finally {
		await cleanup()
	}

	const reportPath = path.join(OUT_DIR, `multi-${now()}.json`)
	await fs.writeFile(reportPath, JSON.stringify({
		config: { APP_URL, MASTER, BOT_LEVELS, BOT_TICK_MS, BOT_PER_TICK, WARMUP_MS, SAMPLE_MS },
		sessionLink: link,
		results,
	}, null, 2))
	log('saved:', reportPath)

	console.log('\n=== ИТОГИ multi-client ===')
	console.log('  Ботов | Старт   | Записей/с | Всего записей | Low-tier | Errors')
	for (const r of results) {
		console.log(`  ${String(r.n).padEnd(5)} | ${String(r.started).padStart(3)}/${String(r.n).padEnd(3)} | ${String(r.realOps).padStart(9)} | ${String(r.writesDelta).padStart(13)} | ${String(r.tooLow).padStart(8)} | ${r.errors}`)
	}
}

main().catch(e => { console.error(e); process.exit(1) })
