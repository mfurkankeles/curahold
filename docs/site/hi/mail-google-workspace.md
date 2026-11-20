---
title: Google Workspace के साथ आपके डोमेन पर ईमेल
section: developers
order: 10
summary: एडमिन और ऑपरेटर के लिए — DNS रिकॉर्ड (MX, SPF, DKIM, DMARC) और Google Workspace पर कंपनी का अपना मेल चलाने के लिए मेलबॉक्स प्लान।
---
# Google Workspace के साथ आपके डोमेन पर ईमेल

> एडमिन और ऑपरेटर के लिए। Google की स्क्रीन और सीमाएं बदलती रहती हैं; नीचे की वैल्यू 19 Nov 2026 तक की Google की एडमिन हेल्प से जांची गई थीं — आगे बढ़ते हुए Admin console में इनकी पुष्टि करें।

## 1. मेलबॉक्स: कम सीटें, कई पते

Workspace का भुगतान हर यूज़र के हिसाब से होता है, इसलिए यूज़र कम रखें और बाकी सब कुछ **alias** या **group** बनाएं:

| पता | यह क्या है | कैसे |
| --- | --- | --- |
| आपका अपना पता | ओनर | यूज़र (1 सीट) |
| hello@, billing@, security@, social@ | वे इनबॉक्स जिन पर लोग लिखते हैं | ओनर के alias, या group |
| support@ | साझा सपोर्ट इनबॉक्स | "collaborative inbox" चालू वाला Google Group |
| no-reply@ | प्रोडक्ट के ईमेल भेजने वाला | उस यूज़र का alias जो रिले में ऑथेंटिकेट करता है (अगली गाइड) |

कुछ भी करने से पहले हर यूज़र के लिए **2-Step Verification** चालू करें।

## 2. DNS रिकॉर्ड

इन्हें अपने DNS होस्ट पर जोड़ें (जैसे Cloudflare: DNS → Records)। `example.com` की जगह अपना डोमेन रखें।

| प्रकार | नाम | वैल्यू | क्यों |
| --- | --- | --- | --- |
| MX | `@` | `smtp.google.com`, प्राथमिकता 1 | डोमेन का मेल Gmail पर जाता है |
| TXT | `@` | `v=spf1 include:_spf.google.com ~all` | SPF: Google डोमेन के लिए भेज सकता है। सिर्फ़ एक SPF रिकॉर्ड — अगर पहले से है तो मर्ज करें |
| TXT | `google._domainkey` | Admin console से मिली की | DKIM: हर मैसेज पर हस्ताक्षर करता है |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@example.com; adkim=s; aspf=s` | DMARC: फ़ेल होने वाले मेल के साथ क्या करना है, यह पाने वालों को बताता है |

**DKIM:** Admin console → Apps → Google Workspace → Gmail → Authenticate email → Generate new record (2048-bit, selector `google`) → TXT रिकॉर्ड पब्लिश करें → console में वापस आकर **Start authentication**।

**DMARC तीन स्टेप में:** `p=none` से शुरू करें और 2–4 हफ़्ते रिपोर्ट पढ़ें; फिर `p=quarantine`; फिर `p=reject`, जब सिर्फ़ आपके अपने सेंडर दिखें। पब्लिश करने से पहले `dmarc@` पता (alias या group) बनाएं।

## 3. इसे जांचें

किसी बाहरी पते पर मैसेज भेजें, उसे खोलें, **Show original** चुनें: SPF, DKIM और DMARC तीनों में **PASS** होना चाहिए। Google का Check MX टूल (toolbox) रिकॉर्ड जांचता है।

## 4. बड़ी मात्रा में भेजने के नियम

Gmail और दूसरे बड़े मेलबॉक्स प्रोवाइडर ज़्यादा भेजने वाले हर व्यक्ति से मांगते हैं: SPF **और** DKIM **और** DMARC, मार्केटिंग मेल में एक-क्लिक अनसब्सक्राइब, और स्पैम शिकायत की दर 0.3% से काफ़ी नीचे। मार्केटिंग मेल कभी निजी मेलबॉक्स से न भेजें; मार्केटिंग के लिए पाने वाले की अनुमति चाहिए (प्राइवेसी नोटिस देखें)।
