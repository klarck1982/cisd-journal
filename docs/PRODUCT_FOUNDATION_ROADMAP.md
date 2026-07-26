# CISD Journal — Product Foundation Roadmap

## 1) المنتج الذي نبنيه
CISD Journal ليس مجرد trading journal عام.
الهدف هو بناء **Trading Discipline OS** لمتداول يومي يعتمد على إشارات CISD القادمة من ملف CSV على JForex، ويحتاج إلى:

- مراقبة الإشارات فور ظهورها.
- تسجيل هل دخل الصفقة أم لم يدخلها.
- توثيق أسباب التردد والخوف وعدم التنفيذ.
- مقارنة نتائج الصفقات المنفذة مع الفرص الضائعة.
- مراقبة حسابات الـ prop firms والتقدم في الـ challenge.
- متابعة الأخبار عالية التأثير والجلسات وتوقيت نيويورك.

## 2) المستخدم المثالي
متداول يومي:
- يستخدم CISD أو workflow مشابه.
- يهتم بالأخبار والتوقيت والجلسات.
- يتابع أكثر من حساب prop firm.
- يعاني من ضعف الانضباط أو التردد في التنفيذ.
- يريد قياس discipline بشكل يومي وعملي، وليس فقط حفظ الصفقات.

## 3) المشكلة الأساسية
المشكلة ليست فقط "تسجيل الصفقات".
المشكلة الحقيقية هي:

> المؤشر يعطي إشارة صحيحة، لكن المتداول لا ينفذ بسبب الخوف أو التردد، ثم يريد لاحقًا أن يفهم أثر ذلك على أدائه وانضباطه.

لذلك يجب أن تكون نواة التطبيق مبنية على:
- Signals
- Decisions
- Executed Trades
- Missed Trades
- Discipline Metrics
- Challenge / Risk Context

## 4) الـ Daily Workflow المطلوب
1. فتح التطبيق.
2. مراجعة الأخبار المهمة.
3. أخذ نظرة موجزة على الحسابات.
4. فتح اختصار MT5 Terminal.
5. مراقبة سجل إشارات CISD القادمة من CSV.
6. تسجيل قرار كل إشارة:
   - دخلت
   - لم أدخل
   - السبب
7. تسجيل الصفقة إذا نُفذت.
8. قياس مستوى الانضباط والفرص الفائتة.
9. كتابة الملاحظات اليومية.
10. مراجعة التحليلات اليومية.

## 5) أهم نواتج يجب أن يراها المستخدم يوميًا
1. **حالة الحسابات** بعد الاستيراد: balance, target, drawdown, daily loss.
2. **آخر إشارات CISD** وهل تم الدخول عليها أم لا ولماذا.
3. **الأخبار والجلسات وتوقيت نيويورك** مع سياق واضح قبل التنفيذ.

## 6) التميز عن الأدوات العامة
المنتج يتميز عن أدوات مثل TradeZella / TraderVue بأنه:
- يعتمد مباشرة على ملف CISD CSV.
- يقيس الفرق بين **الإشارة** و **قرار التنفيذ**.
- يركز على **الانضباط** وليس فقط performance.
- يخدم سيناريو الـ prop-firm challenge بشكل أوضح.
- يجمع بين: signals + execution + missed trades + risk + review.

## 7) مبدأ التطوير
لن نقود المشروع من الواجهة الحالية.
سنقوده من النواة:

1. Domain models
2. Import / signal pipeline
3. Analytics & risk engine
4. App services / use-cases
5. UI جديدة لاحقًا

## 8) مراحل التنفيذ

### Phase 1 — Core Foundation
- إصلاح bugs الحرجة.
- توحيد منطق imports والإشارات.
- دعم locale من البداية (`ar` / `en`).
- حفظ الإعدادات بطريقة أوضح.
- بناء اختبارات ومحاكاة للنواة.

### Phase 2 — Signal & Import Engine
- CSV pipeline موحدة لإشارات CISD.
- MT5 importer موحد.
- FundedNext importer موحد.
- import diagnostics + duplicate protection + fixtures.

### Phase 3 — Discipline & Risk Engine
- executed vs missed signals.
- discipline score.
- hesitation reasons.
- challenge progress.
- daily loss / max drawdown warnings.

### Phase 4 — Analytics Engine
- expectancy, PF, drawdown, streaks.
- source / session / symbol / tag breakdowns.
- live vs backtest vs linked signal analysis.

### Phase 5 — New UI
- bilingual UI from scratch.
- RTL/LTR clean support.
- focused dashboard for signals, discipline, and account health.

## 9) ماذا أنجزت الدفعة الأولى؟
هذه الدفعة تركّز على الأساس:
- إصلاح عقد `signal:status` بين preload و main.
- إزالة مشكلة MT5 import المكرر داخل `main.js`.
- إضافة خدمة locale مركزية.
- إضافة setting للغة الافتراضية.
- إضافة parser وخدمة مخصصة لإشارات CISD CSV.
- توسيع الاختبارات لتشمل الإشارات واللغات.

## 10) ماذا أنجزت الدفعة الثانية؟
هذه الدفعة تركّز على **Phase 2 — Signal & Import Engine**:
- إضافة طبقة `import-engine` موحدة فوق جميع المصادر.
- توحيد diagnostics لإشارات CISD و FundedNext و MT5.
- تسجيل import history بشكل أغنى مع fingerprints لمنع التكرار القريب.
- إضافة عينات fixtures حقيقية للاختبارات (`CSV` و `HTML`).
- توسيع المحاكاة لتغطي diagnostics و history و duplicate behavior.
- حفظ آخر diagnostics لكل مصدر داخل state لتهيئة UI أقوى لاحقًا.

## 11) ماذا أنجزت الدفعة الثالثة؟
هذه الدفعة تركّز على **Phase 3 — Discipline & Risk Engine**:
- إضافة `lib/engines/discipline.js` لقياس:
  - decision coverage
  - executed vs missed
  - missed reasons
  - linked signal trades
  - discipline score
- إضافة `lib/engines/risk.js` لحساب:
  - daily loss remaining
  - max drawdown remaining
  - challenge progress
  - open P&L / equity
  - consecutive losses
  - warning codes / breach state
- إضافة `lib/engines/account-dashboard.js` لتجميع snapshot موحد للحساب.
- إضافة IPC جديد `dashboard:snapshot` لتهيئة UI الجديدة لاحقًا.
- توسيع الاختبارات والمحاكاة لتغطي discipline + risk + dashboard snapshot.

## 12) ماذا أنجزت الدفعة الرابعة؟
هذه الدفعة تركّز على **Phase 4 — Analytics Engine**:
- إضافة `lib/engines/analytics.js` لبناء snapshot تحليلي موحد للحساب.
- استخراج منطق الأداء من الواجهة إلى engine قابلة للاختبار.
- دعم metrics أساسية:
  - win rate
  - expectancy
  - profit factor
  - average win / loss
  - payoff ratio
  - max drawdown / current drawdown
  - current streak / longest streaks
  - equity curve
- دعم breakdowns حسب:
  - source
  - instrument
  - side
  - session
  - tag
  - day
  - month
- دعم heatmap و backtest comparison.
- إضافة IPC جديد `analytics:snapshot` حتى تستهلك UI الجديدة البيانات مباشرة.

## 13) ماذا أنجزت الدفعة الخامسة؟
هذه الدفعة تركّز على **Phase 5 — New UI**:
- إعادة بناء الواجهة من الصفر تقريبًا في `renderer/index.html` و `renderer/style.css` و `renderer/app.js`.
- اعتماد واجهة dashboard حديثة bilingual (`AR/EN`) مع `RTL/LTR` نظيف.
- جعل الواجهة الجديدة تستهلك فقط snapshots الجاهزة من النواة:
  - `dashboard:snapshot`
  - `analytics:snapshot`
- إنشاء صفحات أوضح للـ:
  - Overview
  - Signals
  - Journal
  - Analytics
  - Data Sources
  - Settings
- تحسين الأمان في العرض عبر `escapeHtml` وتقليل الاعتماد على النصوص المبعثرة القديمة.
- ربط القرارات السريعة على الإشارات (`Entered / Missed`) مع نموذج مرئي أوضح.
- تجهيز تجربة أقرب لمنتج فعلي يمكن البناء عليها تجاريًا.

## 14) ماذا أضيف بعد ذلك؟
تمت إضافة متطلب مهم بعد Phase 5:
- **Backtest Time-Range support** من نفس ملف `CISD CSV`.
- فلترة حسب:
  - التاريخ
  - الجلسة
  - الأداة
  - TF
- مراجعة يدوية لكل إشارة باكتيست.
- مع الحفاظ على دعم الصفقات اليدوية الكاملة خارج أي إشارة.

## 15) ماذا أنجزت في Product Hardening / Visual Polish؟
- إضافة `Content-Security-Policy` داخل الواجهة.
- إضافة loading overlay موحد للعمليات الطويلة.
- حفظ حالة الواجهة محليًا (`page`, `account`, `filters`, `search`, `selected backtest`).
- إضافة شريط حالة workspace أعلى التطبيق.
- إضافة حقول بحث سريعة للإشارات والصفقات وإشارات الباكتيست.
- تحسين تدفق التحديث بعد القرارات السريعة وحفظ الصفقات حتى تنعكس التغييرات فورًا على الواجهة.
- صقل بصري إضافي في الـ layout والبطاقات والحركة الخفيفة.

## 16) ماذا أُنجز في UI Refinement Sprint 2؟
- إضافة hero section أكثر احترافية في صفحة Overview.
- إضافة spotlight summary لجلسة الباكتيست المختارة.
- إضافة بحث أسرع وأكثر وضوحًا في signals / journal / backtest.
- إضافة loading states متناسقة في عمليات الاستيراد والحفظ والاسترجاع.
- إضافة حفظ واسترجاع أفضل لحالة الواجهة محليًا.
- تحسين status dock والحركة البصرية والطبقات والمساحات.
- تقوية صقل تجربة الاستخدام مع الحفاظ على الاعتماد الكامل على النواة الحالية.

## 17) ماذا أُنجز في UI Refinement Sprint 3؟
- إضافة `overview hero` أكثر قربًا لمنتج تجاري فعلي مع focus insight حي.
- إضافة `analytics filter panel` لشرح الفلاتر النشطة بصريًا.
- تحسين `equity curve` بصريًا عبر grid lines / glow / endpoint marker.
- إضافة `curve meta stats` أسفل الرسم لعرض best / worst / average win / average loss.
- تحسين breakdown cards بإظهار bars بصرية بدل عرض نصي فقط.
- إضافة `backtest spotlight` لعرض جودة الجلسة التاريخية الحالية بشكل أوضح.
- تحسين hierarchy البصرية العامة لتكون أقرب إلى mockup احترافي.

## 18) ماذا أُنجز في Sprint A — Icon & Component Polish؟
- إضافة نظام أيقونات inline SVG داخل الواجهة بدون اعتماد خارجي.
- تحسين الـ navigation بعناصر مرئية أوضح وأقرب لمنتج مدفوع.
- تحويل عناوين الصفحات واللوحات الرئيسية إلى عناوين مدعومة بالأيقونات.
- ترقية metric cards لتشمل أيقونات وvariants أوضح حسب الحالة.
- تحسين data source cards وbuttons الأساسية بصريًا.
- رفع وضوح hierarchy داخل analytics وoverview وsettings وbacktest.

## 19) ماذا أُنجز في Motion Polish & Micro-Interactions + Demo Refresh؟
- إضافة toast states حسب النوع: success / warn / error.
- إضافة pulse خفيف للأسطح عند التحديث والتنقل لرفع الإحساس بالتفاعل.
- تحسين active navigation accent والضغطات والحركات الصغيرة.
- توليد screenshots مرجعية محدثة للصفحات الأساسية:
  - Overview V2
  - Analytics V2
  - Backtest V2
- إنشاء demo sheet محدث للمقارنة البصرية السريعة.

## 20) ماذا أُنجز في User-Testing Pass + UX Audit؟
- تنفيذ مراجعة UX شاملة على workflow اليومي الكامل.
- توثيق النتائج في `docs/USER_TESTING_PASS_UX_AUDIT.md`.
- إعداد script جاهز لاختبار المستخدمين الفعليين في `docs/USER_TESTING_SCRIPT.md`.
- تحديد الأولويات العملية التالية، وأهمها:
  - استعادة واجهة إعداد حدود الحساب والمخاطرة بوضوح
  - تحسين مراجعة الباكتيست واستبدال prompts
  - تقوية التوجيه بعد قرار Entered على الإشارة

## 21) ماذا أُنجز في Account & Risk Settings Recovery؟
- استعادة واجهة كاملة لإعدادات الحساب والمخاطرة داخل UI الجديدة.
- إضافة حقول واضحة لـ:
  - capital
  - current balance
  - currency
  - phase
  - profit target
  - daily loss
  - max drawdown
- إضافة طبقة Funding Access جديدة تدعم:
  - Investor Pass (login / server / encrypted password)
  - Shared Dashboard URL
- إبقاء البيانات الحساسة محليًا ومشفرة.
- إضافة status واضح لمصدر بيانات التمويل داخل الإعدادات وصفحة المصادر.
- إضافة اختبارات أساسية لـ funding access validation.

## 22) ماذا أُضيف بعد Account & Risk Settings Recovery؟
- إضافة parser أولي لـ FundingPips Shared Dashboard.
- تمهيد sync path لقراءة بيانات الحساب من Shared URL داخل التطبيق.
- إضافة bridge أولي لـ Investor Pass read-only عبر Python + MetaTrader5 على ويندوز.
- إضافة mapping لبيانات الحساب والمراكز المفتوحة والصفقات المغلقة الحديثة إلى state التطبيق.
- توثيق متطلبات التشغيل في `docs/INVESTOR_PASS_BRIDGE_SETUP.md`.

## 23) ماذا أُنجز في Windows Packaging & EXE Runtime Readiness Pass؟
- تثبيت توجه EXE-first رسميًا داخل المشروع.
- إضافة runtime readiness snapshot داخل التطبيق لمعرفة جاهزية MT5 bridge التنفيذي.
- إضافة helper docs وتشغيل لويندوز:
  - `docs/WINDOWS_EXE_RUNTIME_READINESS.md`
  - `docs/WINDOWS_LIVE_VALIDATION_CHECKLIST.md`
- تحديث مسارات GitHub Actions لتبني `mt5_readonly_sync.exe` قبل بناء نسخة ويندوز.
- إضافة fallback منطقي: EXE أولًا، وPython فقط للتطوير أو البناء.

## 24) ماذا أُنجز في Backtest Review Interaction Upgrade؟
- استبدال مراجعة الباكتيست المعتمدة على `prompt()` بنافذة مراجعة مخصصة داخل الواجهة.
- إضافة summary أوضح للإشارة التاريخية قبل حفظ النتيجة.
- دعم اختيار النتيجة بصريًا: Win / Loss / BE / Missed.
- دعم إدخال R و note داخل modal مراجعة واحدة منسقة.
- رفع جودة تجربة الباكتيست لتقترب من بقية التطبيق بصريًا وتجريبيًا.

## 25) ماذا أُنجز في Guided Discipline Actions؟
- بعد اختيار `Entered` على الإشارة، يتم الآن توجيه المستخدم مباشرة إلى صفحة الـ Journal.
- تمت إضافة panel توجيهي واضح يشرح أن الإشارة أصبحت مرتبطة وأن الخطوة التالية هي تسجيل الصفقة.
- أصبح ربط الإشارة بالصفقة أوضح داخل workflow بدل الاكتفاء برسالة نجاح فقط.
- تمت إضافة أزرار سريعة للعودة إلى الإشارات أو إلغاء التوجيه.

## 26) ماذا أُنجز في Windows Live Validation Prep؟
- إضافة preflight script للتحقق من جاهزية EXE-first قبل النشر:
  - `tools/windows_release_preflight.js`
- إضافة أوامر:
  - `npm run validate:release`
  - `npm run validate:release:exe`
- إضافة اختبار QA للتأكد من عقد النشر على ويندوز.
- تحديث GitHub workflows لتبني bridge EXE ثم التحقق منه قبل الـ dist.
- إضافة دليل واضح للنشر والتجربة:
  - `docs/GITHUB_PUBLISH_AND_TEST_GUIDE.md`

## 27) الدفعة التالية المقترحة
- Windows live validation فعلي على جهاز ويندوز.
- ثم User-testing pass ميداني بعد التأكد من runtime الحقيقي.
- وبعد نجاحهما يصبح المشروع قريبًا جدًا من النشر التجريبي على GitHub للتجربة العملية.
