export default {
  app: { name: 'Fabrica' },
  nav: { detail: 'Dettaglio', esc: 'esc', unit: 'Unità', operation: 'Operazione', op: 'Op' },
  hud: {
    metaUnit: 'UNITÀ META', operationLabel: 'OPERAZIONE',
    position: 'Posizione', structure: 'Struttura', systems: 'Sistemi', status: 'Stato',
    layer: 'livello', x: 'x', depth: 'profondità', children: 'figli', subtree: 'sottoalbero',
    state: 'stato', nominal: 'nominale', lastModified: 'ultima modifica', active: 'attivo',
  },
  instructions: {
    hoverToInspect: 'Passare per ispezionare', scrollToZoom: 'Scorrere per zoom',
    dragToOrbit: 'Trascinare per orbitare', doubleClickFocus: 'Doppio clic per focalizzare',
    rightClickActions: 'Clic destro per azioni', doubleClickDetail: 'Doppio clic per vista dettagliata',
    doubleClickEmpty: 'Doppio clic su vuoto per tornare', doubleClickSystem: 'Doppio clic su sistema per aprire',
  },
  menu: { actions: 'Azioni', addManagement: 'Aggiungi gestione', addOperation: 'Aggiungi operazione' },
  tabs: { filter: 'Filtro', explorer: 'Esplora', tools: 'Strumenti', settings: 'Impostazioni', hide: 'nascondi', show: 'mostra' },
  settings: {
    accessibility: 'ACCESSIBILITÀ', display: 'SCHERMO', account: 'ACCOUNT', language: 'LINGUA',
    epilepsyMode: 'Modalità epilessia', fontVisibility: 'Visibilità carattere',
    dyslexiaFont: 'Carattere dislessia', screenReader: 'Modalità lettore schermo', notImplemented: 'Non ancora implementato',
    colorBlindMode: 'Color-blind patterns',  },
  tools: { node: 'Nodo', listen: 'Ascolta', users: 'Utenti', tree: 'Albero' },
  systems: { s5: 'Sistema 5', s4: 'Sistema 4', s3: 'Sistema 3', s2: 'Sistema 2', s1: 'Sistema 1' },
  systemPage: {
    parameters: 'PARAMETRI', configuration: 'CONFIGURAZIONE', connections: 'Connessioni',
    constraints: 'Vincoli', history: 'Cronologia', diagnostics: 'DIAGNOSTICA',
    statePage: 'Stato', logs: 'Registri', metrics: 'Metriche',
  },
}
