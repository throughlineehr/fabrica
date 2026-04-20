export default {
  app: { name: 'ファブリカ' },
  nav: { detail: '詳細', esc: 'esc', unit: 'ユニット', operation: 'オペレーション', op: 'Op' },
  hud: {
    metaUnit: 'メタユニット', operationLabel: 'オペレーション',
    position: '位置', structure: '構造', systems: 'システム', status: '状態',
    layer: 'レイヤー', x: 'x', depth: '深度', children: '子要素', subtree: 'サブツリー',
    state: '状態', nominal: '正常', lastModified: '最終更新', active: 'アクティブ',
  },
  instructions: {
    hoverToInspect: 'ホバーで検査', scrollToZoom: 'スクロールでズーム',
    dragToOrbit: 'ドラッグで回転', doubleClickFocus: 'ダブルクリックでフォーカス',
    rightClickActions: '右クリックでアクション', doubleClickDetail: 'ダブルクリックで詳細表示',
    doubleClickEmpty: '空白をダブルクリックで戻る', doubleClickSystem: 'システムをダブルクリックで開く',
  },
  menu: { actions: 'アクション', addManagement: '管理を追加', addOperation: 'オペレーションを追加' },
  tabs: { filter: 'フィルター', explorer: 'エクスプローラー', tools: 'ツール', settings: '設定', hide: '非表示', show: '表示' },
  settings: {
    accessibility: 'アクセシビリティ', display: '表示', account: 'アカウント', language: '言語',
    epilepsyMode: 'てんかんモード', fontVisibility: 'フォント視認性',
    dyslexiaFont: 'ディスレクシアフォント', screenReader: 'スクリーンリーダー', notImplemented: '未実装',
    colorBlindMode: 'Color-blind patterns',  },
  tools: { node: 'ノード', listen: 'リスン', users: 'ユーザー', tree: 'ツリー' },
  systems: { s5: 'システム5', s4: 'システム4', s3: 'システム3', s2: 'システム2', s1: 'システム1' },
  systemPage: {
    parameters: 'パラメータ', configuration: '設定', connections: '接続',
    constraints: '制約', history: '履歴', diagnostics: '診断',
    statePage: '状態', logs: 'ログ', metrics: 'メトリクス',
  },
}
