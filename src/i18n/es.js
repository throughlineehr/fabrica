export default {
  app: { name: 'Fabrica' },
  nav: { detail: 'Detalle', esc: 'esc', unit: 'Unidad', operation: 'Operación', op: 'Op' },
  hud: {
    metaUnit: 'UNIDAD META', operationLabel: 'OPERACIÓN',
    position: 'Posición', structure: 'Estructura', systems: 'Sistemas', status: 'Estado',
    layer: 'capa', x: 'x', depth: 'profundidad', children: 'hijos', subtree: 'subárbol',
    state: 'estado', nominal: 'nominal', lastModified: 'última modificación', active: 'activo',
  },
  instructions: {
    hoverToInspect: 'Pasar para inspeccionar', scrollToZoom: 'Desplazar para zoom',
    dragToOrbit: 'Arrastrar para orbitar', doubleClickFocus: 'Doble clic para enfocar',
    rightClickActions: 'Clic derecho para acciones', doubleClickDetail: 'Doble clic para vista detallada',
    doubleClickEmpty: 'Doble clic en vacío para volver', doubleClickSystem: 'Doble clic en sistema para abrir',
  },
  menu: { actions: 'Acciones', addManagement: 'Agregar gestión', addOperation: 'Agregar operación' },
  tabs: { filter: 'Filtro', explorer: 'Explorador', tools: 'Herramientas', settings: 'Ajustes', hide: 'ocultar', show: 'mostrar' },
  settings: {
    accessibility: 'ACCESIBILIDAD', display: 'PANTALLA', account: 'CUENTA', language: 'IDIOMA',
    epilepsyMode: 'Modo epilepsia', fontVisibility: 'Visibilidad de fuente',
    dyslexiaFont: 'Fuente dislexia', screenReader: 'Modo lector de pantalla', notImplemented: 'Aún no implementado',
    colorBlindMode: 'Color-blind patterns',  },
  tools: { node: 'Nodo', listen: 'Escuchar', users: 'Usuarios', tree: 'Árbol' },
  systems: { s5: 'Sistema 5', s4: 'Sistema 4', s3: 'Sistema 3', s2: 'Sistema 2', s1: 'Sistema 1' },
  systemPage: {
    parameters: 'PARÁMETROS', configuration: 'CONFIGURACIÓN', connections: 'Conexiones',
    constraints: 'Restricciones', history: 'Historial', diagnostics: 'DIAGNÓSTICOS',
    statePage: 'Estado', logs: 'Registros', metrics: 'Métricas',
  },
}
