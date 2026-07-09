namespace $ {

	/**
	 * Klik bot — single-client writer process.
	 *
	 * Each invocation is ONE independent participant: its own auth identity,
	 * its own WebSocket to the master, its own entry in the session's dict.
	 *
	 * Args (via env vars):
	 *   KLIK_MASTER       — master base URL (default http://localhost:9090/)
	 *   KLIK_SESSION      — session land link (required)
	 *   KLIK_BOT_ID       — optional label for the dict key/name; defaults to own lord_str
	 *   KLIK_TICK_MS      — ms between increments (default 1000)
	 *   KLIK_PER_TICK     — Score increments per tick (default 1)
	 *   KLIK_DURATION_MS  — total run time before exit (default 60000)
	 *   KLIK_REPORT_MS    — how often to print a one-line progress to stdout (default 5000)
	 */
	// Force dep discovery for store module (defines $bog_klik_players_dict_class).
	void $bog_klik_store

	async function $bog_klik_bot_main() {

		const master = process.env.KLIK_MASTER || 'http://localhost:9090/'
		const session = process.env.KLIK_SESSION
		if( !session ) {
			process.stderr.write( 'KLIK_SESSION is required\n' )
			process.exit( 2 )
		}
		const tick_ms = Number( process.env.KLIK_TICK_MS ?? 1000 )
		const per_tick = Number( process.env.KLIK_PER_TICK ?? 1 )
		const duration_ms = Number( process.env.KLIK_DURATION_MS ?? 60000 )
		const report_ms = Number( process.env.KLIK_REPORT_MS ?? 5000 )

		$giper_baza_yard.masters_default.length = 0
		$giper_baza_yard.masters_default.push( master )

		const lord = $giper_baza_auth.current().pass().lord().str
		const bot_id = process.env.KLIK_BOT_ID || lord

		const land = $giper_baza_glob.Land( new $giper_baza_link( session ) )
		const dict = land.Data( $bog_klik_players_dict_class() )

		const own_lord = $giper_baza_auth.current().pass().lord()
		const post_tier = $giper_baza_rank_tier_of( $giper_baza_rank_post( 'just' ) )

		// Кик синхронизации и ожидание, пока мастер пришлёт rank-юнит с null-gift
		// (без него lord_tier = read (16), и мастер отклонит все записи как «Too low Tier»).
		$mol_wire_async( land ).sync_yard()
		const sync_deadline = Date.now() + 15000
		while( Date.now() < sync_deadline ) {
			if( land.lord_tier( own_lord ) >= post_tier ) break
			await new Promise( r => setTimeout( r, 100 ) )
		}
		const got_tier = land.lord_tier( own_lord )
		if( got_tier < post_tier ) {
			process.stderr.write( 'sync timeout: tier=' + got_tier.toString(2) + ' want>=' + post_tier.toString(2) + '\n' )
			process.exit( 3 )
		}

		let writes = 0
		let errors = 0
		const start = Date.now()
		let last_report = start

		process.stdout.write( JSON.stringify({ event: 'start', bot_id, lord, master, session, tier: got_tier }) + '\n' )

		while( Date.now() - start < duration_ms ) {
			try {
				const player = dict.key( bot_id, 'auto' )
				if( player ) {
					const cur = player.Score()?.val() ?? 0
					player.Score( 'auto' )?.val( cur + per_tick )
					const name = player.Name()?.val() ?? ''
					if( !name ) player.Name( 'auto' )?.val( bot_id )
					writes++
				}
			} catch( e ) {
				errors++
			}

			const now = Date.now()
			if( now - last_report >= report_ms ) {
				last_report = now
				process.stdout.write( JSON.stringify({
					event: 'tick', bot_id, writes, errors, elapsed: now - start,
				}) + '\n' )
			}

			await new Promise( r => setTimeout( r, tick_ms ) )
		}

		process.stdout.write( JSON.stringify({
			event: 'done', bot_id, writes, errors, elapsed: Date.now() - start,
		}) + '\n' )
		process.exit( 0 )
	}

	$bog_klik_bot_main().catch( (e: any) => {
		process.stderr.write( 'bot fatal: ' + ( e?.stack || String(e) ) + '\n' )
		process.exit( 1 )
	})

}
