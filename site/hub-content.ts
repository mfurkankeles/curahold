// The content hub's words (/resources/, /templates/<slug>/, /glossary/<slug>/), in every site
// language: two templates a customer team can copy and four plain definitions, each with one
// line on what Curahold does about it. Written per language, not translated word for word;
// every "In Curahold" line names only what the product does today (checked against the app:
// renewal playbooks 90 days ahead, meetings whose next steps become tasks, the explainable
// health score, the portal). Pages: scripts/site-hub.ts. Lengths: tests/site-seo.test.ts.
import type { SiteLocale } from './locales';

/** A block of an item's body: a heading, a paragraph, or a list (ordered for steps). */
export type HubBlock = { h: string } | { p: string } | { ol: string[] } | { ul: string[] };

/** One template or glossary term. `slug` is the same in every language. */
export interface HubItem {
  slug: string;
  kind: 'template' | 'term';
  name: string;
  /** Search title and description (lengths as every page's, tests/site-seo.test.ts). */
  seo: [title: string, description: string];
  lead: string;
  body: HubBlock[];
  /** What Curahold does about it, shown under the "In Curahold" heading. Shipped features only. */
  curahold: string;
}

/** The hub in one language: its index page's words, the two group names and the items. */
export interface HubCopy {
  title: string;
  lead: string;
  seo: [title: string, description: string];
  templates: string;
  glossary: string;
  inCurahold: string;
  /** The hub's name and one line about it, for the Resources menu. */
  nav: [name: string, line: string];
  items: HubItem[];
}

const HUB: Record<SiteLocale, HubCopy> = {
  en: {
    "title": "Templates and glossary for customer teams",
    "lead": "Templates you can copy and plain definitions for the work of keeping customers: renewals, business reviews, health and churn.",
    "seo": [
      "Customer success templates and glossary | Curahold",
      "Free templates for renewal playbooks and business reviews, and plain definitions of health score, churn, renewals and customer portals for customer teams."
    ],
    "templates": "Templates",
    "glossary": "Glossary",
    "inCurahold": "In Curahold",
    "nav": [
      "Templates and glossary",
      "Renewal steps, a review agenda and plain definitions."
    ],
    "items": [
      {
        "slug": "renewal-playbook",
        "kind": "template",
        "name": "Renewal playbook template",
        "seo": [
          "Renewal playbook template: steps from 90 days out | Curahold",
          "A renewal playbook you can copy: what to do 90, 75, 60 and 30 days before a contract renews, who owns each step, and what to check before the call."
        ],
        "lead": "A renewal is won in the three months before the date, not on it. Copy these steps, give each an owner, and count them back from the renewal date.",
        "body": [
          {
            "h": "The steps"
          },
          {
            "ol": [
              "90 days before: review usage, open requests and the health score; write down anything that worries you.",
              "75 days before: book the renewal call with the decision maker and the day-to-day contact.",
              "60 days before: send the renewal quote, with any change in seats or plan.",
              "30 days before: follow up on the quote and settle open questions in writing.",
              "On the renewal date: confirm the signed renewal and log what was agreed."
            ]
          },
          {
            "h": "Before the renewal call"
          },
          {
            "ul": [
              "What did the customer set out to achieve this year, and did they?",
              "Which promises from earlier meetings are still open?",
              "Who decides, and have they been in a meeting with you recently?"
            ]
          }
        ],
        "curahold": "Turn renewals on and a renewal playbook opens its steps as tasks ninety days before each renewal date, each with an owner and a due date counted back from the renewal."
      },
      {
        "slug": "business-review-agenda",
        "kind": "template",
        "name": "Business review (QBR) agenda template",
        "seo": [
          "Business review (QBR) agenda template | Curahold",
          "A one-hour business review agenda for customer teams: results against goals, what changed, open promises, next quarter’s plan and clear next steps."
        ],
        "lead": "A quarterly business review should leave the customer with proof of value and both sides with the same next steps. This agenda fits in an hour.",
        "body": [
          {
            "h": "Agenda (60 minutes)"
          },
          {
            "ol": [
              "5 minutes: the goals of the meeting and who is in the room.",
              "15 minutes: results against the goals set last quarter.",
              "10 minutes: what changed on their side: people, priorities, budget.",
              "10 minutes: open requests and promises, and where each one stands.",
              "15 minutes: the plan for next quarter.",
              "5 minutes: next steps, each with an owner and a date."
            ]
          },
          {
            "h": "After the meeting"
          },
          {
            "p": "Send a short summary the same day: what was agreed, the next steps with owners and dates, and the date of the next review."
          }
        ],
        "curahold": "Log the review as a meeting on the customer and write its next steps; when you save, each one becomes a task with an owner and a date, which you can share in the customer’s portal."
      },
      {
        "slug": "customer-health-score",
        "kind": "term",
        "name": "Customer health score",
        "seo": [
          "What is a customer health score? Definition | Curahold",
          "A customer health score sums up how a customer relationship is going in one number, built from signals such as last contact, overdue work and open issues."
        ],
        "lead": "A customer health score is a single number, often from 0 to 100, that sums up how well a customer relationship is going.",
        "body": [
          {
            "p": "It is built from signals the team can observe: how recently someone spoke with the customer, whether promised work is overdue, whether there is a champion on their side, open blockers and support requests. Each signal adds or takes away points."
          },
          {
            "h": "Why it matters"
          },
          {
            "p": "A portfolio of dozens of customers hides the one going quiet. A score sorts them, so attention goes first where a renewal is at risk."
          },
          {
            "h": "What makes a good score"
          },
          {
            "ul": [
              "It explains itself: anyone can see which signals moved it.",
              "It uses signals the team trusts and can act on.",
              "It is followed over time, not read once."
            ]
          }
        ],
        "curahold": "Each customer gets a score from 0 to 100 built from rules you set, with its reasons listed and its trend over the last thirty days."
      },
      {
        "slug": "churn",
        "kind": "term",
        "name": "Churn",
        "seo": [
          "What is customer churn? Definition and signals | Curahold",
          "Churn is the share of customers or revenue lost in a period. What counts as churn, how it is measured, and the early signals that come before it."
        ],
        "lead": "Churn is when a customer stops buying: they cancel, or they do not renew. The churn rate is the share of customers, or of revenue, lost in a period.",
        "body": [
          {
            "h": "How it is measured"
          },
          {
            "ul": [
              "Customer churn: customers lost in the period, divided by customers at its start.",
              "Revenue churn: recurring revenue lost to cancellations and downgrades, divided by recurring revenue at the start."
            ]
          },
          {
            "h": "The signals that come first"
          },
          {
            "p": "Churn rarely arrives without warning. Contact goes quiet, promised work slips, the champion leaves, support requests pile up. Watching those signals is how a team acts before the renewal date."
          }
        ],
        "curahold": "Signals like these feed each customer’s health score, so the customers going quiet come forward well before their renewal."
      },
      {
        "slug": "contract-renewal",
        "kind": "term",
        "name": "Contract renewal",
        "seo": [
          "What is a contract renewal? Process and timeline | Curahold",
          "A contract renewal extends a customer agreement for a new term. When to start, what a renewal process looks like, and why it begins months before the date."
        ],
        "lead": "A contract renewal extends a customer’s agreement for another term, often with changes: more seats, a different plan or a new price.",
        "body": [
          {
            "h": "When it starts"
          },
          {
            "p": "For a yearly contract, the work usually starts about ninety days ahead. That leaves time to review the value delivered, meet the decision maker, send a quote and settle questions without a rush."
          },
          {
            "h": "What usually goes wrong"
          },
          {
            "ul": [
              "The date is noticed too late.",
              "The person who signed has left.",
              "Promises made during the year are still open."
            ]
          }
        ],
        "curahold": "A renewal can open its own playbook ninety days ahead, as tasks with owners and dates, together with a renewal opportunity in the pipeline."
      },
      {
        "slug": "customer-portal",
        "kind": "term",
        "name": "Customer portal",
        "seo": [
          "What is a customer portal? Definition and uses | Curahold",
          "A customer portal is a private place where a customer sees the work shared with them, raises requests and reads replies, instead of chasing email threads."
        ],
        "lead": "A customer portal is a private web page where a customer sees the work shared with them, raises requests and reads the team’s replies.",
        "body": [
          {
            "h": "Why teams use one"
          },
          {
            "p": "It replaces status emails. The customer sees progress whenever they want, and their requests arrive in one place instead of scattered threads."
          },
          {
            "h": "What to share"
          },
          {
            "ul": [
              "Onboarding steps and their dates.",
              "Tasks promised in meetings.",
              "Answers to their requests."
            ]
          }
        ],
        "curahold": "Customers sign in with a link in their email and see only what you share; the requests they raise land on your team’s board."
      }
    ]
  },
  tr: {
    "title": "Müşteri ekipleri için şablonlar ve sözlük",
    "lead": "Müşteriyi tutma işi için kopyalayabileceğiniz şablonlar ve sade tanımlar: yenilemeler, iş değerlendirmeleri, sağlık skoru ve müşteri kaybı.",
    "seo": [
      "Müşteri başarısı şablonları ve sözlüğü | Curahold",
      "Yenileme playbook’u ve iş değerlendirmesi için ücretsiz şablonlar; sağlık skoru, müşteri kaybı, yenileme ve müşteri portalı için sade tanımlar."
    ],
    "templates": "Şablonlar",
    "glossary": "Sözlük",
    "inCurahold": "Curahold’da",
    "nav": [
      "Şablonlar ve sözlük",
      "Yenileme adımları, değerlendirme gündemi ve sade tanımlar."
    ],
    "items": [
      {
        "slug": "renewal-playbook",
        "kind": "template",
        "name": "Yenileme playbook’u şablonu",
        "seo": [
          "Yenileme playbook’u şablonu: 90 gün önceden | Curahold",
          "Kopyalayabileceğiniz bir yenileme playbook’u: sözleşme yenilenmeden 90, 75, 60 ve 30 gün önce ne yapılır, sorumlu kim, görüşmeden önce neye bakılır."
        ],
        "lead": "Yenileme, tarihin kendisinde değil, ondan önceki üç ayda kazanılır. Bu adımları kopyalayın, her birine bir sorumlu verin ve yenileme tarihinden geriye doğru sayın.",
        "body": [
          {
            "h": "Adımlar"
          },
          {
            "ol": [
              "90 gün önce: kullanımı, açık talepleri ve sağlık skorunu gözden geçirin; sizi kaygılandıran her şeyi not edin.",
              "75 gün önce: karar vericiyle ve günlük muhatapla yenileme görüşmesini planlayın.",
              "60 gün önce: kullanıcı sayısı ya da plan değişiklikleriyle birlikte yenileme teklifini gönderin.",
              "30 gün önce: teklifin takibini yapın ve açık soruları yazılı olarak netleştirin.",
              "Yenileme tarihinde: imzalanan yenilemeyi teyit edin ve üzerinde anlaşılanları kaydedin."
            ]
          },
          {
            "h": "Yenileme görüşmesinden önce"
          },
          {
            "ul": [
              "Müşteri bu yıl neyi başarmak istedi, başarabildi mi?",
              "Önceki toplantılarda verilen sözlerden hangileri hâlâ açık?",
              "Kararı kim veriyor ve son zamanlarda sizinle bir toplantıda bulundu mu?"
            ]
          }
        ],
        "curahold": "Yenilemeleri açtığınızda, bir yenileme playbook’u adımlarını her yenileme tarihinden doksan gün önce görev olarak açar; her birinin sorumlusu ve yenilemeden geriye sayılan bir tarihi olur."
      },
      {
        "slug": "business-review-agenda",
        "kind": "template",
        "name": "İş değerlendirmesi (QBR) gündemi şablonu",
        "seo": [
          "İş değerlendirmesi (QBR) gündemi şablonu | Curahold",
          "Müşteri ekipleri için bir saatlik iş değerlendirmesi gündemi: hedeflere göre sonuçlar, değişenler, açık sözler, gelecek çeyreğin planı ve net sonraki adımlar."
        ],
        "lead": "Çeyreklik bir iş değerlendirmesi, müşteriye sağlanan değerin kanıtını, iki tarafa da aynı sonraki adımları bırakmalıdır. Bu gündem bir saate sığar.",
        "body": [
          {
            "h": "Gündem (60 dakika)"
          },
          {
            "ol": [
              "5 dakika: toplantının hedefleri ve kimlerin katıldığı.",
              "15 dakika: geçen çeyrek belirlenen hedeflere göre sonuçlar.",
              "10 dakika: müşteri tarafında değişenler: kişiler, öncelikler, bütçe.",
              "10 dakika: açık talepler ve sözler, her birinin durumu.",
              "15 dakika: gelecek çeyreğin planı.",
              "5 dakika: her birinin sorumlusu ve tarihi olan sonraki adımlar."
            ]
          },
          {
            "h": "Toplantıdan sonra"
          },
          {
            "p": "Aynı gün kısa bir özet gönderin: üzerinde anlaşılanlar, sorumlu ve tarihleriyle sonraki adımlar ve bir sonraki değerlendirmenin tarihi."
          }
        ],
        "curahold": "Değerlendirmeyi müşteri üzerinde bir toplantı olarak kaydedin ve sonraki adımlarını yazın; kaydettiğinizde her biri sorumlusu ve tarihi olan bir göreve dönüşür, isterseniz müşterinin portalında paylaşılır."
      },
      {
        "slug": "customer-health-score",
        "kind": "term",
        "name": "Müşteri sağlık skoru",
        "seo": [
          "Müşteri sağlık skoru nedir? Sade bir tanım | Curahold",
          "Müşteri sağlık skoru, bir müşteri ilişkisinin gidişatını tek bir sayıda özetler; son temas, geciken işler ve açık sorunlar gibi sinyallerden oluşur."
        ],
        "lead": "Müşteri sağlık skoru, bir müşteri ilişkisinin ne kadar iyi gittiğini özetleyen, çoğunlukla 0 ile 100 arasında tek bir sayıdır.",
        "body": [
          {
            "p": "Ekibin gözlemleyebildiği sinyallerden oluşur: müşteriyle en son ne zaman konuşulduğu, söz verilen işlerin gecikip gecikmediği, müşteri tarafında güçlü bir destekçi olup olmadığı, açık engeller ve destek talepleri. Her sinyal puan ekler ya da düşürür."
          },
          {
            "h": "Neden önemli"
          },
          {
            "p": "Onlarca müşteriden oluşan bir portföy, sessizleşen müşteriyi gizler. Skor müşterileri sıralar; ilgi önce yenilemesi riskte olana gider."
          },
          {
            "h": "İyi bir skoru ne belirler"
          },
          {
            "ul": [
              "Kendini açıklar: hangi sinyallerin onu değiştirdiğini herkes görebilir.",
              "Ekibin güvendiği ve üzerine harekete geçebildiği sinyalleri kullanır.",
              "Bir kez okunmaz, zaman içinde izlenir."
            ]
          }
        ],
        "curahold": "Her müşterinin, sizin koyduğunuz kurallardan oluşan 0–100 arası bir skoru olur; nedenleri sıralanır ve son otuz gündeki gidişatı görünür."
      },
      {
        "slug": "churn",
        "kind": "term",
        "name": "Müşteri kaybı (churn)",
        "seo": [
          "Müşteri kaybı (churn) nedir? Tanım ve sinyaller | Curahold",
          "Churn, bir dönemde kaybedilen müşterilerin ya da gelirin oranıdır. Neyin kayıp sayıldığı, nasıl ölçüldüğü ve ondan önce gelen erken sinyaller."
        ],
        "lead": "Müşteri kaybı (churn), bir müşterinin satın almayı bırakmasıdır: iptal eder ya da yenilemez. Kayıp oranı, bir dönemde kaybedilen müşterilerin ya da gelirin payıdır.",
        "body": [
          {
            "h": "Nasıl ölçülür"
          },
          {
            "ul": [
              "Müşteri kaybı: dönemde kaybedilen müşteriler, dönem başındaki müşteri sayısına bölünür.",
              "Gelir kaybı: iptal ve plan düşürmelerle kaybedilen tekrarlayan gelir, dönem başındaki tekrarlayan gelire bölünür."
            ]
          },
          {
            "h": "Önce gelen sinyaller"
          },
          {
            "p": "Müşteri kaybı nadiren habersiz gelir. Temas seyrekleşir, söz verilen işler gecikir, destekçi ayrılır, destek talepleri birikir. Bu sinyalleri izlemek, ekibin yenileme tarihinden önce harekete geçmesini sağlar."
          }
        ],
        "curahold": "Bu tür sinyaller her müşterinin sağlık skoruna yansır; böylece sessizleşen müşteriler yenilemelerinden çok önce öne çıkar."
      },
      {
        "slug": "contract-renewal",
        "kind": "term",
        "name": "Sözleşme yenileme",
        "seo": [
          "Sözleşme yenileme nedir? Süreç ve zamanlama | Curahold",
          "Sözleşme yenileme, bir müşteri anlaşmasını yeni bir dönem için uzatır. Ne zaman başlanır, süreç neye benzer ve neden tarihten aylar önce başlar."
        ],
        "lead": "Sözleşme yenileme, bir müşterinin anlaşmasını yeni bir dönem için uzatır; çoğu zaman değişikliklerle: daha fazla kullanıcı, farklı bir plan ya da yeni bir fiyat.",
        "body": [
          {
            "h": "Ne zaman başlar"
          },
          {
            "p": "Yıllık bir sözleşmede iş genellikle yaklaşık doksan gün önceden başlar. Bu, sağlanan değeri gözden geçirmeye, karar vericiyle görüşmeye, teklif göndermeye ve soruları acele etmeden netleştirmeye zaman bırakır."
          },
          {
            "h": "Genellikle ne ters gider"
          },
          {
            "ul": [
              "Tarih çok geç fark edilir.",
              "Sözleşmeyi imzalayan kişi ayrılmıştır.",
              "Yıl içinde verilen sözler hâlâ açıktır."
            ]
          }
        ],
        "curahold": "Bir yenileme, kendi playbook’unu doksan gün önceden sorumlusu ve tarihi olan görevler olarak, satış hunisindeki bir yenileme fırsatıyla birlikte açabilir."
      },
      {
        "slug": "customer-portal",
        "kind": "term",
        "name": "Müşteri portalı",
        "seo": [
          "Müşteri portalı nedir? Tanım ve kullanım alanları | Curahold",
          "Müşteri portalı, müşterinin kendisiyle paylaşılan işi gördüğü, talep açtığı ve yanıtları okuduğu özel bir alandır; dağınık e-posta yazışmalarının yerini alır."
        ],
        "lead": "Müşteri portalı, müşterinin kendisiyle paylaşılan işi gördüğü, talep açtığı ve ekibin yanıtlarını okuduğu özel bir web sayfasıdır.",
        "body": [
          {
            "h": "Ekipler neden kullanır"
          },
          {
            "p": "Durum e-postalarının yerini alır. Müşteri ilerlemeyi istediği zaman görür; talepleri dağınık yazışmalar yerine tek bir yerde toplanır."
          },
          {
            "h": "Neler paylaşılır"
          },
          {
            "ul": [
              "Onboarding adımları ve tarihleri.",
              "Toplantılarda söz verilen görevler.",
              "Taleplerine verilen yanıtlar."
            ]
          }
        ],
        "curahold": "Müşteriler e-postalarındaki bir bağlantıyla girer ve yalnızca paylaştıklarınızı görür; açtıkları talepler ekibinizin panosuna düşer."
      }
    ]
  },
  ar: {
    "title": "قوالب ومسرد لفرق العملاء",
    "lead": "قوالب يمكنك نسخها وتعريفات واضحة لعمل الحفاظ على العملاء: التجديدات ومراجعات الأعمال ومؤشر الصحة وفقدان العملاء.",
    "seo": [
      "قوالب ومسرد مصطلحات لفرق نجاح العملاء | Curahold",
      "قوالب مجانية لدليل التجديد ومراجعة الأعمال، وتعريفات واضحة لمؤشر الصحة وفقدان العملاء وتجديد العقود وبوابة العملاء."
    ],
    "templates": "القوالب",
    "glossary": "المسرد",
    "inCurahold": "في Curahold",
    "nav": [
      "القوالب والمسرد",
      "خطوات التجديد وجدول مراجعة الأعمال وتعريفات واضحة."
    ],
    "items": [
      {
        "slug": "renewal-playbook",
        "kind": "template",
        "name": "قالب دليل التجديد",
        "seo": [
          "قالب دليل التجديد: خطوات قبل الموعد بـ90 يومًا | Curahold",
          "دليل تجديد يمكنك نسخه: ماذا تفعل قبل تجديد العقد بـ90 و75 و60 و30 يومًا، ومن المسؤول عن كل خطوة، وما الذي تراجعه قبل المكالمة."
        ],
        "lead": "يُكسب التجديد في الأشهر الثلاثة التي تسبق موعده، لا في يومه. انسخ هذه الخطوات، وعيّن لكل منها مسؤولًا، واحسبها رجوعًا من تاريخ التجديد.",
        "body": [
          {
            "h": "الخطوات"
          },
          {
            "ol": [
              "قبل 90 يومًا: راجع الاستخدام والطلبات المفتوحة ومؤشر الصحة، ودوّن كل ما يقلقك.",
              "قبل 75 يومًا: حدّد موعد مكالمة التجديد مع صاحب القرار ومع جهة الاتصال اليومية.",
              "قبل 60 يومًا: أرسل عرض التجديد مع أي تغيير في المقاعد أو الخطة.",
              "قبل 30 يومًا: تابع العرض وحسم الأسئلة المفتوحة كتابيًا.",
              "في يوم التجديد: أكّد التجديد الموقّع وسجّل ما تم الاتفاق عليه."
            ]
          },
          {
            "h": "قبل مكالمة التجديد"
          },
          {
            "ul": [
              "ما الذي أراد العميل تحقيقه هذا العام، وهل حققه؟",
              "أي الوعود من الاجتماعات السابقة ما زالت مفتوحة؟",
              "من يتخذ القرار، وهل حضر اجتماعًا معك مؤخرًا؟"
            ]
          }
        ],
        "curahold": "فعّل التجديدات، وسيفتح دليل التجديد خطواته مهامَّ قبل كل تاريخ تجديد بتسعين يومًا، لكل منها مسؤول وتاريخ استحقاق محسوب رجوعًا من التجديد."
      },
      {
        "slug": "business-review-agenda",
        "kind": "template",
        "name": "قالب جدول مراجعة الأعمال (QBR)",
        "seo": [
          "قالب جدول أعمال مراجعة الأعمال الفصلية (QBR) | Curahold",
          "جدول أعمال لمراجعة أعمال مدتها ساعة: النتائج مقابل الأهداف، وما تغيّر، والوعود المفتوحة، وخطة الربع القادم، وخطوات تالية واضحة."
        ],
        "lead": "ينبغي أن تترك مراجعة الأعمال الفصلية لدى العميل دليلًا على القيمة، ولدى الطرفين الخطوات التالية نفسها. هذا الجدول يتسع في ساعة واحدة.",
        "body": [
          {
            "h": "جدول الأعمال (60 دقيقة)"
          },
          {
            "ol": [
              "5 دقائق: أهداف الاجتماع ومن يحضره.",
              "15 دقيقة: النتائج مقابل الأهداف التي حُددت في الربع الماضي.",
              "10 دقائق: ما تغيّر لدى العميل: الأشخاص والأولويات والميزانية.",
              "10 دقائق: الطلبات والوعود المفتوحة وحالة كل منها.",
              "15 دقيقة: خطة الربع القادم.",
              "5 دقائق: الخطوات التالية، لكل منها مسؤول وتاريخ."
            ]
          },
          {
            "h": "بعد الاجتماع"
          },
          {
            "p": "أرسل ملخصًا قصيرًا في اليوم نفسه: ما تم الاتفاق عليه، والخطوات التالية بمسؤوليها وتواريخها، وموعد المراجعة القادمة."
          }
        ],
        "curahold": "سجّل المراجعة اجتماعًا على العميل واكتب خطواتها التالية؛ عند الحفظ تصبح كل خطوة مهمة لها مسؤول وتاريخ، ويمكنك مشاركتها في بوابة العميل."
      },
      {
        "slug": "customer-health-score",
        "kind": "term",
        "name": "مؤشر صحة العميل",
        "seo": [
          "ما هو مؤشر صحة العميل؟ تعريف واضح ومختصر | Curahold",
          "يلخّص مؤشر صحة العميل حال العلاقة مع العميل في رقم واحد، مبني على إشارات مثل آخر تواصل والأعمال المتأخرة والمشكلات المفتوحة."
        ],
        "lead": "مؤشر صحة العميل رقم واحد، غالبًا من 0 إلى 100، يلخّص مدى جودة العلاقة مع العميل.",
        "body": [
          {
            "p": "يُبنى من إشارات يستطيع الفريق ملاحظتها: متى تحدّث أحد مع العميل آخر مرة، وهل تأخرت أعمال وُعد بها، وهل لدى العميل داعم قوي، والعوائق المفتوحة وطلبات الدعم. كل إشارة تضيف نقاطًا أو تنقصها."
          },
          {
            "h": "لماذا يهم"
          },
          {
            "p": "محفظة من عشرات العملاء تُخفي العميل الذي يبتعد بصمت. المؤشر يرتّبهم، فيذهب الاهتمام أولًا إلى من يكون تجديده في خطر."
          },
          {
            "h": "ما الذي يجعل المؤشر جيدًا"
          },
          {
            "ul": [
              "يشرح نفسه: يرى الجميع الإشارات التي غيّرته.",
              "يعتمد على إشارات يثق بها الفريق ويستطيع التصرف بناءً عليها.",
              "يُتابَع مع الوقت، لا يُقرأ مرة واحدة."
            ]
          }
        ],
        "curahold": "لكل عميل مؤشر من 0 إلى 100 مبني على قواعد تحددها أنت، مع قائمة بأسبابه واتجاهه خلال آخر ثلاثين يومًا."
      },
      {
        "slug": "churn",
        "kind": "term",
        "name": "فقدان العملاء (Churn)",
        "seo": [
          "فقدان العملاء (Churn): التعريف والإشارات المبكرة | Curahold",
          "فقدان العملاء هو نسبة العملاء أو الإيرادات التي تُفقد خلال فترة. ما الذي يُعد فقدانًا، وكيف يُقاس، وما الإشارات المبكرة التي تسبقه."
        ],
        "lead": "فقدان العملاء هو أن يتوقف العميل عن الشراء: يلغي أو لا يجدّد. ومعدل الفقدان هو نسبة العملاء، أو الإيرادات، المفقودة خلال فترة ما.",
        "body": [
          {
            "h": "كيف يُقاس"
          },
          {
            "ul": [
              "فقدان العملاء: العملاء المفقودون خلال الفترة مقسومين على عدد العملاء في بدايتها.",
              "فقدان الإيرادات: الإيرادات المتكررة المفقودة بالإلغاء أو خفض الخطة مقسومة على الإيرادات المتكررة في البداية."
            ]
          },
          {
            "h": "الإشارات التي تسبقه"
          },
          {
            "p": "نادرًا ما يأتي الفقدان دون إنذار: يقلّ التواصل، وتتأخر الأعمال الموعودة، ويغادر الداعم، وتتراكم طلبات الدعم. متابعة هذه الإشارات تتيح للفريق أن يتحرك قبل موعد التجديد."
          }
        ],
        "curahold": "تدخل مثل هذه الإشارات في مؤشر صحة كل عميل، فيظهر العملاء الذين يبتعدون قبل موعد تجديدهم بوقت طويل."
      },
      {
        "slug": "contract-renewal",
        "kind": "term",
        "name": "تجديد العقد",
        "seo": [
          "ما هو تجديد العقد؟ الخطوات والتوقيت المناسب | Curahold",
          "يمدّد تجديد العقد اتفاقية العميل لفترة جديدة. متى تبدأ، وكيف تبدو عملية التجديد، ولماذا تبدأ قبل الموعد بأشهر."
        ],
        "lead": "يمدّد تجديد العقد اتفاقية العميل لفترة أخرى، وغالبًا مع تغييرات: مقاعد أكثر، أو خطة مختلفة، أو سعر جديد.",
        "body": [
          {
            "h": "متى يبدأ"
          },
          {
            "p": "في العقد السنوي يبدأ العمل عادةً قبل الموعد بنحو تسعين يومًا. يترك ذلك وقتًا لمراجعة القيمة المقدَّمة، ولقاء صاحب القرار، وإرسال العرض، وحسم الأسئلة دون استعجال."
          },
          {
            "h": "ما الذي يسوء عادةً"
          },
          {
            "ul": [
              "يُنتبه إلى الموعد متأخرًا جدًا.",
              "غادر الشخص الذي وقّع العقد.",
              "ما زالت وعود قُطعت خلال العام مفتوحة."
            ]
          }
        ],
        "curahold": "يمكن للتجديد أن يفتح دليله قبل الموعد بتسعين يومًا، مهامَّ لها مسؤولون وتواريخ، مع فرصة تجديد في مسار المبيعات."
      },
      {
        "slug": "customer-portal",
        "kind": "term",
        "name": "بوابة العملاء",
        "seo": [
          "ما هي بوابة العملاء؟ التعريف والاستخدامات | Curahold",
          "بوابة العملاء مكان خاص يرى فيه العميل العمل الذي تمت مشاركته معه، ويرفع طلباته ويقرأ الردود، بدل ملاحقة سلاسل البريد."
        ],
        "lead": "بوابة العملاء صفحة ويب خاصة يرى فيها العميل العمل الذي تمت مشاركته معه، ويرفع طلباته، ويقرأ ردود الفريق.",
        "body": [
          {
            "h": "لماذا تستخدمها الفرق"
          },
          {
            "p": "تحلّ محل رسائل متابعة الحالة. يرى العميل التقدم متى شاء، وتصل طلباته إلى مكان واحد بدل سلاسل متفرقة."
          },
          {
            "h": "ما الذي تشاركه"
          },
          {
            "ul": [
              "خطوات التأهيل وتواريخها.",
              "المهام التي وُعد بها في الاجتماعات.",
              "الردود على طلباته."
            ]
          }
        ],
        "curahold": "يدخل العملاء برابط في بريدهم ولا يرون إلا ما تشاركه، وتصل الطلبات التي يرفعونها إلى لوحة فريقك."
      }
    ]
  },
  he: {
    "title": "תבניות ומילון לצוותי לקוחות",
    "lead": "תבניות שאפשר להעתיק והגדרות פשוטות לעבודה של שימור לקוחות: חידושים, סקירות עסקיות, ציון בריאות ונטישה.",
    "seo": [
      "תבניות ומילון מונחים להצלחת לקוחות | Curahold",
      "תבניות חינמיות לפלייבוק חידוש ולסקירה עסקית, והגדרות פשוטות לציון בריאות, נטישה, חידוש חוזה ופורטל לקוחות."
    ],
    "templates": "תבניות",
    "glossary": "מילון",
    "inCurahold": "ב-Curahold",
    "nav": [
      "תבניות ומילון",
      "שלבי חידוש, סדר יום לסקירה והגדרות פשוטות."
    ],
    "items": [
      {
        "slug": "renewal-playbook",
        "kind": "template",
        "name": "תבנית פלייבוק לחידוש",
        "seo": [
          "תבנית פלייבוק לחידוש: שלבים מתשעים יום לפני | Curahold",
          "פלייבוק חידוש שאפשר להעתיק: מה עושים 90, 75, 60 ו-30 יום לפני שחוזה מתחדש, מי אחראי לכל שלב ומה בודקים לפני השיחה."
        ],
        "lead": "חידוש נוצח בשלושת החודשים שלפני התאריך, לא בתאריך עצמו. העתיקו את השלבים, תנו לכל אחד אחראי וספרו אותם אחורה מתאריך החידוש.",
        "body": [
          {
            "h": "השלבים"
          },
          {
            "ol": [
              "90 יום לפני: בדקו שימוש, בקשות פתוחות וציון בריאות, ורשמו כל מה שמדאיג אתכם.",
              "75 יום לפני: קבעו שיחת חידוש עם מקבל ההחלטות ועם איש הקשר היומיומי.",
              "60 יום לפני: שלחו הצעת חידוש, עם כל שינוי במושבים או בתוכנית.",
              "30 יום לפני: עקבו אחרי ההצעה וסגרו שאלות פתוחות בכתב.",
              "ביום החידוש: אשרו את החידוש החתום ותעדו את מה שסוכם."
            ]
          },
          {
            "h": "לפני שיחת החידוש"
          },
          {
            "ul": [
              "מה הלקוח רצה להשיג השנה, והאם השיג?",
              "אילו הבטחות מפגישות קודמות עדיין פתוחות?",
              "מי מחליט, והאם השתתף לאחרונה בפגישה איתכם?"
            ]
          }
        ],
        "curahold": "הפעילו חידושים, ופלייבוק חידוש יפתח את השלבים שלו כמשימות תשעים יום לפני כל תאריך חידוש, לכל אחת אחראי ותאריך יעד שנספר אחורה מהחידוש."
      },
      {
        "slug": "business-review-agenda",
        "kind": "template",
        "name": "תבנית סדר יום לסקירה עסקית (QBR)",
        "seo": [
          "תבנית סדר יום לסקירה עסקית רבעונית (QBR) | Curahold",
          "סדר יום של שעה לסקירה עסקית: תוצאות מול יעדים, מה השתנה, הבטחות פתוחות, התוכנית לרבעון הבא וצעדים הבאים ברורים."
        ],
        "lead": "סקירה עסקית רבעונית צריכה להשאיר אצל הלקוח הוכחה לערך, ואצל שני הצדדים את אותם צעדים הבאים. סדר היום הזה נכנס בשעה אחת.",
        "body": [
          {
            "h": "סדר יום (60 דקות)"
          },
          {
            "ol": [
              "5 דקות: מטרות הפגישה ומי משתתף.",
              "15 דקות: תוצאות מול היעדים שנקבעו ברבעון הקודם.",
              "10 דקות: מה השתנה אצל הלקוח: אנשים, סדרי עדיפויות, תקציב.",
              "10 דקות: בקשות והבטחות פתוחות, ואיפה כל אחת עומדת.",
              "15 דקות: התוכנית לרבעון הבא.",
              "5 דקות: צעדים הבאים, לכל אחד אחראי ותאריך."
            ]
          },
          {
            "h": "אחרי הפגישה"
          },
          {
            "p": "שלחו סיכום קצר באותו יום: מה סוכם, הצעדים הבאים עם אחראים ותאריכים, ומועד הסקירה הבאה."
          }
        ],
        "curahold": "תעדו את הסקירה כפגישה על הלקוח וכתבו את הצעדים הבאים; בשמירה כל צעד הופך למשימה עם אחראי ותאריך, שאפשר לשתף בפורטל של הלקוח."
      },
      {
        "slug": "customer-health-score",
        "kind": "term",
        "name": "ציון בריאות לקוח",
        "seo": [
          "מה זה ציון בריאות לקוח? הגדרה פשוטה וברורה | Curahold",
          "ציון בריאות לקוח מסכם במספר אחד איך הולך הקשר עם הלקוח, על סמך אותות כמו קשר אחרון, עבודה באיחור ובעיות פתוחות."
        ],
        "lead": "ציון בריאות לקוח הוא מספר אחד, לרוב בין 0 ל-100, שמסכם עד כמה הקשר עם הלקוח טוב.",
        "body": [
          {
            "p": "הוא נבנה מאותות שהצוות יכול לראות: מתי דיברו עם הלקוח בפעם האחרונה, אם עבודה שהובטחה מאחרת, אם יש אצלו תומך חזק, חסמים פתוחים ופניות תמיכה. כל אות מוסיף או מוריד נקודות."
          },
          {
            "h": "למה זה חשוב"
          },
          {
            "p": "תיק של עשרות לקוחות מסתיר את הלקוח שמשתתק. הציון ממיין אותם, כך שתשומת הלב הולכת קודם למקום שבו החידוש בסיכון."
          },
          {
            "h": "מה עושה ציון טוב"
          },
          {
            "ul": [
              "הוא מסביר את עצמו: כולם רואים אילו אותות הזיזו אותו.",
              "הוא נשען על אותות שהצוות סומך עליהם ויכול לפעול לפיהם.",
              "עוקבים אחריו לאורך זמן, לא קוראים אותו פעם אחת."
            ]
          }
        ],
        "curahold": "לכל לקוח יש ציון בין 0 ל-100 שנבנה מכללים שאתם קובעים, עם רשימת הסיבות והמגמה בשלושים הימים האחרונים."
      },
      {
        "slug": "churn",
        "kind": "term",
        "name": "נטישת לקוחות (Churn)",
        "seo": [
          "נטישת לקוחות (Churn): הגדרה ואותות מוקדמים | Curahold",
          "נטישה היא שיעור הלקוחות או ההכנסות שאובדים בתקופה. מה נחשב נטישה, איך מודדים אותה, ואילו אותות מוקדמים מגיעים לפניה."
        ],
        "lead": "נטישה היא מצב שבו לקוח מפסיק לקנות: מבטל או לא מחדש. שיעור הנטישה הוא החלק של הלקוחות, או של ההכנסות, שאבד בתקופה מסוימת.",
        "body": [
          {
            "h": "איך מודדים"
          },
          {
            "ul": [
              "נטישת לקוחות: הלקוחות שאבדו בתקופה, חלקי מספר הלקוחות בתחילתה.",
              "נטישת הכנסות: הכנסה חוזרת שאבדה בביטולים ובהורדות תוכנית, חלקי ההכנסה החוזרת בתחילת התקופה."
            ]
          },
          {
            "h": "האותות שמגיעים קודם"
          },
          {
            "p": "נטישה כמעט אף פעם לא מגיעה בלי אזהרה. הקשר נחלש, עבודה שהובטחה מתעכבת, התומך עוזב, פניות תמיכה מצטברות. מעקב אחרי האותות האלה מאפשר לצוות לפעול לפני תאריך החידוש."
          }
        ],
        "curahold": "אותות כאלה נכנסים לציון הבריאות של כל לקוח, כך שהלקוחות שמשתתקים עולים לראש הרשימה הרבה לפני החידוש שלהם."
      },
      {
        "slug": "contract-renewal",
        "kind": "term",
        "name": "חידוש חוזה",
        "seo": [
          "מה זה חידוש חוזה? תהליך ולוח זמנים | Curahold",
          "חידוש חוזה מאריך את ההסכם עם הלקוח לתקופה נוספת. מתי מתחילים, איך נראה תהליך חידוש, ולמה הוא מתחיל חודשים לפני התאריך."
        ],
        "lead": "חידוש חוזה מאריך את ההסכם עם הלקוח לתקופה נוספת, לרוב עם שינויים: יותר מושבים, תוכנית אחרת או מחיר חדש.",
        "body": [
          {
            "h": "מתי מתחילים"
          },
          {
            "p": "בחוזה שנתי העבודה מתחילה בדרך כלל כתשעים יום מראש. זה משאיר זמן לבחון את הערך שניתן, לפגוש את מקבל ההחלטות, לשלוח הצעה ולסגור שאלות בלי לחץ."
          },
          {
            "h": "מה בדרך כלל משתבש"
          },
          {
            "ul": [
              "שמים לב לתאריך מאוחר מדי.",
              "מי שחתם כבר עזב.",
              "הבטחות שניתנו במהלך השנה עדיין פתוחות."
            ]
          }
        ],
        "curahold": "חידוש יכול לפתוח את הפלייבוק שלו תשעים יום מראש, כמשימות עם אחראים ותאריכים, יחד עם הזדמנות חידוש בצינור המכירות."
      },
      {
        "slug": "customer-portal",
        "kind": "term",
        "name": "פורטל לקוחות",
        "seo": [
          "מה זה פורטל לקוחות? הגדרה ושימושים נפוצים | Curahold",
          "פורטל לקוחות הוא מקום פרטי שבו הלקוח רואה את העבודה ששותפה איתו, פותח בקשות וקורא תשובות, במקום לרדוף אחרי שרשורי מייל."
        ],
        "lead": "פורטל לקוחות הוא דף אינטרנט פרטי שבו הלקוח רואה את העבודה ששותפה איתו, פותח בקשות וקורא את תשובות הצוות.",
        "body": [
          {
            "h": "למה צוותים משתמשים בו"
          },
          {
            "p": "הוא מחליף את מיילי הסטטוס. הלקוח רואה את ההתקדמות מתי שירצה, והבקשות שלו מגיעות למקום אחד במקום לשרשורים מפוזרים."
          },
          {
            "h": "מה משתפים"
          },
          {
            "ul": [
              "שלבי הקליטה והתאריכים שלהם.",
              "משימות שהובטחו בפגישות.",
              "תשובות לבקשות שלו."
            ]
          }
        ],
        "curahold": "הלקוחות נכנסים בקישור מהמייל ורואים רק מה שאתם משתפים; הבקשות שהם פותחים מגיעות ללוח של הצוות שלכם."
      }
    ]
  },
  fa: {
    "title": "قالب‌ها و واژه‌نامه برای تیم‌های مشتری",
    "lead": "قالب‌هایی که می‌توانید کپی کنید و تعریف‌های روشن برای کارِ نگه داشتن مشتری: تمدیدها، بازبینی‌های تجاری، امتیاز سلامت و ریزش مشتری.",
    "seo": [
      "قالب‌ها و واژه‌نامهٔ تیم‌های موفقیت مشتری | Curahold",
      "قالب‌های رایگان برای برنامهٔ تمدید و بازبینی تجاری، و تعریف‌های روشن امتیاز سلامت، ریزش مشتری، تمدید قرارداد و پورتال مشتری."
    ],
    "templates": "قالب‌ها",
    "glossary": "واژه‌نامه",
    "inCurahold": "در Curahold",
    "nav": [
      "قالب‌ها و واژه‌نامه",
      "گام‌های تمدید، دستور جلسهٔ بازبینی و تعریف‌های روشن."
    ],
    "items": [
      {
        "slug": "renewal-playbook",
        "kind": "template",
        "name": "قالب برنامهٔ تمدید",
        "seo": [
          "قالب برنامهٔ تمدید: گام‌ها از نود روز پیش | Curahold",
          "برنامهٔ تمدیدی که می‌توانید کپی کنید: ۹۰، ۷۵، ۶۰ و ۳۰ روز پیش از تمدید قرارداد چه کنید، مسئول هر گام کیست و پیش از تماس چه چیزی را بررسی کنید."
        ],
        "lead": "تمدید در سه ماهِ پیش از تاریخش به دست می‌آید، نه در خود آن روز. این گام‌ها را کپی کنید، برای هرکدام مسئولی بگذارید و از تاریخ تمدید به عقب بشمارید.",
        "body": [
          {
            "h": "گام‌ها"
          },
          {
            "ol": [
              "۹۰ روز پیش: استفاده، درخواست‌های باز و امتیاز سلامت را بررسی کنید و هر نگرانی را یادداشت کنید.",
              "۷۵ روز پیش: تماس تمدید را با تصمیم‌گیرنده و مخاطب روزمره هماهنگ کنید.",
              "۶۰ روز پیش: پیشنهاد تمدید را همراه با هر تغییری در صندلی‌ها یا طرح بفرستید.",
              "۳۰ روز پیش: پیشنهاد را پیگیری کنید و پرسش‌های باز را به‌صورت مکتوب روشن کنید.",
              "در روز تمدید: تمدید امضاشده را تأیید کنید و توافق‌ها را ثبت کنید."
            ]
          },
          {
            "h": "پیش از تماس تمدید"
          },
          {
            "ul": [
              "مشتری امسال می‌خواست به چه برسد، و رسید؟",
              "کدام قول‌های جلسه‌های قبلی هنوز باز است؟",
              "چه کسی تصمیم می‌گیرد و آیا اخیراً در جلسه‌ای با شما بوده است؟"
            ]
          }
        ],
        "curahold": "تمدیدها را روشن کنید تا برنامهٔ تمدید، گام‌هایش را نود روز پیش از هر تاریخ تمدید به‌صورت وظیفه باز کند؛ هرکدام با یک مسئول و موعدی که از تمدید به عقب شمرده می‌شود."
      },
      {
        "slug": "business-review-agenda",
        "kind": "template",
        "name": "قالب دستور جلسهٔ بازبینی تجاری (QBR)",
        "seo": [
          "قالب دستور جلسهٔ بازبینی تجاری فصلی (QBR) | Curahold",
          "دستور جلسهٔ یک‌ساعته برای بازبینی تجاری: نتایج در برابر اهداف، تغییرات، قول‌های باز، برنامهٔ فصل بعد و گام‌های بعدی روشن."
        ],
        "lead": "بازبینی تجاری فصلی باید برای مشتری نشانه‌ای از ارزش و برای هر دو طرف گام‌های بعدی یکسانی بگذارد. این دستور جلسه در یک ساعت جا می‌شود.",
        "body": [
          {
            "h": "دستور جلسه (۶۰ دقیقه)"
          },
          {
            "ol": [
              "۵ دقیقه: اهداف جلسه و حاضران.",
              "۱۵ دقیقه: نتایج در برابر اهدافی که فصل گذشته تعیین شد.",
              "۱۰ دقیقه: آنچه در طرف مشتری تغییر کرده است: افراد، اولویت‌ها، بودجه.",
              "۱۰ دقیقه: درخواست‌ها و قول‌های باز و وضعیت هرکدام.",
              "۱۵ دقیقه: برنامهٔ فصل بعد.",
              "۵ دقیقه: گام‌های بعدی، هرکدام با مسئول و تاریخ."
            ]
          },
          {
            "h": "پس از جلسه"
          },
          {
            "p": "همان روز خلاصه‌ای کوتاه بفرستید: توافق‌ها، گام‌های بعدی با مسئول و تاریخ، و تاریخ بازبینی بعدی."
          }
        ],
        "curahold": "بازبینی را به‌عنوان جلسه روی پروندهٔ مشتری ثبت کنید و گام‌های بعدی را بنویسید؛ با ذخیره، هر گام وظیفه‌ای با مسئول و تاریخ می‌شود که می‌توانید در پورتال مشتری به اشتراک بگذارید."
      },
      {
        "slug": "customer-health-score",
        "kind": "term",
        "name": "امتیاز سلامت مشتری",
        "seo": [
          "امتیاز سلامت مشتری چیست؟ تعریفی ساده و روشن | Curahold",
          "امتیاز سلامت مشتری وضعیت رابطه با مشتری را در یک عدد خلاصه می‌کند؛ بر پایهٔ نشانه‌هایی مثل آخرین تماس، کارهای عقب‌افتاده و مشکلات باز."
        ],
        "lead": "امتیاز سلامت مشتری یک عدد است، معمولاً از ۰ تا ۱۰۰، که خلاصه می‌کند رابطه با مشتری چقدر خوب پیش می‌رود.",
        "body": [
          {
            "p": "این امتیاز از نشانه‌هایی ساخته می‌شود که تیم می‌تواند ببیند: آخرین بار کِی با مشتری صحبت شده، آیا کار قول‌داده‌شده عقب افتاده، آیا در طرف مشتری حامی قوی هست، مانع‌های باز و درخواست‌های پشتیبانی. هر نشانه امتیازی می‌افزاید یا می‌کاهد."
          },
          {
            "h": "چرا مهم است"
          },
          {
            "p": "سبدی از ده‌ها مشتری، مشتری‌ای را که بی‌صدا دور می‌شود پنهان می‌کند. امتیاز آن‌ها را مرتب می‌کند تا توجه اول به جایی برود که تمدید در خطر است."
          },
          {
            "h": "امتیاز خوب چه ویژگی‌ای دارد"
          },
          {
            "ul": [
              "خودش را توضیح می‌دهد: همه می‌بینند کدام نشانه‌ها آن را تغییر داده‌اند.",
              "بر نشانه‌هایی تکیه دارد که تیم به آن‌ها اعتماد دارد و می‌تواند بر پایه‌شان کاری کند.",
              "در طول زمان دنبال می‌شود، نه این‌که یک بار خوانده شود."
            ]
          }
        ],
        "curahold": "هر مشتری امتیازی از ۰ تا ۱۰۰ دارد که از قواعد شما ساخته می‌شود، با فهرست دلایل و روند سی روز گذشته."
      },
      {
        "slug": "churn",
        "kind": "term",
        "name": "ریزش مشتری (Churn)",
        "seo": [
          "ریزش مشتری (Churn): تعریف و نشانه‌های زودهنگام | Curahold",
          "ریزش، سهم مشتریان یا درآمدی است که در یک دوره از دست می‌رود. چه چیزی ریزش حساب می‌شود، چطور اندازه‌گیری می‌شود و چه نشانه‌هایی پیش از آن می‌آید."
        ],
        "lead": "ریزش یعنی مشتری خرید را متوقف کند: لغو کند یا تمدید نکند. نرخ ریزش سهم مشتریان، یا درآمدی است که در یک دوره از دست رفته است.",
        "body": [
          {
            "h": "چطور اندازه‌گیری می‌شود"
          },
          {
            "ul": [
              "ریزش مشتری: مشتریان ازدست‌رفته در دوره، تقسیم بر تعداد مشتریان در آغاز آن.",
              "ریزش درآمد: درآمد تکرارشونده‌ای که با لغو یا کاهش طرح از دست رفته، تقسیم بر درآمد تکرارشونده در آغاز دوره."
            ]
          },
          {
            "h": "نشانه‌هایی که زودتر می‌آیند"
          },
          {
            "p": "ریزش به‌ندرت بی‌خبر می‌آید. تماس‌ها کم می‌شود، کار قول‌داده‌شده عقب می‌افتد، حامی می‌رود، درخواست‌های پشتیبانی انباشته می‌شود. دنبال کردن این نشانه‌ها به تیم امکان می‌دهد پیش از تاریخ تمدید دست به کار شود."
          }
        ],
        "curahold": "چنین نشانه‌هایی در امتیاز سلامت هر مشتری اثر می‌گذارند، تا مشتریانی که بی‌صدا دور می‌شوند خیلی پیش از تمدیدشان دیده شوند."
      },
      {
        "slug": "contract-renewal",
        "kind": "term",
        "name": "تمدید قرارداد",
        "seo": [
          "تمدید قرارداد چیست؟ روند و زمان‌بندی مناسب | Curahold",
          "تمدید قرارداد، توافق با مشتری را برای دورهٔ تازه‌ای ادامه می‌دهد. کِی شروع کنیم، روند تمدید چه شکلی است و چرا ماه‌ها پیش از تاریخ آغاز می‌شود."
        ],
        "lead": "تمدید قرارداد، توافق مشتری را برای دورهٔ دیگری ادامه می‌دهد؛ اغلب با تغییر: صندلی‌های بیشتر، طرحی دیگر یا قیمتی تازه.",
        "body": [
          {
            "h": "کِی شروع می‌شود"
          },
          {
            "p": "در قرارداد سالانه، کار معمولاً حدود نود روز زودتر شروع می‌شود. این فرصت می‌دهد ارزش ارائه‌شده بررسی شود، با تصمیم‌گیرنده دیدار شود، پیشنهاد فرستاده شود و پرسش‌ها بدون عجله روشن شوند."
          },
          {
            "h": "معمولاً چه چیزی خراب می‌شود"
          },
          {
            "ul": [
              "تاریخ خیلی دیر دیده می‌شود.",
              "کسی که قرارداد را امضا کرده رفته است.",
              "قول‌هایی که در طول سال داده شده هنوز باز است."
            ]
          }
        ],
        "curahold": "یک تمدید می‌تواند برنامهٔ خودش را نود روز زودتر به‌صورت وظیفه‌هایی با مسئول و تاریخ باز کند، همراه با فرصت تمدیدی در قیف فروش."
      },
      {
        "slug": "customer-portal",
        "kind": "term",
        "name": "پورتال مشتری",
        "seo": [
          "پورتال مشتری چیست؟ تعریف و کاربردهای رایج | Curahold",
          "پورتال مشتری فضایی خصوصی است که مشتری در آن کار به‌اشتراک‌گذاشته را می‌بیند، درخواست ثبت می‌کند و پاسخ‌ها را می‌خواند، به‌جای دنبال کردن ایمیل‌ها."
        ],
        "lead": "پورتال مشتری صفحه‌ای خصوصی است که مشتری در آن کارِ به‌اشتراک‌گذاشته با خودش را می‌بیند، درخواست ثبت می‌کند و پاسخ‌های تیم را می‌خواند.",
        "body": [
          {
            "h": "چرا تیم‌ها از آن استفاده می‌کنند"
          },
          {
            "p": "جای ایمیل‌های گزارش وضعیت را می‌گیرد. مشتری هر وقت بخواهد پیشرفت را می‌بیند و درخواست‌هایش به‌جای رشته‌های پراکنده در یک‌جا جمع می‌شود."
          },
          {
            "h": "چه چیزی به اشتراک بگذاریم"
          },
          {
            "ul": [
              "گام‌های راه‌اندازی و تاریخ‌هایشان.",
              "وظایفی که در جلسه‌ها قول داده شده.",
              "پاسخ به درخواست‌هایش."
            ]
          }
        ],
        "curahold": "مشتریان با پیوندی در ایمیل‌شان وارد می‌شوند و فقط آنچه را شما به اشتراک می‌گذارید می‌بینند؛ درخواست‌هایشان به برد تیم شما می‌رسد."
      }
    ]
  },
  "zh-Hans": {
    "title": "面向客户团队的模板与术语表",
    "lead": "可直接复制的模板和通俗易懂的术语解释，覆盖留住客户的日常工作：续约、业务回顾、健康评分和客户流失。",
    "seo": [
      "面向客户成功团队的模板与术语表 | Curahold",
      "这里汇集了可直接复制的续约手册和业务回顾免费模板，以及健康评分、客户流失、合同续约和客户门户的通俗解释，帮助客户团队把留住客户的日常工作做扎实。"
    ],
    "templates": "模板",
    "glossary": "术语表",
    "inCurahold": "在 Curahold 中",
    "nav": [
      "模板与术语表",
      "续约步骤、回顾议程和术语解释。"
    ],
    "items": [
      {
        "slug": "renewal-playbook",
        "kind": "template",
        "name": "续约手册模板",
        "seo": [
          "续约手册模板：从到期前 90 天开始 | Curahold",
          "一份可直接复制的续约手册：合同到期前 90、75、60 和 30 天分别要做什么，每一步由谁负责，续约沟通之前还需要确认哪些关键事项，附可直接使用的检查清单。"
        ],
        "lead": "续约不是在到期当天赢下的，而是在到期前的三个月里。复制这些步骤，为每一步指定负责人，并从续约日期倒推时间。",
        "body": [
          {
            "h": "步骤"
          },
          {
            "ol": [
              "到期前 90 天：查看使用情况、未处理的需求和健康评分，记下所有让你担心的地方。",
              "到期前 75 天：与决策人和日常对接人约好续约沟通。",
              "到期前 60 天：发送续约报价，包含席位或方案的变化。",
              "到期前 30 天：跟进报价，并以书面形式确认尚未解决的问题。",
              "续约当天：确认已签署的续约，并记录双方的约定。"
            ]
          },
          {
            "h": "续约沟通之前"
          },
          {
            "ul": [
              "客户今年想达成什么目标，达成了吗？",
              "之前会议中的承诺，哪些还没有完成？",
              "谁来做决定，他最近和你开过会吗？"
            ]
          }
        ],
        "curahold": "开启续约后，续约手册会在每个续约日期前 90 天把各个步骤创建为任务，每项任务都有负责人和从续约日期倒推的截止日期。"
      },
      {
        "slug": "business-review-agenda",
        "kind": "template",
        "name": "业务回顾（QBR）议程模板",
        "seo": [
          "业务回顾（QBR）会议议程模板 | Curahold",
          "一小时业务回顾的会议议程模板：对照目标的结果、客户方发生的变化、尚未兑现的承诺、下季度计划，以及明确的后续步骤、负责人和完成日期，适合每季度使用。"
        ],
        "lead": "季度业务回顾应当让客户看到价值的证据，也让双方带着同样的后续步骤离开。这份议程可以在一小时内完成。",
        "body": [
          {
            "h": "议程（60 分钟）"
          },
          {
            "ol": [
              "5 分钟：会议目标和参会人。",
              "15 分钟：对照上季度目标的结果。",
              "10 分钟：客户方的变化：人员、优先事项、预算。",
              "10 分钟：未完成的需求和承诺，以及各自的进展。",
              "15 分钟：下季度计划。",
              "5 分钟：后续步骤，每一步都有负责人和日期。"
            ]
          },
          {
            "h": "会议结束后"
          },
          {
            "p": "当天发送一份简短总结：达成的共识、带负责人和日期的后续步骤，以及下次回顾的时间。"
          }
        ],
        "curahold": "把回顾记录为客户的一次会议并写下后续步骤，保存后每一步都会变成有负责人和日期的任务，还可以在客户门户中共享。"
      },
      {
        "slug": "customer-health-score",
        "kind": "term",
        "name": "客户健康评分",
        "seo": [
          "什么是客户健康评分？通俗易懂的定义 | Curahold",
          "客户健康评分用一个数字概括客户关系的状况，依据最近一次联系、逾期的工作和未解决的问题等信号计算得出，帮助团队优先关注续约有风险的客户，并说明每次变化的原因。"
        ],
        "lead": "客户健康评分是一个数字，通常在 0 到 100 之间，用来概括与客户的关系进展得好不好。",
        "body": [
          {
            "p": "它由团队能观察到的信号构成：最近一次和客户沟通是什么时候，承诺的工作是否逾期，客户方是否有强有力的支持者，还有未解决的阻碍和客服请求。每个信号都会加分或减分。"
          },
          {
            "h": "为什么重要"
          },
          {
            "p": "几十个客户放在一起，悄悄疏远的那一个很容易被淹没。按评分排序后，注意力会先落在续约有风险的客户身上。"
          },
          {
            "h": "好的评分具备什么"
          },
          {
            "ul": [
              "能解释自己：谁都能看到是哪些信号让它变化。",
              "使用团队信任、能据此采取行动的信号。",
              "长期跟踪，而不是只看一次。"
            ]
          }
        ],
        "curahold": "每个客户都有一个按您设定的规则计算的 0 到 100 分评分，并列出原因和最近 30 天的变化趋势。"
      },
      {
        "slug": "churn",
        "kind": "term",
        "name": "客户流失（Churn）",
        "seo": [
          "什么是客户流失（Churn）？定义与早期信号 | Curahold",
          "客户流失是指一段时间内失去的客户或收入所占的比例。本文说明什么算流失、如何计算流失率，以及流失发生之前通常会出现的几种早期信号，以及如何应对。"
        ],
        "lead": "客户流失是指客户不再购买：取消订阅或不再续约。流失率是指一段时间内失去的客户或收入所占的比例。",
        "body": [
          {
            "h": "如何计算"
          },
          {
            "ul": [
              "客户流失率：期间内流失的客户数，除以期初的客户数。",
              "收入流失率：因取消和降级而损失的经常性收入，除以期初的经常性收入。"
            ]
          },
          {
            "h": "先出现的信号"
          },
          {
            "p": "流失很少毫无预兆。联系变少，承诺的工作拖延，支持者离开，客服请求越积越多。持续关注这些信号，团队才能在续约日期之前采取行动。"
          }
        ],
        "curahold": "这类信号会计入每个客户的健康评分，让逐渐疏远的客户在续约之前很早就排到前面。"
      },
      {
        "slug": "contract-renewal",
        "kind": "term",
        "name": "合同续约",
        "seo": [
          "什么是合同续约？流程与时间安排 | Curahold",
          "合同续约是把与客户的协议延长到新的周期。本文介绍何时开始准备、续约流程通常怎么走，以及为什么最好在到期前几个月就开始推进续约工作，避免临时抱佛脚。"
        ],
        "lead": "合同续约是把客户的协议延长到下一个周期，往往伴随变化：更多席位、不同的方案或新的价格。",
        "body": [
          {
            "h": "什么时候开始"
          },
          {
            "p": "对于年度合同，通常在到期前约 90 天开始准备。这样才有时间回顾已交付的价值、与决策人会面、发送报价，并从容地解答问题。"
          },
          {
            "h": "常见的问题"
          },
          {
            "ul": [
              "发现到期日期太晚。",
              "签合同的人已经离开。",
              "一年中做出的承诺还没有完成。"
            ]
          }
        ],
        "curahold": "每次续约都可以在到期前 90 天自动启动续约手册，生成有负责人和日期的任务，同时在销售管道中创建续约商机。"
      },
      {
        "slug": "customer-portal",
        "kind": "term",
        "name": "客户门户",
        "seo": [
          "什么是客户门户？定义与常见用途 | Curahold",
          "客户门户是客户查看共享工作、提交需求、阅读回复的专属空间，不必再在零散的邮件往来中来回查找，团队也能把所有请求集中到一个地方统一处理，回复更及时。"
        ],
        "lead": "客户门户是一个专属网页，客户可以在这里查看与自己共享的工作、提交需求，并阅读团队的回复。",
        "body": [
          {
            "h": "团队为什么使用"
          },
          {
            "p": "它取代了进度汇报邮件。客户随时可以查看进展，需求也集中到一个地方，而不是散落在各个邮件里。"
          },
          {
            "h": "共享哪些内容"
          },
          {
            "ul": [
              "上线步骤和日期。",
              "会议上承诺的任务。",
              "对客户需求的答复。"
            ]
          }
        ],
        "curahold": "客户通过邮件中的链接登录，只能看到您共享的内容；他们提交的需求会进入您团队的看板。"
      }
    ]
  },
  "zh-Hant": {
    "title": "為客戶團隊準備的範本與詞彙表",
    "lead": "可以直接複製的範本與淺顯易懂的詞彙解說，涵蓋留住客戶的日常工作：續約、業務檢討、健康評分與客戶流失。",
    "seo": [
      "為客戶成功團隊準備的範本與詞彙表 | Curahold",
      "這裡匯集了可以直接複製的續約手冊與業務檢討免費範本，以及健康評分、客戶流失、合約續約與客戶入口網站的淺顯說明，幫助客戶團隊把留住客戶的工作做紮實。"
    ],
    "templates": "範本",
    "glossary": "詞彙表",
    "inCurahold": "在 Curahold 中",
    "nav": [
      "範本與詞彙表",
      "續約步驟、檢討議程與詞彙解說。"
    ],
    "items": [
      {
        "slug": "renewal-playbook",
        "kind": "template",
        "name": "續約手冊範本",
        "seo": [
          "續約手冊範本：從到期前 90 天開始 | Curahold",
          "一份可以直接複製的續約手冊：合約到期前 90、75、60 和 30 天各要做什麼、每一步由誰負責，以及續約會談之前還需要確認哪些關鍵事項，附可直接使用的檢查清單。"
        ],
        "lead": "續約不是在到期當天贏得的，而是在到期前的三個月。複製這些步驟，為每一步指定負責人，並從續約日期往回推算時間。",
        "body": [
          {
            "h": "步驟"
          },
          {
            "ol": [
              "到期前 90 天：檢視使用狀況、尚未處理的需求與健康評分，記下所有讓你擔心的地方。",
              "到期前 75 天：與決策者和日常窗口約好續約會談。",
              "到期前 60 天：寄出續約報價，包含席次或方案的變更。",
              "到期前 30 天：追蹤報價，並以書面方式釐清尚未解決的問題。",
              "續約當天：確認已簽署的續約，並記錄雙方的約定。"
            ]
          },
          {
            "h": "續約會談之前"
          },
          {
            "ul": [
              "客戶今年想達成什麼目標，達成了嗎？",
              "先前會議中的承諾，哪些還沒完成？",
              "誰做決定，他最近和你開過會嗎？"
            ]
          }
        ],
        "curahold": "開啟續約後，續約手冊會在每個續約日期前 90 天把各步驟建立成任務，每項任務都有負責人和從續約日期往回推算的期限。"
      },
      {
        "slug": "business-review-agenda",
        "kind": "template",
        "name": "業務檢討（QBR）議程範本",
        "seo": [
          "業務檢討（QBR）會議議程範本 | Curahold",
          "一小時業務檢討的會議議程範本：對照目標的成果、客戶端發生的變化、尚未兌現的承諾、下一季的計畫，以及明確的後續步驟、負責人與完成日期，適合每季使用。"
        ],
        "lead": "季度業務檢討應該讓客戶看到價值的證據，也讓雙方帶著同樣的後續步驟離開。這份議程一小時內就能完成。",
        "body": [
          {
            "h": "議程（60 分鐘）"
          },
          {
            "ol": [
              "5 分鐘：會議目標與與會者。",
              "15 分鐘：對照上一季目標的成果。",
              "10 分鐘：客戶端的變化：人員、優先事項、預算。",
              "10 分鐘：尚未完成的需求與承諾，以及各自的進度。",
              "15 分鐘：下一季的計畫。",
              "5 分鐘：後續步驟，每一步都有負責人和日期。"
            ]
          },
          {
            "h": "會議結束後"
          },
          {
            "p": "當天寄出簡短摘要：達成的共識、附負責人和日期的後續步驟，以及下次檢討的時間。"
          }
        ],
        "curahold": "把檢討記錄為客戶的一場會議並寫下後續步驟，儲存後每一步都會變成有負責人和日期的任務，也可以在客戶入口網站中分享。"
      },
      {
        "slug": "customer-health-score",
        "kind": "term",
        "name": "客戶健康評分",
        "seo": [
          "什麼是客戶健康評分？淺顯易懂的定義 | Curahold",
          "客戶健康評分用一個數字概括客戶關係的狀況，依據最近一次聯繫、逾期的工作與尚未解決的問題等訊號計算，幫助團隊優先關注續約有風險的客戶，並說明每次變化的原因。"
        ],
        "lead": "客戶健康評分是一個數字，通常介於 0 到 100，用來概括與客戶的關係進展得好不好。",
        "body": [
          {
            "p": "它由團隊能觀察到的訊號構成：最近一次和客戶聯繫是什麼時候、承諾的工作是否逾期、客戶端是否有有力的支持者，還有尚未解決的阻礙與客服請求。每個訊號都會加分或扣分。"
          },
          {
            "h": "為什麼重要"
          },
          {
            "p": "幾十個客戶放在一起，悄悄疏遠的那一個很容易被淹沒。依評分排序後，注意力會先落在續約有風險的客戶身上。"
          },
          {
            "h": "好的評分具備什麼"
          },
          {
            "ul": [
              "能說明自己：誰都能看到是哪些訊號讓它改變。",
              "使用團隊信任、能據此採取行動的訊號。",
              "長期追蹤，而不是只看一次。"
            ]
          }
        ],
        "curahold": "每位客戶都有依您設定的規則計算的 0 到 100 分評分，並列出原因與最近 30 天的變化趨勢。"
      },
      {
        "slug": "churn",
        "kind": "term",
        "name": "客戶流失（Churn）",
        "seo": [
          "什麼是客戶流失（Churn）？定義與早期訊號 | Curahold",
          "客戶流失是指一段期間內失去的客戶或營收所占的比例。本文說明什麼算流失、如何計算流失率，以及流失發生之前通常會出現的幾種早期訊號，以及如何因應。"
        ],
        "lead": "客戶流失是指客戶不再購買：取消訂閱或不再續約。流失率是一段期間內失去的客戶或營收所占的比例。",
        "body": [
          {
            "h": "如何計算"
          },
          {
            "ul": [
              "客戶流失率：期間內流失的客戶數，除以期初的客戶數。",
              "營收流失率：因取消與降級而損失的經常性營收，除以期初的經常性營收。"
            ]
          },
          {
            "h": "先出現的訊號"
          },
          {
            "p": "流失很少毫無預警。聯繫變少、承諾的工作延宕、支持者離開、客服請求越積越多。持續留意這些訊號，團隊才能在續約日期之前採取行動。"
          }
        ],
        "curahold": "這類訊號會計入每位客戶的健康評分，讓逐漸疏遠的客戶在續約之前很早就排到前面。"
      },
      {
        "slug": "contract-renewal",
        "kind": "term",
        "name": "合約續約",
        "seo": [
          "什麼是合約續約？流程與時程安排 | Curahold",
          "合約續約是把與客戶的協議延長到新的期間。本文介紹何時開始準備、續約流程通常怎麼進行，以及為什麼最好在到期前幾個月就開始推動續約工作，避免臨時抱佛腳。"
        ],
        "lead": "合約續約是把客戶的協議延長到下一個期間，常伴隨變更：更多席次、不同的方案或新的價格。",
        "body": [
          {
            "h": "什麼時候開始"
          },
          {
            "p": "年約通常在到期前約 90 天開始準備。這樣才有時間檢視已交付的價值、與決策者見面、寄出報價，並從容地回答問題。"
          },
          {
            "h": "常見的問題"
          },
          {
            "ul": [
              "太晚才發現到期日。",
              "簽約的人已經離開。",
              "一年中做出的承諾還沒有完成。"
            ]
          }
        ],
        "curahold": "每次續約都可以在到期前 90 天自動啟動續約手冊，產生有負責人和日期的任務，同時在銷售漏斗中建立續約交易。"
      },
      {
        "slug": "customer-portal",
        "kind": "term",
        "name": "客戶入口網站",
        "seo": [
          "什麼是客戶入口網站？定義與常見用途 | Curahold",
          "客戶入口網站是客戶查看分享的工作、提出需求、閱讀回覆的專屬空間，不必再在零散的郵件往來中來回翻找，團隊也能把所有請求集中在同一處處理，回覆更即時。"
        ],
        "lead": "客戶入口網站是一個專屬網頁，客戶可以在這裡查看與自己分享的工作、提出需求，並閱讀團隊的回覆。",
        "body": [
          {
            "h": "團隊為什麼使用"
          },
          {
            "p": "它取代了進度回報郵件。客戶隨時都能查看進展，需求也集中到同一個地方，而不是散落在各封郵件裡。"
          },
          {
            "h": "分享哪些內容"
          },
          {
            "ul": [
              "導入步驟與日期。",
              "會議上承諾的任務。",
              "對客戶需求的回覆。"
            ]
          }
        ],
        "curahold": "客戶透過電子郵件中的連結登入，只會看到您分享的內容；他們提出的需求會進入您團隊的看板。"
      }
    ]
  },
  ja: {
    "title": "カスタマーチームのための\u200bテンプレートと\u200b用語集",
    "lead": "顧客を守る仕事に使える、コピーできるテンプレートとわかりやすい用語解説。更新、ビジネスレビュー、ヘルススコア、解約を取り上げます。",
    "seo": [
      "カスタマーサクセスのテンプレートと用語集 | Curahold",
      "更新プレイブックとビジネスレビューのすぐに使える無料テンプレート、そしてヘルススコア、解約、契約更新、顧客ポータルのわかりやすい解説をまとめました。"
    ],
    "templates": "テンプレート",
    "glossary": "用語集",
    "inCurahold": "Curahold では",
    "nav": [
      "テンプレートと用語集",
      "更新の手順、レビューの議題、用語の解説。"
    ],
    "items": [
      {
        "slug": "renewal-playbook",
        "kind": "template",
        "name": "更新プレイブックのテンプレート",
        "seo": [
          "更新プレイブックのテンプレート：90日前からの手順 | Curahold",
          "そのまま使える更新プレイブック。契約更新の90日前、75日前、60日前、30日前にやること、各ステップの担当、更新の打ち合わせ前に確認することをまとめました。"
        ],
        "lead": "更新は当日ではなく、その前の3か月で決まります。この手順をコピーし、ステップごとに担当者を決め、更新日から逆算して日付を入れてください。",
        "body": [
          {
            "h": "手順"
          },
          {
            "ol": [
              "90日前：利用状況、未対応の依頼、ヘルススコアを確認し、気になる点を書き出します。",
              "75日前：意思決定者と日々の窓口担当者との更新の打ち合わせを設定します。",
              "60日前：シート数やプランの変更を含めた更新の見積もりを送ります。",
              "30日前：見積もりをフォローし、残っている質問を書面で解決します。",
              "更新日：署名済みの更新を確認し、合意内容を記録します。"
            ]
          },
          {
            "h": "更新の打ち合わせの前に"
          },
          {
            "ul": [
              "顧客は今年何を達成したかったのか、そして達成できたか。",
              "以前の会議での約束のうち、まだ終わっていないものはどれか。",
              "誰が決めるのか、その人と最近会議をしたか。"
            ]
          }
        ],
        "curahold": "更新をオンにすると、更新プレイブックが各更新日の90日前にステップをタスクとして作成します。各タスクには担当者と、更新日から逆算した期日が付きます。"
      },
      {
        "slug": "business-review-agenda",
        "kind": "template",
        "name": "ビジネスレビュー（QBR）の議題テンプレート",
        "seo": [
          "ビジネスレビュー（QBR）の議題テンプレート | Curahold",
          "1時間で行うビジネスレビューの議題です。目標に対する結果、変化したこと、未完了の約束、次の四半期の計画、明確な次のステップまでを網羅します。"
        ],
        "lead": "四半期ごとのビジネスレビューは、顧客には価値の証拠を、双方には同じ次のステップを残すものです。この議題は1時間に収まります。",
        "body": [
          {
            "h": "議題（60分）"
          },
          {
            "ol": [
              "5分：会議の目的と参加者の確認。",
              "15分：前四半期に設定した目標に対する結果。",
              "10分：顧客側で変わったこと（人、優先順位、予算）。",
              "10分：未対応の依頼と約束、それぞれの状況。",
              "15分：次の四半期の計画。",
              "5分：担当者と期日を決めた次のステップ。"
            ]
          },
          {
            "h": "会議のあとで"
          },
          {
            "p": "当日中に短いまとめを送ります。合意したこと、担当者と期日つきの次のステップ、次回レビューの日程です。"
          }
        ],
        "curahold": "レビューを顧客の会議として記録し、次のステップを書いて保存すると、それぞれが担当者と期日つきのタスクになります。顧客のポータルで共有することもできます。"
      },
      {
        "slug": "customer-health-score",
        "kind": "term",
        "name": "顧客ヘルススコア",
        "seo": [
          "顧客ヘルススコアとは？わかりやすい解説 | Curahold",
          "顧客ヘルススコアは、顧客との関係の状態を一つの数字にまとめたものです。最後の接点、遅れている作業、未解決の課題などのシグナルから算出します。"
        ],
        "lead": "顧客ヘルススコアとは、顧客との関係がどれだけうまくいっているかを表す一つの数字で、多くの場合0〜100で示します。",
        "body": [
          {
            "p": "チームが把握できるシグナルから算出します。最後に顧客と話したのはいつか、約束した作業が遅れていないか、顧客側に強い推進者がいるか、未解決の障害やサポート依頼があるか。シグナルごとに点数が加算・減算されます。"
          },
          {
            "h": "なぜ重要か"
          },
          {
            "p": "数十社の顧客を抱えると、反応が薄れていく一社が埋もれてしまいます。スコアで並べれば、更新が危うい顧客に真っ先に目が向きます。"
          },
          {
            "h": "よいスコアの条件"
          },
          {
            "ul": [
              "理由がわかる：どのシグナルで変わったのか誰でも確認できる。",
              "チームが信頼でき、行動につなげられるシグナルを使う。",
              "一度見て終わりではなく、時間を追って見る。"
            ]
          }
        ],
        "curahold": "すべての顧客に、自社で決めたルールから算出する0〜100のスコアが付き、その理由と過去30日の推移を確認できます。"
      },
      {
        "slug": "churn",
        "kind": "term",
        "name": "解約（チャーン）",
        "seo": [
          "解約（チャーン）とは？定義と早期のサイン | Curahold",
          "チャーンとは、一定期間に失った顧客や売上の割合です。何を解約と数えるか、どう測るか、その前に現れる早期のサインについて、わかりやすく解説します。"
        ],
        "lead": "チャーンとは、顧客が購入をやめること、つまり解約や更新しないことです。チャーン率は、一定期間に失った顧客や売上の割合を指します。",
        "body": [
          {
            "h": "測り方"
          },
          {
            "ul": [
              "顧客チャーン：期間中に失った顧客数を、期首の顧客数で割ったもの。",
              "売上チャーン：解約やダウングレードで失った継続売上を、期首の継続売上で割ったもの。"
            ]
          },
          {
            "h": "先に現れるサイン"
          },
          {
            "p": "解約が前触れなく起きることはほとんどありません。連絡が途絶えがちになる、約束した作業が遅れる、推進者が異動する、サポート依頼が積み上がる。こうしたサインを追えば、更新日より前に手を打てます。"
          }
        ],
        "curahold": "こうしたシグナルは各顧客のヘルススコアに反映されるため、反応が薄れている顧客が更新のずっと前に上位に表示されます。"
      },
      {
        "slug": "contract-renewal",
        "kind": "term",
        "name": "契約更新",
        "seo": [
          "契約更新とは？進め方とスケジュール | Curahold",
          "契約更新は、顧客との契約を新しい期間へ延長することです。いつ始めるか、更新プロセスの流れ、そしてなぜ期日の数か月前から始めるのかを解説します。"
        ],
        "lead": "契約更新とは、顧客との契約を次の期間へ延長することです。シートの追加、プランの変更、新しい価格など、変更を伴うこともよくあります。",
        "body": [
          {
            "h": "いつ始めるか"
          },
          {
            "p": "年間契約の場合、準備はおよそ90日前に始めるのが一般的です。提供した価値の振り返り、意思決定者との面談、見積もりの送付、質問への回答を、慌てずに進められます。"
          },
          {
            "h": "よくある失敗"
          },
          {
            "ul": [
              "期日に気づくのが遅すぎる。",
              "契約に署名した人がすでに異動・退職している。",
              "年間を通じた約束がまだ終わっていない。"
            ]
          }
        ],
        "curahold": "更新ごとに、90日前から担当者と期日つきのタスクとしてプレイブックを開始し、パイプラインには更新の商談も作成できます。"
      },
      {
        "slug": "customer-portal",
        "kind": "term",
        "name": "顧客ポータル",
        "seo": [
          "顧客ポータルとは？定義と使い方 | Curahold",
          "顧客ポータルは、顧客が共有された作業を確認し、依頼を出し、返信を読める専用の場所です。メールのやり取りを何度も追いかける必要は、もうありません。"
        ],
        "lead": "顧客ポータルとは、顧客が自分と共有された作業を確認し、依頼を出し、チームからの返信を読める専用のウェブページです。",
        "body": [
          {
            "h": "チームが使う理由"
          },
          {
            "p": "状況報告のメールが不要になります。顧客は好きなときに進み具合を確認でき、依頼はばらばらのメールではなく一か所に集まります。"
          },
          {
            "h": "共有するもの"
          },
          {
            "ul": [
              "オンボーディングの手順と日程。",
              "会議で約束したタスク。",
              "依頼への回答。"
            ]
          }
        ],
        "curahold": "顧客はメールのリンクからログインし、共有した内容だけを確認できます。顧客が出した依頼はチームのボードに届きます。"
      }
    ]
  },
  ko: {
    "title": "고객 팀을 위한 템플릿과 용어집",
    "lead": "고객을 지키는 일에 바로 쓸 수 있는 템플릿과 쉬운 용어 풀이입니다. 갱신, 비즈니스 리뷰, 헬스 스코어, 이탈을 다룹니다.",
    "seo": [
      "고객 성공 템플릿과 용어집 | Curahold",
      "갱신 플레이북과 비즈니스 리뷰 무료 템플릿, 그리고 헬스 스코어, 고객 이탈, 계약 갱신, 고객 포털을 쉽게 풀어 쓴 설명을 모았습니다."
    ],
    "templates": "템플릿",
    "glossary": "용어집",
    "inCurahold": "Curahold에서는",
    "nav": [
      "템플릿과 용어집",
      "갱신 단계, 리뷰 안건, 쉬운 용어 풀이."
    ],
    "items": [
      {
        "slug": "renewal-playbook",
        "kind": "template",
        "name": "갱신 플레이북 템플릿",
        "seo": [
          "갱신 플레이북 템플릿: 90일 전부터의 단계 | Curahold",
          "그대로 쓸 수 있는 갱신 플레이북입니다. 계약 갱신 90일, 75일, 60일, 30일 전에 할 일, 단계별 담당자, 갱신 미팅 전에 확인할 점을 담았습니다."
        ],
        "lead": "갱신은 당일이 아니라 그 전 석 달 동안 결정됩니다. 아래 단계를 복사해 단계마다 담당자를 정하고, 갱신일부터 거꾸로 날짜를 계산하세요.",
        "body": [
          {
            "h": "단계"
          },
          {
            "ol": [
              "90일 전: 사용 현황, 열린 요청, 헬스 스코어를 확인하고 걱정되는 점을 적어 둡니다.",
              "75일 전: 의사 결정자와 실무 담당자와의 갱신 미팅을 잡습니다.",
              "60일 전: 좌석 수나 플랜 변경을 반영한 갱신 견적을 보냅니다.",
              "30일 전: 견적을 후속 확인하고 남은 질문을 서면으로 정리합니다.",
              "갱신일: 서명된 갱신을 확인하고 합의 내용을 기록합니다."
            ]
          },
          {
            "h": "갱신 미팅 전에"
          },
          {
            "ul": [
              "고객은 올해 무엇을 이루고 싶었고, 이루었나요?",
              "이전 미팅에서 한 약속 중 아직 남은 것은 무엇인가요?",
              "누가 결정하며, 최근 함께 미팅을 했나요?"
            ]
          }
        ],
        "curahold": "갱신을 켜면 갱신 플레이북이 갱신일 90일 전에 단계를 작업으로 만듭니다. 각 작업에는 담당자와 갱신일에서 거꾸로 계산한 기한이 붙습니다."
      },
      {
        "slug": "business-review-agenda",
        "kind": "template",
        "name": "비즈니스 리뷰(QBR) 안건 템플릿",
        "seo": [
          "비즈니스 리뷰(QBR) 안건 템플릿 | Curahold",
          "한 시간짜리 비즈니스 리뷰 안건입니다. 목표 대비 결과, 달라진 점, 남은 약속, 다음 분기 계획, 그리고 분명한 다음 단계까지 다룹니다."
        ],
        "lead": "분기 비즈니스 리뷰는 고객에게는 가치의 증거를, 양쪽에는 같은 다음 단계를 남겨야 합니다. 이 안건은 한 시간이면 충분합니다.",
        "body": [
          {
            "h": "안건(60분)"
          },
          {
            "ol": [
              "5분: 미팅의 목표와 참석자 확인.",
              "15분: 지난 분기에 정한 목표 대비 결과.",
              "10분: 고객 쪽에서 달라진 점(사람, 우선순위, 예산).",
              "10분: 열린 요청과 약속, 각각의 진행 상황.",
              "15분: 다음 분기 계획.",
              "5분: 담당자와 기한을 정한 다음 단계."
            ]
          },
          {
            "h": "미팅이 끝난 뒤"
          },
          {
            "p": "당일에 짧은 요약을 보내세요. 합의한 내용, 담당자와 기한이 있는 다음 단계, 다음 리뷰 날짜를 담으면 됩니다."
          }
        ],
        "curahold": "리뷰를 고객의 미팅으로 기록하고 다음 단계를 적어 저장하면, 각 단계가 담당자와 기한이 있는 작업이 됩니다. 고객 포털에서 공유할 수도 있습니다."
      },
      {
        "slug": "customer-health-score",
        "kind": "term",
        "name": "고객 헬스 스코어",
        "seo": [
          "고객 헬스 스코어란? 쉽게 풀어 쓴 정의 | Curahold",
          "고객 헬스 스코어는 고객 관계가 어떤 상태인지 숫자 하나로 요약합니다. 마지막 접점, 지연된 작업, 해결되지 않은 문제 같은 신호로 계산합니다."
        ],
        "lead": "고객 헬스 스코어는 고객과의 관계가 얼마나 잘 가고 있는지를 보여 주는 숫자 하나로, 보통 0~100점으로 나타냅니다.",
        "body": [
          {
            "p": "팀이 확인할 수 있는 신호로 계산합니다. 고객과 마지막으로 이야기한 때, 약속한 작업의 지연 여부, 고객 쪽 핵심 지지자의 유무, 열린 장애 요소와 지원 요청 등입니다. 신호마다 점수가 더해지거나 빠집니다."
          },
          {
            "h": "왜 중요한가"
          },
          {
            "p": "고객이 수십 곳이면 조용히 멀어지는 한 곳이 묻히기 쉽습니다. 점수로 정렬하면 갱신이 위험한 고객에게 먼저 눈이 갑니다."
          },
          {
            "h": "좋은 점수의 조건"
          },
          {
            "ul": [
              "스스로 설명한다: 어떤 신호 때문에 바뀌었는지 누구나 볼 수 있다.",
              "팀이 믿고 행동으로 옮길 수 있는 신호를 쓴다.",
              "한 번 보고 끝나지 않고 시간에 따라 추이를 본다."
            ]
          }
        ],
        "curahold": "모든 고객에게 직접 정한 규칙으로 계산한 0~100점의 점수가 붙고, 그 이유와 최근 30일의 추이를 확인할 수 있습니다."
      },
      {
        "slug": "churn",
        "kind": "term",
        "name": "고객 이탈(Churn)",
        "seo": [
          "고객 이탈(Churn)이란? 정의와 초기 신호 | Curahold",
          "이탈은 일정 기간에 잃은 고객이나 매출의 비율입니다. 무엇을 이탈로 보는지, 어떻게 측정하는지, 그 전에 나타나는 초기 신호를 설명합니다."
        ],
        "lead": "이탈은 고객이 구매를 멈추는 것, 즉 해지하거나 갱신하지 않는 것입니다. 이탈률은 일정 기간에 잃은 고객이나 매출의 비율입니다.",
        "body": [
          {
            "h": "측정 방법"
          },
          {
            "ul": [
              "고객 이탈: 기간 중 잃은 고객 수를 기간 초 고객 수로 나눈 값.",
              "매출 이탈: 해지와 다운그레이드로 잃은 반복 매출을 기간 초 반복 매출로 나눈 값."
            ]
          },
          {
            "h": "먼저 나타나는 신호"
          },
          {
            "p": "이탈은 예고 없이 오는 일이 드뭅니다. 연락이 뜸해지고, 약속한 작업이 밀리고, 지지자가 떠나고, 지원 요청이 쌓입니다. 이런 신호를 지켜보면 갱신일 전에 손을 쓸 수 있습니다."
          }
        ],
        "curahold": "이런 신호는 고객마다 헬스 스코어에 반영되어, 멀어지는 고객이 갱신 훨씬 전에 위로 올라옵니다."
      },
      {
        "slug": "contract-renewal",
        "kind": "term",
        "name": "계약 갱신",
        "seo": [
          "계약 갱신이란? 진행 과정과 일정 | Curahold",
          "계약 갱신은 고객과의 계약을 새 기간으로 연장하는 일입니다. 언제 시작하는지, 갱신 과정은 어떻게 흘러가는지, 왜 몇 달 전부터 준비하는지 설명합니다."
        ],
        "lead": "계약 갱신은 고객과의 계약을 다음 기간으로 연장하는 일입니다. 좌석 추가, 플랜 변경, 새 가격 등 변경이 함께 따르는 경우가 많습니다.",
        "body": [
          {
            "h": "언제 시작하나"
          },
          {
            "p": "연간 계약이라면 보통 약 90일 전부터 준비를 시작합니다. 그래야 제공한 가치를 돌아보고, 의사 결정자를 만나고, 견적을 보내고, 질문을 서두르지 않고 정리할 수 있습니다."
          },
          {
            "h": "흔히 생기는 문제"
          },
          {
            "ul": [
              "갱신일을 너무 늦게 알아차린다.",
              "계약에 서명한 사람이 이미 떠났다.",
              "한 해 동안 한 약속이 아직 남아 있다."
            ]
          }
        ],
        "curahold": "갱신마다 90일 전에 담당자와 기한이 있는 작업으로 플레이북을 시작하고, 파이프라인에 갱신 거래도 함께 만들 수 있습니다."
      },
      {
        "slug": "customer-portal",
        "kind": "term",
        "name": "고객 포털",
        "seo": [
          "고객 포털이란? 정의와 활용 방법 | Curahold",
          "고객 포털은 고객이 공유된 작업을 보고, 요청을 남기고, 답변을 읽는 전용 공간입니다. 흩어진 이메일 스레드를 쫓아다닐 필요가 없어집니다."
        ],
        "lead": "고객 포털은 고객이 자신과 공유된 작업을 보고, 요청을 남기고, 팀의 답변을 읽을 수 있는 전용 웹페이지입니다.",
        "body": [
          {
            "h": "팀이 쓰는 이유"
          },
          {
            "p": "상황 보고 이메일을 대신합니다. 고객은 원할 때 진행 상황을 보고, 요청은 흩어진 스레드가 아닌 한곳에 모입니다."
          },
          {
            "h": "무엇을 공유하나"
          },
          {
            "ul": [
              "온보딩 단계와 일정.",
              "미팅에서 약속한 작업.",
              "요청에 대한 답변."
            ]
          }
        ],
        "curahold": "고객은 이메일 링크로 로그인해 공유한 내용만 봅니다. 고객이 남긴 요청은 팀의 보드로 들어옵니다."
      }
    ]
  },
};

/** The hub's words in one of the site's languages. */
export const hubCopy = (locale: SiteLocale): HubCopy => HUB[locale];
