namespace $.$$ {

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
