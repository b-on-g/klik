namespace $.$$ {

	export class $bog_klik_play extends $.$bog_klik_play {

		session_link() {
			return this.store().session_link()
		}

		players_dict() {
			return this.store().players_dict()
		}

		self_player() {
			const dict = this.players_dict()
			if (!dict) return null
			return dict.key(this.store().my_lord_str(), 'auto')
		}

		@ $mol_mem
		score() {
			return this.self_player()?.Score()?.val() ?? 0
		}

		score_title() {
			return `Счёт: ${ this.score() }`
		}

		share_title() {
			return `Ссылка: ${ this.session_link() || '—' }`
		}

		@ $mol_mem
		name(next?: string) {
			if (next !== undefined) {
				this.self_player()?.Name('auto')?.val(next)
				return next
			}
			return this.self_player()?.Name()?.val() ?? ''
		}

		@ $mol_action
		click() {
			const player = this.self_player()
			if (!player) return
			const cur = player.Score()?.val() ?? 0
			player.Score('auto')?.val(cur + this.per_tick())
		}

		@ $mol_action
		create_click() {
			this.store().create_session()
		}

		@ $mol_mem
		start_block() {
			return this.session_link() ? [] : [ this.Create() ]
		}

		@ $mol_mem
		game_block() {
			if (!this.session_link()) return []
			return [
				this.Params(),
				this.Click(),
				this.Auto(),
			]
		}

		/** Реактивный автокликер: ре-инвалидируется каждые tick_ms и добавляет per_tick к счёту */
		@ $mol_mem
		auto_tick() {
			if (!this.auto_click()) return 0
			const now = this.$.$mol_state_time.now(this.tick_ms())
			this.click()
			return now
		}

		override auto() {
			try { this.auto_tick() } catch (e) { if ($mol_promise_like(e)) $mol_fail_hidden(e) }
			return super.auto()
		}

	}

}
