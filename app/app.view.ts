namespace $.$$ {
	// Синхронизация через Гипер Базу отключена: список мастеров пустой.
	// Чистки одного masters_default мало — masters() склеивает его с пирами
	// из бандленного сида, где зашит публичный мастер. Глушим сам masters().
	$giper_baza_yard.masters_default.length = 0
	$giper_baza_yard.masters = (): string[] => []


	export class $bog_klik_app extends $.$bog_klik_app {

		@ $mol_mem
		screen( next?: string ) {
			return $mol_state_arg.value( 'screen', next ) ?? 'play'
		}

		@ $mol_mem
		screen_body() {
			const pages = this.pages()
			const screen = this.screen()
			const page = ( pages as any )[ screen ]
			return page ? [ page ] : []
		}

	}

}
