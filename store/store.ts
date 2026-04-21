namespace $ {

	/** Запись одного игрока — счётчик + имя */
	export class $bog_klik_player extends $giper_baza_dict.with({
		Score: $giper_baza_atom_real,
		Name: $giper_baza_atom_text,
	}) {}

	let _players_dict_class: ReturnType<typeof $giper_baza_dict_to<typeof $bog_klik_player>> | null = null
	export function $bog_klik_players_dict_class(): ReturnType<typeof $giper_baza_dict_to<typeof $bog_klik_player>> {
		if (!_players_dict_class) _players_dict_class = $giper_baza_dict_to($bog_klik_player)
		return _players_dict_class
	}

	/** Тонкий враппер над глобом + url-arg. Методы возвращающие ленды/pawn — БЕЗ $mol_mem. */
	export class $bog_klik_store extends $mol_object {

		glob() {
			return this.$.$giper_baza_glob
		}

		/** Ссылка на ленд сессии хранится в URL как ?land=... */
		session_link(next?: string | null) {
			return this.$.$mol_state_arg.value('land', next) ?? ''
		}

		/** Текущий ленд сессии, или null если ссылка пуста */
		session_land() {
			const link = this.session_link()
			if (!link) return null
			return this.glob().Land(new $giper_baza_link(link))
		}

		/** Словарь игроков — ключи это lord_str или bot-id */
		players_dict() {
			const land = this.session_land()
			if (!land) return null
			return land.Data($bog_klik_players_dict_class())
		}

		/** Создаёт новый ленд с правами `post` для всех и записывает ссылку в URL */
		create_session() {
			const land = this.glob().land_grab([
				[null, $giper_baza_rank_post('just')],
			])
			this.session_link(land.link().str)
			return land
		}

		/** Id текущего пользователя */
		my_lord_str() {
			return this.$.$giper_baza_auth.current().pass().lord().str
		}

	}

}
