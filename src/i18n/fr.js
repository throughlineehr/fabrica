export default {
  app: { name: 'Fabrica' },
  nav: { detail: 'Détail', esc: 'éch', unit: 'Unité', operation: 'Opération', op: 'Op' },
  hud: {
    metaUnit: 'UNITÉ META', operationLabel: 'OPÉRATION',
    position: 'Position', structure: 'Structure', systems: 'Systèmes', status: 'Statut',
    layer: 'couche', x: 'x', depth: 'profondeur', children: 'enfants', subtree: 'sous-arbre',
    state: 'état', nominal: 'nominal', lastModified: 'dernière modification', active: 'actif',
  },
  instructions: {
    hoverToInspect: 'Survoler pour inspecter', scrollToZoom: 'Défiler pour zoomer',
    dragToOrbit: 'Glisser pour orbiter', doubleClickFocus: 'Double-clic pour cibler',
    rightClickActions: 'Clic droit pour actions', doubleClickDetail: 'Double-clic pour vue détaillée',
    doubleClickEmpty: 'Double-clic sur vide pour revenir', doubleClickSystem: 'Double-clic sur système pour ouvrir',
  },
  menu: { actions: 'Actions', addManagement: 'Ajouter gestion', addOperation: 'Ajouter opération' },
  tabs: { filter: 'Filtre', explorer: 'Explorateur', tools: 'Outils', settings: 'Paramètres', hide: 'masquer', show: 'afficher' },
  settings: {
    accessibility: 'ACCESSIBILITÉ', display: 'AFFICHAGE', account: 'COMPTE', language: 'LANGUE',
    epilepsyMode: 'Mode épilepsie', fontVisibility: 'Visibilité police',
    dyslexiaFont: 'Police dyslexie', screenReader: 'Mode lecteur d\'écran', notImplemented: 'Pas encore implémenté',
    colorBlindMode: 'Color-blind patterns',  },
  tools: { node: 'Nœud', listen: 'Écouter', users: 'Utilisateurs', tree: 'Arbre' },
  systems: { s5: 'Système 5', s4: 'Système 4', s3: 'Système 3', s2: 'Système 2', s1: 'Système 1' },
  systemPage: {
    parameters: 'PARAMÈTRES', configuration: 'CONFIGURATION', connections: 'Connexions',
    constraints: 'Contraintes', history: 'Historique', diagnostics: 'DIAGNOSTICS',
    statePage: 'État', logs: 'Journaux', metrics: 'Métriques',
  },
}
