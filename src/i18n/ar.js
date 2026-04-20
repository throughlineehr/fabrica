export default {
  _meta: { dir: 'rtl' },
  app: { name: 'فابريكا' },
  nav: { detail: 'تفصيل', esc: 'خروج', unit: 'وحدة', operation: 'عملية', op: 'عمل' },
  hud: {
    metaUnit: 'وحدة ميتا', operationLabel: 'عملية',
    position: 'الموقع', structure: 'الهيكل', systems: 'الأنظمة', status: 'الحالة',
    layer: 'طبقة', x: 'س', depth: 'عمق', children: 'فروع', subtree: 'شجرة فرعية',
    state: 'الحالة', nominal: 'اسمي', lastModified: 'آخر تعديل', active: 'نشط',
  },
  instructions: {
    hoverToInspect: 'مرر للفحص', scrollToZoom: 'مرر للتكبير',
    dragToOrbit: 'اسحب للدوران', doubleClickFocus: 'انقر مرتين للتركيز',
    rightClickActions: 'انقر يمين للإجراءات', doubleClickDetail: 'انقر مرتين للعرض التفصيلي',
    doubleClickEmpty: 'انقر مرتين على الفراغ للعودة', doubleClickSystem: 'انقر مرتين على النظام للفتح',
  },
  menu: { actions: 'إجراءات', addManagement: 'إضافة إدارة', addOperation: 'إضافة عملية' },
  tabs: { filter: 'تصفية', explorer: 'مستكشف', tools: 'أدوات', settings: 'إعدادات', hide: 'إخفاء', show: 'إظهار' },
  settings: {
    accessibility: 'إمكانية الوصول', display: 'العرض', account: 'الحساب', language: 'اللغة',
    epilepsyMode: 'وضع الصرع', fontVisibility: 'وضوح الخط',
    dyslexiaFont: 'خط عسر القراءة', screenReader: 'وضع قارئ الشاشة', notImplemented: 'لم يتم التنفيذ بعد',
    colorBlindMode: 'Color-blind patterns',  },
  tools: { node: 'عقدة', listen: 'استماع', users: 'مستخدمون', tree: 'شجرة' },
  systems: { s5: 'نظام ٥', s4: 'نظام ٤', s3: 'نظام ٣', s2: 'نظام ٢', s1: 'نظام ١' },
  systemPage: {
    parameters: 'المعاملات', configuration: 'التكوين', connections: 'الاتصالات',
    constraints: 'القيود', history: 'السجل', diagnostics: 'التشخيص',
    statePage: 'الحالة', logs: 'السجلات', metrics: 'المقاييس',
  },
}
