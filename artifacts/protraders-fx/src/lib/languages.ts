export const languageNames = {
  en: "English", sw: "Kiswahili", af: "Afrikaans", zu: "isiZulu",
  ha: "Hausa", ar: "العربية", pt: "Português", es: "Español",
  hi: "हिन्दी", id: "Bahasa Indonesia", ur: "اردو", fil: "Filipino",
  th: "ไทย", de: "Deutsch", fr: "Français", it: "Italiano", hr: "Hrvatski", tn: "Setswana",
} as const;
export type Language = keyof typeof languageNames;
export const translationKeys = [
  "Join workspace", "Create account", "Enter workspace", "Trade like a pro",
  "Dashboard", "Bulk Trader", "Manual Trader", "Analysis Tools", "Free Bots",
  "Deriv Pro Bots", "Owner Activity", "Support", "Bot Builder", "Quick Bot",
  "Copy Trader", "Reports", "Account", "Get Started", "LIVE MARKET SNAPSHOT",
  "Scan live context", "Set the contract", "Read the settlement",
] as const;
export type TranslationKey = typeof translationKeys[number];

// Keep trading identifiers and provider errors untouched. These are presentation labels only.
export const translations: Record<Language, readonly string[]> = {
  en: translationKeys,
  sw: ["Jiunge na eneo la biashara","Fungua akaunti","Ingia eneo la biashara","Fanya biashara kama mtaalamu","Dashibodi","Biashara nyingi","Biashara ya mkono","Zana za uchambuzi","Roboti za bure","Roboti za Deriv Pro","Shughuli za mmiliki","Msaada","Unda roboti","Roboti ya haraka","Nakili biashara","Ripoti","Akaunti","Anza","MUHTASARI WA SOKO MOJA KWA MOJA","Chunguza hali ya soko","Weka mkataba","Kagua matokeo"],
  af: ["Sluit by werkruimte aan","Skep rekening","Betree werkruimte","Handel soos 'n kenner","Kontroleskerm","Grootmaathandel","Handmatige handel","Ontledingshulpmiddels","Gratis bots","Deriv Pro-bots","Eienaaraktiwiteit","Ondersteuning","Botbouer","Vinnige bot","Kopieerhandel","Verslae","Rekening","Begin","LEWENDIGE MARKOORSIG","Bekyk die mark","Stel die kontrak","Hersien die resultaat"],
  zu: ["Joyina indawo yokuhweba","Dala i-akhawunti","Ngena endaweni yokuhweba","Hweba njengochwepheshe","Ideshibhodi","Ukuhweba okuningi","Ukuhweba ngesandla","Amathuluzi okuhlaziya","Amarobhothi amahhala","Amarobhothi e-Deriv Pro","Umsebenzi womnikazi","Usizo","Umakhi wamarobhothi","Irobhothi elisheshayo","Kopisha ukuhweba","Imibiko","I-akhawunti","Qala","ISIFINYEZO SEMAKETHE EBHUKHOMA","Bheka imakethe","Setha inkontileka","Buyekeza umphumela"],
  ha: ["Shiga wurin ciniki","Buɗe asusu","Shiga wurin aiki","Yi ciniki kamar ƙwararre","Allon bayani","Ciniki da yawa","Ciniki da hannu","Kayan nazari","Bot kyauta","Bot na Deriv Pro","Ayyukan mai shafi","Taimako","Gina bot","Bot mai sauri","Kwafin ciniki","Rahotanni","Asusu","Fara","BAYANIN KASUWA KAI TSAYE","Duba kasuwa","Saita kwangila","Duba sakamako"],
  ar: ["انضم إلى مساحة التداول","إنشاء حساب","دخول مساحة التداول","تداول كالمحترفين","لوحة التحكم","التداول المتعدد","التداول اليدوي","أدوات التحليل","روبوتات مجانية","روبوتات Deriv Pro","نشاط المالك","الدعم","منشئ الروبوتات","روبوت سريع","نسخ التداول","التقارير","الحساب","ابدأ","لمحة مباشرة عن السوق","راقب السوق","حدد العقد","راجع النتيجة"],
  pt: ["Entrar no espaço de negociação","Criar conta","Acessar espaço de negociação","Negocie como um profissional","Painel","Negociação em lote","Negociação manual","Ferramentas de análise","Robôs gratuitos","Robôs Deriv Pro","Atividade do proprietário","Suporte","Criador de robôs","Robô rápido","Copiar negociações","Relatórios","Conta","Começar","RESUMO DO MERCADO AO VIVO","Observe o mercado","Configure o contrato","Confira o resultado"],
  es: ["Unirse al espacio de trading","Crear cuenta","Entrar al espacio de trading","Opera como un profesional","Panel","Trading por lotes","Trading manual","Herramientas de análisis","Bots gratuitos","Bots Deriv Pro","Actividad del propietario","Soporte","Creador de bots","Bot rápido","Copiar operaciones","Informes","Cuenta","Comenzar","RESUMEN DEL MERCADO EN VIVO","Observa el mercado","Configura el contrato","Revisa el resultado"],
  hi: ["ट्रेडिंग कार्यक्षेत्र से जुड़ें","खाता बनाएँ","ट्रेडिंग कार्यक्षेत्र खोलें","पेशेवर की तरह ट्रेड करें","डैशबोर्ड","एक साथ कई ट्रेड","मैनुअल ट्रेडिंग","विश्लेषण उपकरण","निःशुल्क बॉट","Deriv Pro बॉट","मालिक की गतिविधि","सहायता","बॉट निर्माता","त्वरित बॉट","कॉपी ट्रेडिंग","रिपोर्ट","खाता","शुरू करें","लाइव बाज़ार की झलक","बाज़ार देखें","अनुबंध सेट करें","परिणाम देखें"],
  id: ["Gabung ruang trading","Buat akun","Masuk ruang trading","Trading seperti profesional","Dasbor","Trading massal","Trading manual","Alat analisis","Bot gratis","Bot Deriv Pro","Aktivitas pemilik","Bantuan","Pembuat bot","Bot cepat","Salin trading","Laporan","Akun","Mulai","RINGKASAN PASAR LANGSUNG","Amati pasar","Atur kontrak","Tinjau hasil"],
  ur: ["ٹریڈنگ ورک اسپیس میں شامل ہوں","اکاؤنٹ بنائیں","ٹریڈنگ ورک اسپیس کھولیں","ماہر کی طرح ٹریڈ کریں","ڈیش بورڈ","متعدد ٹریڈز","دستی ٹریڈنگ","تجزیاتی ٹولز","مفت بوٹس","Deriv Pro بوٹس","مالک کی سرگرمی","مدد","بوٹ بلڈر","فوری بوٹ","کاپی ٹریڈنگ","رپورٹس","اکاؤنٹ","شروع کریں","براہ راست مارکیٹ کا خلاصہ","مارکیٹ دیکھیں","معاہدہ طے کریں","نتیجہ دیکھیں"],
  fil: ["Sumali sa workspace","Gumawa ng account","Pumasok sa workspace","Mag-trade tulad ng propesyonal","Dashboard","Maramihang trading","Manwal na trading","Mga tool sa pagsusuri","Libreng bot","Deriv Pro bots","Aktibidad ng may-ari","Suporta","Tagagawa ng bot","Mabilis na bot","Kopyahin ang trade","Mga ulat","Account","Magsimula","BUOD NG LIVE NA MERKADO","Obserbahan ang merkado","Itakda ang kontrata","Suriin ang resulta"],
  th: ["เข้าร่วมพื้นที่เทรด","สร้างบัญชี","เข้าสู่พื้นที่เทรด","เทรดอย่างมืออาชีพ","แดชบอร์ด","เทรดหลายรายการ","เทรดด้วยตนเอง","เครื่องมือวิเคราะห์","บอตฟรี","บอต Deriv Pro","กิจกรรมเจ้าของ","ช่วยเหลือ","สร้างบอต","บอตด่วน","คัดลอกการเทรด","รายงาน","บัญชี","เริ่มต้น","ภาพรวมตลาดสด","ติดตามตลาด","ตั้งค่าสัญญา","ตรวจสอบผลลัพธ์"],
  de: ["Arbeitsbereich beitreten","Konto erstellen","Arbeitsbereich öffnen","Handeln wie ein Profi","Übersicht","Sammelhandel","Manueller Handel","Analysewerkzeuge","Kostenlose Bots","Deriv Pro Bots","Inhaberaktivität","Support","Bot-Builder","Schneller Bot","Copy-Trading","Berichte","Konto","Loslegen","LIVE-MARKTÜBERBLICK","Markt beobachten","Kontrakt einrichten","Ergebnis prüfen"],
  fr: ["Rejoindre l’espace de trading","Créer un compte","Accéder à l’espace de trading","Tradez comme un professionnel","Tableau de bord","Trading par lots","Trading manuel","Outils d’analyse","Bots gratuits","Bots Deriv Pro","Activité du propriétaire","Assistance","Créateur de bots","Bot rapide","Copie de trades","Rapports","Compte","Commencer","APERÇU DU MARCHÉ EN DIRECT","Observer le marché","Configurer le contrat","Vérifier le résultat"],
  it: ["Unisciti all’area di trading","Crea account","Accedi all’area di trading","Fai trading come un professionista","Pannello","Trading multiplo","Trading manuale","Strumenti di analisi","Bot gratuiti","Bot Deriv Pro","Attività del proprietario","Assistenza","Creatore di bot","Bot rapido","Copia operazioni","Report","Account","Inizia","PANORAMICA DEL MERCATO IN TEMPO REALE","Osserva il mercato","Imposta il contratto","Controlla il risultato"],
  hr: ["Pridruži se radnom prostoru","Izradi račun","Otvori radni prostor","Trguj kao profesionalac","Nadzorna ploča","Skupno trgovanje","Ručno trgovanje","Alati za analizu","Besplatni botovi","Deriv Pro botovi","Aktivnost vlasnika","Podrška","Izrada botova","Brzi bot","Kopiranje trgovanja","Izvješća","Račun","Započni","PREGLED TRŽIŠTA UŽIVO","Promatraj tržište","Postavi ugovor","Pregledaj rezultat"],
  tn: ["Tsena mo lefelong la kgwebo","Bula akhaonto","Bula lefelo la kgwebo","Gweba jaaka moitseanape","Letlapa la tshedimosetso","Kgwebo e ntsi","Kgwebo ka seatla","Didirisiwa tsa tshekatsheko","Diboto tsa mahala","Diboto tsa Deriv Pro","Ditiro tsa mong","Thuso","Moagi wa diboto","Boto e e bonako","Kopisa kgwebo","Dipego","Akhaonto","Simolola","TSHOBOKANYO YA MAREKE","Lebelela mmaraka","Baakanya konteraka","Sekaseka dipholo"],
};

export const heroDescriptions: Record<Language, string> = {
  en: "See live Deriv quotes, choose contract terms, and review settled trade details—all in your ProTraders FX workspace.",
  sw: "Tazama bei za moja kwa moja za Deriv, chagua masharti ya mkataba na kagua matokeo ya biashara katika ProTraders FX.",
  af: "Bekyk regstreekse Deriv-pryse, kies kontrakvoorwaardes en hersien afgehandelde transaksies in ProTraders FX.",
  zu: "Bona amanani e-Deriv abukhoma, khetha imigomo yenkontileka bese ubuyekeza ukuhweba okuqediwe ku-ProTraders FX.",
  ha: "Duba farashin Deriv kai tsaye, zaɓi sharuɗɗan kwangila, sannan duba sakamakon ciniki a ProTraders FX.",
  ar: "اطّلع على أسعار Deriv المباشرة، واختر شروط العقد، وراجع تفاصيل الصفقات المكتملة في مساحة ProTraders FX.",
  pt: "Veja cotações Deriv ao vivo, escolha os termos do contrato e confira os detalhes das negociações concluídas no ProTraders FX.",
  es: "Consulta cotizaciones de Deriv en vivo, elige las condiciones del contrato y revisa tus operaciones liquidadas en ProTraders FX.",
  hi: "ProTraders FX में Deriv के लाइव भाव देखें, अनुबंध की शर्तें चुनें और पूरे हो चुके ट्रेड की जानकारी देखें।",
  id: "Lihat harga Deriv langsung, pilih ketentuan kontrak, dan tinjau detail trading yang selesai di ProTraders FX.",
  ur: "ProTraders FX میں Deriv کی براہ راست قیمتیں دیکھیں، معاہدے کی شرائط چنیں اور مکمل ٹریڈز کی تفصیلات دیکھیں۔",
  fil: "Tingnan ang live na presyo sa Deriv, piliin ang mga tuntunin ng kontrata, at suriin ang natapos na mga trade sa ProTraders FX.",
  th: "ดูราคา Deriv แบบสด เลือกเงื่อนไขสัญญา และตรวจสอบรายละเอียดการเทรดที่เสร็จสิ้นใน ProTraders FX",
  de: "Sehen Sie Live-Kurse von Deriv, wählen Sie Kontraktbedingungen und prüfen Sie abgeschlossene Trades in ProTraders FX.",
  fr: "Consultez les cours Deriv en direct, choisissez les conditions du contrat et vérifiez vos trades clôturés dans ProTraders FX.",
  it: "Visualizza le quotazioni Deriv in tempo reale, scegli le condizioni del contratto e controlla le operazioni concluse in ProTraders FX.",
  hr: "Pratite Deriv cijene uživo, odaberite uvjete ugovora i pregledajte završene transakcije u ProTraders FX.",
  tn: "Bona ditlhwatlhwa tsa Deriv, tlhopha melawana ya konteraka mme o sekaseke dikgwebo tse di fedileng mo ProTraders FX.",
};

export const arabCountries = [
  "DZ", "BH", "KM", "DJ", "EG", "IQ", "JO", "KW", "LB", "LY", "MR",
  "MA", "OM", "PS", "QA", "SA", "SO", "SD", "SY", "TN", "AE", "YE",
] as const;
export const countries = [
  "KE","ZA","NG","GH","BW","BR","CO","MX","CL","CR","AR","IN","ID","PK","PH","TH","NZ","GB","DE","FR","IT","ES","HR",
  ...arabCountries,
] as const;
export const countryLanguages: Record<string, Language> = {
  KE:"sw", ZA:"en", NG:"en", GH:"en", EG:"ar", BW:"tn", BR:"pt", CO:"es", MX:"es", CL:"es", CR:"es", AR:"es",
  IN:"hi", ID:"id", PK:"ur", PH:"fil", TH:"th", NZ:"en", GB:"en", DE:"de", FR:"fr", IT:"it", ES:"es", HR:"hr",
  DZ:"ar", BH:"ar", KM:"ar", DJ:"ar", IQ:"ar", JO:"ar", KW:"ar", LB:"ar", LY:"ar", MR:"ar",
  MA:"ar", OM:"ar", PS:"ar", QA:"ar", SA:"ar", SO:"ar", SD:"ar", SY:"ar", TN:"ar", AE:"ar", YE:"ar",
};
export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && Object.hasOwn(languageNames, value);
}
export function detectBrowserLanguage(locales: readonly string[]): Language | null {
  for (const locale of locales) {
    const language = locale.toLowerCase().split(/[-_]/)[0];
    const normalized = language === "tl" ? "fil" : language;
    if (isLanguage(normalized)) return normalized;
  }
  return null;
}
export function translate(language: Language, key: string): string {
  const index = translationKeys.indexOf(key as TranslationKey);
  return index < 0 ? key : translations[language][index] ?? key;
}
