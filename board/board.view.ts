namespace $.$$ {

	export class $bog_klik_board extends $.$bog_klik_board {

		players_dict() {
			return this.store().players_dict()
		}

		@ $mol_mem
		player_keys() {
			const dict = this.players_dict()
			if (!dict) return [] as string[]
			return Array.from(dict.keys()).map(k => String(k))
		}

		@ $mol_mem
		entries_sorted() {
			const dict = this.players_dict()
			if (!dict) return [] as Array<{ key: string; name: string; score: number }>
			const items = this.player_keys().map(key => {
				const p = dict.key(key)
				return {
					key,
					name: p?.Name()?.val() ?? '',
					score: p?.Score()?.val() ?? 0,
				}
			})
			items.sort((a, b) => b.score - a.score)
			return items
		}

		total_title() {
			return `Игроков: ${ this.entries_sorted().length }`
		}

		@ $mol_mem
		rows() {
			return this.entries_sorted().map((_, i) => this.Row(String(i)))
		}

		rank(index: string) {
			return `${ Number(index) + 1 }.`
		}

		player_name(index: string) {
			const e = this.entries_sorted()[Number(index)]
			return e?.name || e?.key?.slice(0, 8) || '—'
		}

		player_score(index: string) {
			return String(this.entries_sorted()[Number(index)]?.score ?? 0)
		}

	}

}
