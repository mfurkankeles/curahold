// The words of the second animated version (concept C, "orbit": four teams circling
// one customer record), in nine languages. Department names, "No promise forgotten",
// "Coming soon" and the sprint name come from concept A's copy and the main site, so
// the two versions never disagree. {n} and {date} are filled by the builder.
import type { SiteLocale } from '../locales';

export interface ConceptCCopy {
  title: string; desc: string;
  /** The headline, in two lines. */
  h1a: string; h1b: string; sub: string;
  /** Under the customer's name in the planet: "health {n}". */
  health: string;
  /** What each team did for the customer: sales, customer success, product, finance. */
  sat: [string, string, string, string];
  /** The caption under the orbit while that team faces the reader. */
  cap: [string, string, string, string];
  lineH: string;
  /** Six stops of one promise: [title, detail]. The task's detail carries {date}. */
  stops: [string, string][];
  /** Words for the moving rows: promise, task, portal, renewal. */
  words: [string, string, string, string];
  endA: string; endB: string;
}

export const C_COPY: Record<SiteLocale, ConceptCCopy> = {
  en: {
    title: 'Curahold: your customer at the centre', desc: 'Four teams work around one customer record: sales, customer success, product and finance.',
    h1a: 'Your customer,', h1b: 'at the centre.', sub: 'Four teams circle one customer record.', health: 'health {n}',
    sat: ['Deal won; onboarding handed to customer success.', 'Health fell to 48. Why: no touch in 38 days.', 'The promise shipped in Sprint 24.', 'Renewal invoice draft ready.'],
    cap: ['Sales won, and the customer came in.', 'Customer success noticed the silence.', 'Product delivered the promise.', 'Finance prepared the renewal.'],
    lineH: 'Six stops of one promise',
    stops: [['Meeting', 'promise made'], ['Task', 'Zeynep, {date}'], ['Sprint 24', 'shipped'], ['Portal', 'Marevo saw it'], ['Renewal', 'won'], ['Health', '48 → 85']],
    words: ['Promise', 'Task', 'Portal', 'Renewal'], endA: 'The customer at the centre.', endB: 'Everyone around them.',
  },
  tr: {
    title: 'Curahold: Müşteriniz merkezde', desc: 'Dört ekip tek müşteri kaydının etrafında çalışır: satış, müşteri başarısı, ürün ve finans.',
    h1a: 'Müşteriniz', h1b: 'merkezde.', sub: 'Dört ekip, tek müşteri kaydının etrafında döner.', health: 'sağlık {n}',
    sat: ['Fırsat kazanıldı, kurulum Müşteri Başarısı’na geçti.', 'Sağlık 48’e düştü. Neden: 38 gündür temas yok.', 'Verilen söz Sprint 24’te teslim edildi.', 'Yenileme faturası taslağı hazır.'],
    cap: ['Satış kazandı, müşteri içeri girdi.', 'Müşteri Başarısı sessizleşmeyi fark etti.', 'Ürün, verilen sözü teslim etti.', 'Finans yenilemeyi hazırladı.'],
    lineH: 'Bir sözün 6 durağı',
    stops: [['Toplantı', 'söz verildi'], ['Görev', 'Zeynep, {date}'], ['Sprint 24', 'teslim edildi'], ['Portal', 'Marevo gördü'], ['Yenileme', 'kazanıldı'], ['Sağlık', '48 → 85']],
    words: ['Söz', 'Görev', 'Portal', 'Yenileme'], endA: 'Merkezde müşteri.', endB: 'Etrafında herkes.',
  },
  ar: {
    title: 'Curahold: عميلك في المركز', desc: 'أربعة فرق تعمل حول سجل عميل واحد: المبيعات ونجاح العملاء والمنتج والمالية.',
    h1a: 'عميلك', h1b: 'في المركز.', sub: 'أربعة فرق تدور حول سجل عميل واحد.', health: 'الصحة {n}',
    sat: ['رُبحت الصفقة، وانتقل الإعداد إلى نجاح العملاء.', 'انخفضت الصحة إلى 48. السبب: لا تواصل منذ 38 يومًا.', 'سُلّم الوعد في سبرنت 24.', 'مسودة فاتورة التجديد جاهزة.'],
    cap: ['ربحت المبيعات، ودخل العميل.', 'لاحظ نجاح العملاء الصمت.', 'سلّم المنتج الوعد.', 'جهّزت المالية التجديد.'],
    lineH: 'ست محطات لوعد واحد',
    stops: [['اجتماع', 'قُطع الوعد'], ['مهمة', 'Zeynep، {date}'], ['سبرنت 24', 'سُلّمت'], ['البوابة', 'رأتها Marevo'], ['التجديد', 'رُبح'], ['الصحة', '48 ← 85']],
    words: ['وعد', 'مهمة', 'بوابة', 'تجديد'], endA: 'العميل في المركز.', endB: 'والجميع من حوله.',
  },
  he: {
    title: 'Curahold: הלקוח שלכם במרכז', desc: 'ארבעה צוותים עובדים סביב רשומת לקוח אחת: מכירות, הצלחת לקוחות, מוצר וכספים.',
    h1a: 'הלקוח שלכם,', h1b: 'במרכז.', sub: 'ארבעה צוותים סובבים רשומת לקוח אחת.', health: 'בריאות {n}',
    sat: ['העסקה נסגרה; ההטמעה עברה להצלחת לקוחות.', 'הבריאות ירדה ל־48. למה: אין מגע כבר 38 ימים.', 'ההבטחה סופקה בספרינט 24.', 'טיוטת חשבונית החידוש מוכנה.'],
    cap: ['המכירות סגרו, והלקוח נכנס.', 'הצלחת לקוחות הבחינה בשקט.', 'המוצר קיים את ההבטחה.', 'הכספים הכינו את החידוש.'],
    lineH: 'שש תחנות של הבטחה אחת',
    stops: [['פגישה', 'ניתנה הבטחה'], ['משימה', 'Zeynep, {date}'], ['ספרינט 24', 'סופק'], ['פורטל', 'Marevo ראתה'], ['חידוש', 'נסגר בהצלחה'], ['בריאות', '48 ← 85']],
    words: ['הבטחה', 'משימה', 'פורטל', 'חידוש'], endA: 'הלקוח במרכז.', endB: 'וכולם סביבו.',
  },
  fa: {
    title: 'Curahold: مشتری شما در مرکز', desc: 'چهار تیم دور یک پروندهٔ مشتری کار می‌کنند: فروش، موفقیت مشتری، محصول و مالی.',
    h1a: 'مشتری شما', h1b: 'در مرکز.', sub: 'چهار تیم دور یک پروندهٔ مشتری می‌چرخند.', health: 'سلامت {n}',
    sat: ['معامله برنده شد و راه‌اندازی به موفقیت مشتری رسید.', 'سلامت به ۴۸ رسید. چرا: ۳۸ روز بدون تماس.', 'قول در اسپرینت ۲۴ تحویل شد.', 'پیش‌نویس صورت‌حساب تمدید آماده است.'],
    cap: ['فروش برنده شد و مشتری وارد شد.', 'موفقیت مشتری سکوت را دید.', 'محصول قول را تحویل داد.', 'مالی تمدید را آماده کرد.'],
    lineH: 'شش ایستگاه یک قول',
    stops: [['جلسه', 'قول داده شد'], ['وظیفه', 'Zeynep، {date}'], ['اسپرینت ۲۴', 'تحویل شد'], ['پورتال', 'Marevo دید'], ['تمدید', 'برنده شد'], ['سلامت', '۴۸ ← ۸۵']],
    words: ['قول', 'وظیفه', 'پورتال', 'تمدید'], endA: 'مشتری در مرکز.', endB: 'همه دور او.',
  },
  'zh-Hans': {
    title: 'Curahold：客户就在中心', desc: '四个团队围绕同一份客户记录工作：销售、客户成功、产品和财务。',
    h1a: '你的客户，', h1b: '就在中心。', sub: '四个团队围绕同一份客户记录运转。', health: '健康 {n}',
    sat: ['商机赢单，交付已转给客户成功。', '健康分降到 48。原因：38 天没有联系。', '承诺在迭代 24 中交付。', '续约发票草稿已就绪。'],
    cap: ['销售赢单，客户进来了。', '客户成功注意到了沉默。', '产品兑现了承诺。', '财务准备好了续约。'],
    lineH: '一个承诺的六站',
    stops: [['会议', '做出承诺'], ['任务', 'Zeynep，{date}'], ['迭代 24', '已交付'], ['门户', 'Marevo 看到了'], ['续约', '赢单'], ['健康', '48 → 85']],
    words: ['承诺', '任务', '门户', '续约'], endA: '客户在中心。', endB: '所有人围绕着它。',
  },
  'zh-Hant': {
    title: 'Curahold：客戶就在中心', desc: '四個團隊圍繞同一份客戶紀錄工作：銷售、客戶成功、產品和財務。',
    h1a: '你的客戶，', h1b: '就在中心。', sub: '四個團隊圍繞同一份客戶紀錄運轉。', health: '健康 {n}',
    sat: ['交易贏得，導入已交給客戶成功。', '健康分數降到 48。原因：38 天沒有接觸。', '承諾在衝刺 24 中交付。', '續約發票草稿已備妥。'],
    cap: ['銷售贏得交易，客戶進來了。', '客戶成功注意到了沉默。', '產品兌現了承諾。', '財務備妥了續約。'],
    lineH: '一個承諾的六站',
    stops: [['會議', '做出承諾'], ['任務', 'Zeynep，{date}'], ['衝刺 24', '已交付'], ['入口網站', 'Marevo 看到了'], ['續約', '贏得'], ['健康', '48 → 85']],
    words: ['承諾', '任務', '入口網站', '續約'], endA: '客戶在中心。', endB: '所有人圍繞著它。',
  },
  ja: {
    title: 'Curahold：顧客を中心に', desc: '4つのチームがひとつの顧客レコードを囲んで働きます。セールス、カスタマーサクセス、プロダクト、経理。',
    h1a: '顧客を、', h1b: '中心に。', sub: '4つのチームが、ひとつの顧客レコードのまわりを回ります。', health: 'ヘルス {n}',
    sat: ['商談を受注し、導入をカスタマーサクセスへ引き継ぎ。', 'ヘルスが 48 に低下。理由：38日間接触なし。', '約束をスプリント 24 で届けました。', '更新の請求書の下書きを用意。'],
    cap: ['セールスが受注し、顧客が加わりました。', 'カスタマーサクセスが沈黙に気づきました。', 'プロダクトが約束を届けました。', '経理が更新を準備しました。'],
    lineH: 'ひとつの約束の6つの停留所',
    stops: [['ミーティング', '約束が生まれる'], ['タスク', 'Zeynep、{date}'], ['スプリント 24', '完了'], ['ポータル', 'Marevo が確認'], ['更新', '受注'], ['ヘルス', '48 → 85']],
    words: ['約束', 'タスク', 'ポータル', '更新'], endA: '中心に顧客。', endB: 'そのまわりに全員。',
  },
  ko: {
    title: 'Curahold: 고객이 중심에', desc: '네 팀이 하나의 고객 기록을 중심으로 일합니다. 영업, 고객 성공, 제품, 재무.',
    h1a: '고객이', h1b: '중심에.', sub: '네 팀이 하나의 고객 기록을 중심으로 돕니다.', health: '건강도 {n}',
    sat: ['거래가 성사되고, 온보딩이 고객 성공 팀으로 넘어갔습니다.', '건강도가 48로 하락. 이유: 38일째 접점 없음.', '약속이 스프린트 24에서 전달되었습니다.', '갱신 청구서 초안이 준비되었습니다.'],
    cap: ['영업이 성사시키고, 고객이 들어왔습니다.', '고객 성공 팀이 침묵을 알아챘습니다.', '제품 팀이 약속을 전달했습니다.', '재무 팀이 갱신을 준비했습니다.'],
    lineH: '한 약속의 여섯 정거장',
    stops: [['미팅', '약속이 생김'], ['작업', 'Zeynep, {date}'], ['스프린트 24', '전달됨'], ['포털', 'Marevo가 확인'], ['갱신', '성사'], ['건강도', '48 → 85']],
    words: ['약속', '작업', '포털', '갱신'], endA: '중심에는 고객.', endB: '그 주위에 모두.',
  },
  hi: {
    title: "Curahold: आपका ग्राहक केंद्र में",
    desc: "चार टीमें एक ग्राहक रिकॉर्ड के आसपास काम करती हैं: सेल्स, कस्टमर सक्सेस, प्रोडक्ट और फ़ाइनेंस।",
    h1a: "आपका ग्राहक,",
    h1b: "केंद्र में।",
    sub: "चार टीमें एक ग्राहक रिकॉर्ड के चारों ओर।",
    health: "हेल्थ {n}",
    sat: ["डील जीती; ऑनबोर्डिंग कस्टमर सक्सेस को सौंपी गई।", "हेल्थ गिरकर 48 हुई। वजह: 38 दिनों से कोई संपर्क नहीं।", "वादा स्प्रिंट 24 में शिप हुआ।", "रिन्यूअल इनवॉइस ड्राफ़्ट तैयार।"],
    cap: ["सेल्स ने जीता, और ग्राहक आ गया।", "कस्टमर सक्सेस ने चुप्पी पर ध्यान दिया।", "प्रोडक्ट ने वादा पूरा किया।", "फ़ाइनेंस ने रिन्यूअल तैयार किया।"],
    lineH: "एक वादे के छह पड़ाव",
    stops: [["मीटिंग", "वादा किया"], ["टास्क", "Zeynep, {date}"], ["स्प्रिंट 24", "शिप हुआ"], ["पोर्टल", "Marevo ने देखा"], ["रिन्यूअल", "जीता"], ["हेल्थ", "48 → 85"]],
    words: ["वादा", "टास्क", "पोर्टल", "रिन्यूअल"],
    endA: "ग्राहक केंद्र में।",
    endB: "बाकी सब उसके आसपास।",
  },
  ms: {
    title: "Curahold: pelanggan anda di tengah-tengah",
    desc: "Empat pasukan bekerja di sekeliling satu rekod pelanggan: jualan, kejayaan pelanggan, produk dan kewangan.",
    h1a: "Pelanggan anda,",
    h1b: "di tengah-tengah.",
    sub: "Empat pasukan mengelilingi satu rekod pelanggan.",
    health: "kesihatan {n}",
    sat: ["Urus niaga dimenangi; onboarding diserahkan kepada kejayaan pelanggan.", "Kesihatan jatuh ke 48. Sebabnya: tiada hubungan selama 38 hari.", "Janji dikeluarkan dalam Sprint 24.", "Draf invois pembaharuan sedia."],
    cap: ["Jualan menang, dan pelanggan masuk.", "Kejayaan pelanggan perasan kesenyapan itu.", "Produk menunaikan janji.", "Kewangan menyediakan pembaharuan."],
    lineH: "Enam perhentian satu janji",
    stops: [["Mesyuarat", "janji dibuat"], ["Tugasan", "Zeynep, {date}"], ["Sprint 24", "dikeluarkan"], ["Portal", "Marevo melihatnya"], ["Pembaharuan", "dimenangi"], ["Kesihatan", "48 → 85"]],
    words: ["Janji", "Tugasan", "Portal", "Pembaharuan"],
    endA: "Pelanggan di tengah-tengah.",
    endB: "Semua orang di sekelilingnya.",
  },
};
