# CISD Journal Desktop — مرحلة التطوير

تطبيق Electron حديث لنظام Windows. يراقب ملف `HigherTF_Signals.csv` من JForex فقط، ولا يتصل بمنصات التداول لتنفيذ أو تعديل أي أمر.

## الميزات الموجودة الآن
- واجهة عربية RTL احترافية: Dashboard، Focus Mode، XP، Streak، Checklists، Notes، ومراجعة أسبوعية.
- مراقبة CSV كل ثانيتين وإضافة الإشارات الجديدة إلى الواجهة.
- حفظ قرارات الإشارة والمهام والملاحظات محلياً.
- اختيار مسار ملف JForex من التطبيق.
- اختيار اختصار FundingPips MT5 وFundedNext MT5 محلياً، ثم فتحهما من التطبيق. لا تنفيذ تداول.
- مشروع GitHub Actions يبني ملف Windows EXE محمولاً عند رفعه إلى Repository.

## إنشاء EXE من GitHub (دون تثبيت أدوات برمجة على Windows)
1. أنشئ Repository خاصاً جديداً في GitHub باسم `cisd-journal`.
2. ارفع محتويات هذا المجلد إلى الـRepository، وليس ملف ZIP بداخله.
3. افتح تبويب **Actions** في GitHub واختر `Build CISD Journal for Windows`.
4. اضغط **Run workflow**.
5. بعد اكتمال البناء، نزّل Artifact باسم `CISD-Journal-Windows`.
6. الملف داخله هو `CISD Journal.exe`؛ انسخه إلى Documents أو Desktop وشغّله.

## التحديثات القادمة
- استيراد تقرير MT5 الأصلي وتحليل النتائج الفعلية.
- نسخ احتياطي واستعادة محليان.
- صور الشارت لكل إشارة وصفقة.
- تحليلات جلسة/سوق/سبب تفويت.
