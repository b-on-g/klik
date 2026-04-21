namespace $.$$ {

	export class $bog_klik_bench extends $.$bog_klik_bench {

		players_dict() {
			return this.store().players_dict()
		}

		bot_key(i: number) {
			return `bot-${ i }`
		}

		@ $mol_mem
		bot_indexes() {
			if (!this.running()) return [] as number[]
			const out = [] as number[]
			for (let i = 0; i < this.bots_count(); i++) out.push(i)
			return out
		}

		/** На каждом тике каждому боту инкрементится Score. Запись идёт в общий ленд. */
		@ $mol_mem
		tick() {
			if (!this.running()) return 0
			const dict = this.players_dict()
			if (!dict) return 0

			const start = Date.now()
			const now = this.$.$mol_state_time.now(this.bot_tick_ms())

			let writes = 0
			for (const i of this.bot_indexes()) {
				const player = dict.key(this.bot_key(i), 'auto')
				if (!player) continue
				const cur = player.Score()?.val() ?? 0
				player.Score('auto')?.val(cur + this.bot_per_tick())
				const name = player.Name()?.val() ?? ''
				if (!name) player.Name('auto')?.val(this.bot_key(i))
				writes++
			}

			const dur = Date.now() - start
			const tick_sec = Math.max(1, Math.round(this.bot_tick_ms() / 1000))
			this.ops_count(Math.round(writes / tick_sec))
			this.writes_total((this.writes_total() ?? 0) + writes)
			this.latency_ms(dur)

			return now
		}

		@ $mol_mem
		ops_count(next?: number) {
			return next ?? 0
		}

		@ $mol_mem
		writes_total(next?: number) {
			return next ?? 0
		}

		@ $mol_mem
		latency_ms(next?: number) {
			return next ?? 0
		}

		ops_title() {
			return `Ops/s: ${ this.ops_count() }`
		}

		writes_title() {
			return `Всего записей: ${ this.writes_total() }`
		}

		latency_title() {
			return `Лаг записи, мс: ${ this.latency_ms() }`
		}

		override auto() {
			try { this.tick() } catch (e) { if ($mol_promise_like(e)) $mol_fail_hidden(e) }
			return super.auto()
		}

	}

}
