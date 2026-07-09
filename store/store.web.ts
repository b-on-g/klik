namespace $ {

	if ($mol_dom.document) {
		const origin = $mol_dom.document.location.origin
		if (origin.startsWith('http://localhost:9080')) {
			// dev: mam dev server is on 9080, real baza master is on 9090
			$giper_baza_yard.masters_default.length = 0
			$giper_baza_yard.masters_default.push('http://localhost:9090/')
		}
	}

}
