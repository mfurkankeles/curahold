---
title: Sambungan dan CRM
section: help
order: 8
summary: Slack, Teams dan Google Chat; penyegerakan dengan Salesforce, HubSpot dan hamparan.
---
# Sambungan dan CRM

Curahold berfungsi bersama alat yang sudah digunakan oleh pasukan anda. Urus sambungan dalam Tetapan → Sambungan dan Tetapan → Sumber data.

## Aplikasi sembang

Dengan Slack, Microsoft Teams atau Google Chat disambungkan, pemberitahuan sampai kepada orang sebagai mesej terus, dan mereka boleh menyelesaikan atau membuka semula tugasan terus daripada mesej itu.

## CRM dan hamparan

Segerakkan pelanggan, kenalan dan peluang dengan Salesforce, HubSpot, Microsoft Dynamics, Pipedrive, Zoho, Bitrix24, Freshsales, Zendesk Sell, Google Sheets dan Excel. Buka **Tetapan → CRM dan hamparan** dan pilih **Sambung**.

1. **Log masuk.** Anda dibawa ke halaman log masuk CRM itu sendiri dan meluluskan apa yang boleh dibaca dan ditulis oleh Curahold. Tiada kata laluan pernah ditaip ke dalam Curahold. (Bitrix24, Freshsales dan Zendesk Sell menggunakan kunci; lihat di bawah.)
2. **Pilih apa yang dibawa masuk.** Tandakan objek yang anda perlukan dan nyatakan apa setiap satu dalam Curahold: pelanggan, kenalan, peluang, jenis rekod anda sendiri, atau tugasan pada papan.
3. **Padankan medan.** Curahold mencadangkan padanan bagi setiap medan; ubah mana-mana daripadanya, dan pilih bagi setiap medan sama ada ia hanya masuk atau dikekalkan sama di kedua-dua pihak.
4. **Semak dan mula.** Pratonton menunjukkan berapa banyak yang akan ditambah dan dikemas kini sebelum apa-apa berubah.

Selepas itu, penyegerakan berjalan dengan sendirinya setiap jam, dan perubahan yang dibuat dalam Curahold ditulis ke CRM dengan serta-merta. Apa-apa yang tidak dapat disegerakkan disenaraikan bersama sebabnya dan boleh dicuba semula. Apabila perkara yang sama berubah di kedua-dua pihak, perubahan yang lebih baharu menang; anda boleh menjadikan CRM atau Curahold sentiasa menang (tab Tetapan sambungan itu).

Menyambung memerlukan kebenaran untuk mengurus sambungan. Orang dipadankan mengikut e-mel, jadi pemilik setiap pelanggan dalam CRM menjadi pemiliknya dalam Curahold.

## Salesforce

Dibawa masuk: akaun, kenalan, peluang, tugasan dan objek tersuai anda. Tandakan **Kotak pasir (sandbox)** sebelum menyambung untuk menggunakan org ujian.

**Kali pertama, pentadbir Salesforce memasang Curahold.** Salesforce menyekat aplikasi yang tidak dipasang dalam org anda, jadi sebelum log masuk pertama, pentadbir membuka halaman pemasangan (pautan dipaparkan apabila anda memilih Sambung) dan meluluskannya. Pakej itu tidak menambah kod, medan atau objek: ia hanya membolehkan orang dalam org anda meluluskan Curahold. Ia boleh dibuang pada bila-bila masa daripada Setup → Installed Packages, dan Curahold kehilangan akses dengan serta-merta. Jika Salesforce menjawab bahawa aplikasi itu tidak dibenarkan, langkah ini belum dilakukan. Pengguna yang menyambung memerlukan akses API dalam Salesforce (termasuk dalam Enterprise dan ke atas, tambahan dalam Professional).

## HubSpot

Dibawa masuk: syarikat, kenalan, urus niaga, tiket, tugasan dan objek tersuai. HubSpot bertanya akaun mana yang hendak disambungkan dan menyenaraikan apa yang boleh dibaca dan ditulis oleh Curahold; kenalan dan urus niaga hanya diminta jika pelan HubSpot anda memilikinya.

## Microsoft Dynamics 365

Dibawa masuk: akaun, kenalan, peluang, kes, tugasan dan jadual tersuai. Sebelum log masuk, anda memberikan alamat organisasi anda (kelihatan seperti `https://yourcompany.crm4.dynamics.com`). Jika Microsoft menunjukkan "Need admin approval", pentadbir Microsoft 365 perlu meluluskan Curahold untuk organisasi anda sekali.

## Pipedrive

Dibawa masuk: organisasi, orang, urus niaga dan aktiviti. Medan tersuai dipadankan seperti medan standard.

## Zoho CRM

Dibawa masuk: akaun, kenalan, urus niaga, kes, tugasan dan modul tersuai. Curahold mencari pusat data Zoho anda (US, EU, India, Australia…) dengan sendirinya.

## Bitrix24, Freshsales dan Zendesk Sell

Ketiga-tiganya disambungkan dengan kunci yang anda cipta dalam CRM itu sendiri, jadi tiada halaman log masuk dan tiada apa-apa yang perlu diluluskan oleh sesiapa. Curahold menyemak kunci sebaik sahaja anda menampalnya, menyimpannya secara tersulit, dan tidak pernah menunjukkannya lagi; buang sambungan dan kunci itu hilang. Selepas itu semuanya sama seperti CRM lain: anda memilih apa yang dibawa masuk, memadankan medan, dan perubahan bergerak dua hala.

| CRM | Apa yang perlu ditampal | Di mana mencarinya | Dibawa masuk |
| --- | --- | --- | --- |
| Bitrix24 | alamat webhook masuk | Developer resources → Other → Inbound webhook; berikan kebenaran CRM, dan Users supaya pemilik boleh dipadankan | syarikat, kenalan, urus niaga |
| Freshsales | alamat anda dan kunci API | gambar profil anda → Settings → API settings | akaun, kenalan, urus niaga |
| Zendesk Sell | token akses | Settings → Integrations → OAuth → Access tokens | syarikat, orang, urus niaga |

Perlu diketahui:

- **Kunci bertindak sebagai orang yang menciptanya.** Curahold melihat apa yang dilihat oleh orang itu dalam CRM. Cipta kunci dengan akaun yang boleh melihat setiap pelanggan yang anda mahu di sini.
- **E-mel, telefon dan alamat web dalam Bitrix24** ialah senarai di sana. Curahold membaca yang pertama dan mengisinya apabila ia mencipta kenalan atau syarikat baharu, tetapi tidak pernah menulis semula senarai itu selepas itu.
- **Freshsales dibaca melalui paparan "All accounts", "All contacts" dan "All deals".** Jika salah satu daripadanya telah dinamakan semula atau dibuang, senarai itu tidak dibaca dan larian memaklumkannya, bukannya membawa sebahagian sahaja.
- **Urus niaga dalam Zendesk Sell memerlukan syarikat.** Urus niaga yang dibuat dalam Curahold dicipta di sana di bawah syarikat pelanggan.
- Penyambung ini baharu. Jika sesuatu tidak dibawa masuk seperti yang anda jangkakan, tulis kepada kami daripada Bantuan dalam produk.

## Google Sheets dan Excel

Hamparan ialah cara paling mudah untuk membawa masuk data, dan ia berfungsi untuk mana-mana alat yang boleh mengeksport hamparan. Sambungkan Google Sheet, atau fail Excel dalam OneDrive atau SharePoint, tab demi tab; setiap tab boleh menjadi pelanggan, kenalan atau jenis rekod anda sendiri. Pilih lajur yang mengenal pasti sesuatu baris, supaya baris yang berubah mengemas kini pelanggan yang sama dan bukannya menambah pelanggan kedua.

## Alat sokongan

Zendesk, Freshdesk, Intercom dan Jira Service Management disambungkan dengan alamat dan kunci API; tiket masuk di bawah pelanggan yang betul. Kes Salesforce dan Dynamics juga boleh dipetakan sebagai tiket sokongan. Butiran: [Tiket sokongan](/docs/ms/support-tickets/).

## Apabila penyegerakan berhenti {#sync-stops}

Tab **Status** sambungan menyatakan apa yang berlaku dengan kata-kata mudah, dengan mesej perkhidmatan itu sendiri di bawahnya.

| Apa yang dinyatakan | Apa yang perlu dilakukan |
| --- | --- |
| Perkhidmatan meminta Curahold memperlahankan | Tiada apa-apa. Kedudukan anda disimpan dan larian setiap jam seterusnya menyambung. |
| Ia tidak lagi menerima log masuk atau kunci Curahold | Sambung semula, di bawah. |
| Akaun itu tidak boleh membaca atau mengubah sesuatu | Minta pentadbir alat itu memberi akaun itu akses, kemudian pilih **Segerakkan sekarang**. |
| Ia tidak dapat dicapai | Tiada apa-apa. Curahold mencuba semula pada larian setiap jam seterusnya. |

Untuk menyambung semula:

1. Buka **Tetapan → CRM dan hamparan**.
2. Klik sambungan yang ditandakan **Perlu perhatian**.
3. Klik **Sambung semula** di bahagian atas halaman.
4. Log masuk ke akaun yang sama seperti sebelum ini (atau tampal kunci baharu) dan luluskan.
5. Klik **Segerakkan sekarang**. Medan yang telah anda padankan kekal seperti biasa.

Untuk membuang sambungan, bukanya, klik **⋯** dan pilih **Buang**. Penyegerakan berhenti; pelanggan, kenalan dan peluang yang telah dibawa masuk kekal dalam Curahold dan tiada apa-apa dipadam dalam alat lain itu. Bagi program perakaunan, baki, invois dan bayaran yang dibaca daripadanya dibuang dari halaman pelanggan.

## Alat anda sendiri

Untuk menyambungkan sistem lain, lihat [kunci API](/docs/ms/api-keys/), [webhook](/docs/ms/webhooks/) atau [pembantu AI](/docs/ms/ai-assistants/).
