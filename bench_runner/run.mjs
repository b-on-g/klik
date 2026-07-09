#!/usr/bin/env node
/**
 * Klik load-test runner (Puppeteer).
 *
 * What it does:
 *   1. Launches Chromium with an isolated user-data-dir under /tmp — avoids
 *      the main Chrome's wedged $giper_baza_mine IndexedDB.
 *   2. Opens a creator tab on http://localhost:9080/bog/klik/app/-/test.html,
 *      creates a session via store.create_session(), captures the ?land= link.
 *   3. For each N in BOT_LEVELS, opens a fresh bench tab on that session,
 *      sets bots_count=N, running=true, waits for warmup, then samples the
 *      reported ops/s and latency for a measurement window.
 *   4. Prints a table of ops/s and latency per N, and saves raw samples to
 *      ./out/report-<ts>.json.
 *
 * Assumes:
 *   - mam dev server on :9080 (npm start in /Users/cmyser/code/mam)
 *   - giper baza master on :9090
 *   - bog/klik/store/store.web.ts already overrides masters_default to :9090
 */

import puppeteer from 'puppeteer'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const APP_URL = 'http://localhost:9080/bog/klik/app/-/index.html'

const BOT_LEVELS = (process.env.BOT_LEVELS ?? '10,50,100,200,400,800,1600').split(',').map(Number)
const BOT_TICK_MS = Number(process.env.BOT_TICK_MS ?? 1000)
const BOT_PER_TICK = Number(process.env.BOT_PER_TICK ?? 1)
const WARMUP_MS = Number(process.env.WARMUP_MS ?? 5000)
const SAMPLE_MS = Number(process.env.SAMPLE_MS ?? 10000)
const SAMPLE_INTERVAL_MS = 500

const OUT_DIR = path.resolve('./out')

function now() { return new Date().toISOString().replace(/[:.]/g, '-') }
function log(...a) { console.log('[bench]', ...a) }

async function waitFor(page, fn, { timeout = 30000, interval = 200, label = 'condition' } = {}) {
	const deadline = Date.now() + timeout
	while (Date.now() < deadline) {
		const v = await page.evaluate(fn)
		if (v) return v
		await new Promise(r => setTimeout(r, interval))
	}
	throw new Error(`Timed out waiting for ${label}`)
}

async function createSession(browser) {
	const page = await browser.newPage()
	page.on('pageerror', e => log('pageerror(creator):', e.message))
	page.on('console', m => {
		const t = m.type()
		if (t === 'error' || t === 'warning' || t === 'log' || t === 'info') {
			log(`[${t}]`, m.text().slice(0, 200))
		}
	})
	// Prevent $mol_offline from registering a service worker that would reload the page mid-session.
	await page.evaluateOnNewDocument(() => {
		try {
			Object.defineProperty(navigator, 'serviceWorker', { get: () => undefined })
		} catch {}
	})
	await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
	log('creator page loaded, waiting for $giper_baza_glob ...')

	await waitFor(page, () => !!window.$?.$giper_baza_glob, { label: '$giper_baza_glob' })

	log('kicking off land_grab ...')
	await page.evaluate(() => {
		const $ = window.$
		window.__sessionResult = 'pending'
		const rank = $.$giper_baza_rank_post('just')
		$.$mol_wire_async($.$giper_baza_glob).land_grab([[null, rank]])
			.then(land => {
				const link = land.link().str
				$.$mol_state_arg.value('land', link)
				window.__sessionResult = link
			})
			.catch(e => { window.__sessionResult = 'err: ' + (e?.message || String(e)) })
	})

	let link
	try {
		link = await waitFor(
			page,
			() => {
				const r = window.__sessionResult
				return r && r !== 'pending' ? r : null
			},
			{ timeout: 60000, label: 'session land link' },
		)
	} catch(e) {
		const diag = await page.evaluate(() => {
			const $ = window.$
			const res = { result: window.__sessionResult }
			try { res.defaults = $.$giper_baza_yard.masters_default } catch(err) { res.defaults = 'err' }
			try { res.lord = $.$giper_baza_auth.current().pass().lord().str } catch(err) { res.lord = 'susp/err: ' + (err?.message || String(err).slice(0,120)) }
			try { res.masters = $.$giper_baza_yard.masters() } catch(err) { res.masters = 'susp/err: ' + (err?.message || String(err).slice(0,120)) }
			return res
		}).catch(err => ({ diagErr: err.message }))
		log('DIAG on timeout:', JSON.stringify(diag))
		throw e
	}
	if (typeof link === 'string' && link.startsWith('err:')) throw new Error('Session create failed: ' + link)
	log('session link:', link)
	return { page, link }
}

async function diagnoseSession(page) {
	const diag = await page.evaluate(() => {
		const $ = window.$
		const res = { result: window.__sessionResult }
		try { res.defaults = $.$giper_baza_yard.masters_default } catch(e) { res.defaults = 'err' }
		try { res.lord = $.$giper_baza_auth.current().pass().lord().str } catch(e) { res.lord = 'susp/err: ' + (e?.message || String(e).slice(0,100)) }
		try { res.masters = JSON.stringify($.$giper_baza_yard.masters()) } catch(e) { res.masters = 'susp/err: ' + (e?.message || String(e).slice(0,100)) }
		return res
	})
	log('DIAG:', JSON.stringify(diag))
}

async function runBotLevel(browser, sessionLink, n) {
	const page = await browser.newPage()
	const errors = []
	page.on('pageerror', e => errors.push(e.message))
	await page.evaluateOnNewDocument(() => {
		try {
			Object.defineProperty(navigator, 'serviceWorker', { get: () => undefined })
		} catch {}
	})

	const url = `${APP_URL}#!screen=bench/land=${encodeURIComponent(sessionLink)}`
	await page.goto(url, { waitUntil: 'domcontentloaded' })
	await waitFor(page, () => !!window.$?.$bog_klik_app, { label: '$bog_klik_app loaded' })
	await page.evaluate(() => {
		const $ = window.$
		const app = $.$bog_klik_app.Root(0)
		app.screen('bench')
		// Force a render cycle.
		try { app.dom_tree() } catch(e) {}
	})
	try {
		await waitFor(page, () => !!document.querySelector('[id*="$bog_klik_app.Root(0).Bench()"]'),
			{ timeout: 15000, label: 'bench view mounted in DOM' })
	} catch(e) {
		const dom = await page.evaluate(() => ({
			tags: [...document.querySelectorAll('body *')].slice(0,30).map(e => e.tagName.toLowerCase()),
			screen: (window.$?.$bog_klik_app?.Root?.(0))?.screen?.(),
			hash: location.hash,
			bodyHTML: document.body.innerHTML.slice(0, 1500),
		}))
		log('DOM dump:', JSON.stringify(dom).slice(0, 2000))
		throw e
	}

	await page.evaluate((n, tick, per) => {
		const $ = window.$
		const app = $.$bog_klik_app.Root(0)
		const bench = app.Bench()
		bench.bots_count(n)
		bench.bot_tick_ms(tick)
		bench.bot_per_tick(per)
		bench.running(true)
		window.__bench = bench
	}, n, BOT_TICK_MS, BOT_PER_TICK)

	log(`N=${n} running, warmup ${WARMUP_MS}ms ...`)
	await new Promise(r => setTimeout(r, WARMUP_MS))

	log(`N=${n} sampling ${SAMPLE_MS}ms ...`)
	const samples = []
	const startWrites = await page.evaluate(() => window.__bench.writes_total())
	const tStart = Date.now()
	while (Date.now() - tStart < SAMPLE_MS) {
		const snap = await page.evaluate(() => ({
			ops: window.__bench.ops_count(),
			latency: window.__bench.latency_ms(),
			writes: window.__bench.writes_total(),
		}))
		samples.push({ t: Date.now() - tStart, ...snap })
		await new Promise(r => setTimeout(r, SAMPLE_INTERVAL_MS))
	}
	const endWrites = await page.evaluate(() => window.__bench.writes_total())
	const elapsed = (Date.now() - tStart) / 1000
	const realOps = (endWrites - startWrites) / elapsed

	await page.evaluate(() => window.__bench.running(false))
	await page.close()

	const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
	const reportedOps = avg(samples.map(s => s.ops))
	const avgLatency = avg(samples.map(s => s.latency))
	const maxLatency = Math.max(0, ...samples.map(s => s.latency))

	return {
		n,
		reportedOps: Math.round(reportedOps),
		realOps: Math.round(realOps),
		avgLatency: Math.round(avgLatency),
		maxLatency,
		writesDelta: endWrites - startWrites,
		errors,
		samples,
	}
}

async function main() {
	await fs.mkdir(OUT_DIR, { recursive: true })
	const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'klik-bench-'))
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

	let diagPage = null
	try {
		let createResult
		try {
			createResult = await createSession(browser)
		} catch(e) {
			if (diagPage) await diagnoseSession(diagPage).catch(()=>{})
			throw e
		}
		const { page: creator, link } = createResult
		diagPage = creator
		// Keep creator tab open so the session land stays warm on client caches.
		const results = []
		for (const n of BOT_LEVELS) {
			try {
				const r = await runBotLevel(browser, link, n)
				log(`N=${n} real=${r.realOps} ops/s reported=${r.reportedOps} ops/s lat_avg=${r.avgLatency}ms lat_max=${r.maxLatency}ms errors=${r.errors.length}`)
				results.push(r)
				if (r.errors.length) log('errors:', r.errors.slice(0, 3))
				// Degradation gate: stop early if real ops/s collapse to < 10% of N/sec.
				if (r.realOps < n * 0.1) {
					log(`N=${n} collapsed (realOps ${r.realOps} < 10% of N), stopping escalation`)
					break
				}
			} catch (e) {
				log(`N=${n} FAILED:`, e.message)
				results.push({ n, error: e.message })
				break
			}
		}

		const reportPath = path.join(OUT_DIR, `report-${now()}.json`)
		await fs.writeFile(reportPath, JSON.stringify({
			config: { APP_URL, BOT_LEVELS, BOT_TICK_MS, BOT_PER_TICK, WARMUP_MS, SAMPLE_MS },
			sessionLink: link,
			results,
		}, null, 2))
		log('saved:', reportPath)

		console.log('\n=== ИТОГИ ===')
		console.log('  Ботов | Записей/с (реально) | Ожидалось/с | Лаг средн. (мс) | Лаг макс. (мс) | Всего записей')
		for (const r of results) {
			if (r.error) { console.log(`  ${String(r.n).padEnd(5)} | ОШИБКА: ${r.error}`); continue }
			console.log(`  ${String(r.n).padEnd(5)} | ${String(r.realOps).padStart(19)} | ${String(r.reportedOps).padStart(11)} | ${String(r.avgLatency).padStart(15)} | ${String(r.maxLatency).padStart(14)} | ${r.writesDelta}`)
		}
		console.log('\nКолонки:')
		console.log('  Ботов              — количество одновременных писателей')
		console.log('  Записей/с реально  — реальный throughput (по общему счётчику за окно сбора)')
		console.log('  Ожидалось/с        — reported ops_count от bench на последнем тике')
		console.log('  Лаг средн./макс.   — длительность одного tick() (пакет записей всех ботов)')
		console.log('  Всего записей     — сколько ячеек обновили за окно сбора')
	} finally {
		await browser.close()
	}
}

main().catch(e => { console.error(e); process.exit(1) })
