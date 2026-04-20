export default {
  app: { name: 'Fabrica' },
  nav: { detail: 'Detail', esc: 'esc', unit: 'Unit', operation: 'Operasi', op: 'Op' },
  hud: {
    metaUnit: 'UNIT META', operationLabel: 'OPERASI',
    position: 'Posisi', structure: 'Struktur', systems: 'Sistem', status: 'Status',
    layer: 'lapisan', x: 'x', depth: 'kedalaman', children: 'anak', subtree: 'subpohon',
    state: 'keadaan', nominal: 'nominal', lastModified: 'terakhir diubah', active: 'aktif',
  },
  instructions: {
    hoverToInspect: 'Arahkan untuk memeriksa', scrollToZoom: 'Gulir untuk zoom',
    dragToOrbit: 'Seret untuk mengorbit', doubleClickFocus: 'Klik dua kali untuk fokus',
    rightClickActions: 'Klik kanan untuk tindakan', doubleClickDetail: 'Klik dua kali untuk tampilan detail',
    doubleClickEmpty: 'Klik dua kali area kosong untuk kembali', doubleClickSystem: 'Klik dua kali sistem untuk membuka',
  },
  menu: { actions: 'Tindakan', addManagement: 'Tambah manajemen', addOperation: 'Tambah operasi' },
  tabs: { filter: 'Filter', explorer: 'Penjelajah', tools: 'Alat', settings: 'Pengaturan', hide: 'sembunyikan', show: 'tampilkan' },
  settings: {
    accessibility: 'AKSESIBILITAS', display: 'TAMPILAN', account: 'AKUN', language: 'BAHASA',
    epilepsyMode: 'Mode epilepsi', fontVisibility: 'Visibilitas font',
    dyslexiaFont: 'Font disleksia', screenReader: 'Mode pembaca layar', notImplemented: 'Belum diimplementasikan',
    colorBlindMode: 'Color-blind patterns',  },
  tools: { node: 'Node', listen: 'Dengarkan', users: 'Pengguna', tree: 'Pohon' },
  systems: { s5: 'Sistem 5', s4: 'Sistem 4', s3: 'Sistem 3', s2: 'Sistem 2', s1: 'Sistem 1' },
  systemPage: {
    parameters: 'PARAMETER', configuration: 'KONFIGURASI', connections: 'Koneksi',
    constraints: 'Batasan', history: 'Riwayat', diagnostics: 'DIAGNOSTIK',
    statePage: 'Keadaan', logs: 'Log', metrics: 'Metrik',
  },
}
