# Gap-to-Mockup Pass

## ملاحظة مهمة
هذه المقارنة مبنية على:
1. الواجهة الحالية المنفذة داخل المشروع.
2. اللقطات المرجعية البصرية:
   - `images/cisd-visual-overview.png`
   - `images/cisd-visual-analytics.png`
   - `images/cisd-visual-backtest.png`

وليس على screenshot runtime حي من Electron داخل هذه البيئة.

---

## التقييم العام
النواة الوظيفية صارت قوية جدًا، والواجهة الجديدة نظيفة ومنظمة، لكن ما زال هناك فرق واضح بين:
- **واجهة تعمل بشكل جيد**
- و **واجهة تبدو كمنتج مدفوع مكتمل الصقل**

### التقدير الحالي
- **Functional maturity:** مرتفع
- **Visual maturity:** متوسط إلى جيد
- **Mockup proximity:** حوالي **65% إلى 75%** بصريًا

الفرق لم يعد في البنية الأساسية، بل في:
- hierarchy
- component polish
- charts quality
- typography
- iconography
- density control
- motion
- visual confidence

---

## أين أصبحنا قريبين من الـ mockup؟

### 1) Information Architecture
تم الوصول إلى بنية واضحة جدًا:
- Overview
- Signals
- Journal
- Backtest
- Analytics
- Data Sources
- Settings

وهذا متوافق مع اتجاه mockup الاحترافي.

### 2) Product Identity
المنتج الآن يقرأ فعلاً كـ:
**Trading Discipline OS**
وليس مجرد CSV viewer أو journal تقليدي.

### 3) Core dashboard logic
لدينا الآن عناصر رئيسية صحيحة:
- account health
- risk guardrails
- discipline score
- challenge progress
- upcoming news
- latest signals
- analytics snapshot
- backtest review

### 4) Dark premium direction
اللون العام، البطاقات، والـ shell البصري أصبحوا قريبين من مسار احترافي مناسب.

---

## الفجوات الرئيسية مع الـ mockup

## A. الفجوة البصرية الكبرى: مستوى الصقل
### الوضع الحالي
الواجهة جميلة ومنظمة، لكنها ما تزال أحيانًا تشعر بأنها:
- developer-built UI
- أكثر من كونها polished product surface

### المطلوب
- spacing أكثر دقة
- تدرجات أخف وأكثر فخامة
- رفع جودة الحواف، الظلال، وpanel separation
- تقليل التكرار البصري في البطاقات

### الأولوية
**عالية**

---

## B. Hero sections تحتاج product storytelling أقوى
### الوضع الحالي
هناك hero جيدة في Overview، لكن ما زالت أقل من mockup في:
- إبراز message واحدة قوية
- layering بصري أقوى
- mix أفضل بين summary + urgency + focus

### المطلوب
- hero أكثر cinematic لكن عملية
- استخدام KPI رئيسية داخل hero نفسها
- إبراز واضح لـ:
  - risk state
  - discipline state
  - next action

### الأولوية
**عالية**

---

## C. Cards تحتاج variants أكثر ذكاءً
### الوضع الحالي
البطاقات متناسقة، لكن معظمها من نفس العائلة تقريبًا.

### المطلوب
تمييز بصري أوضح بين:
- KPI cards
- action cards
- warning cards
- insight cards
- review cards
- import diagnostics cards

### مثال
بطاقة الخطر يجب أن تختلف فورًا عن بطاقة news أو بطاقة analytics.

### الأولوية
**عالية**

---

## D. Charts ما تزال أقل من مستوى mockup
### الوضع الحالي
تم تحسين equity curve، وهذا ممتاز.
لكن الرسوم ما زالت أقل من مستوى “product-grade analytics SaaS”.

### المطلوب
- better chart framing
- hover-capable states لاحقًا
- axis labels / anchor hints
- stronger visual storytelling
- mini charts لبعض البطاقات
- sparkline support لبعض المقاييس

### الأولوية
**عالية**

---

## E. Iconography شبه غائبة
### الوضع الحالي
الواجهة تعتمد أساسًا على النصوص والـ layout.

### المطلوب
إضافة نظام أيقونات واضح لـ:
- navigation
- risk
- discipline
- challenge
- news
- signals
- imports
- settings

### الأثر
هذا وحده سيرفع الإحساس الاحترافي بشكل كبير.

### الأولوية
**عالية جدًا**

---

## F. Typography hierarchy ما تزال تحتاج صقل
### الوضع الحالي
الخطوط واضحة، لكن ليست بعد بمستوى mockup في:
- contrast hierarchy
- weights
- sizing rhythm
- header/subheader discipline

### المطلوب
- ضبط line-height
- توحيد semantic heading scale
- إبراز الأرقام بشكل أقوى
- تحسين أحجام النصوص الثانوية والشرح

### الأولوية
**متوسطة إلى عالية**

---

## G. الـ tables والبreakdowns تحتاج polish أكبر
### الوضع الحالي
البreakdowns جيدة وظيفيًا.

### المطلوب
- row treatments أفخم
- visual separators أخف
- badges محسنة
- progress hints داخل الصفوف
- sorting affordance لاحقًا

### الأولوية
**متوسطة**

---

## H. Backtest page قوية منطقيًا لكنها أقل بصريًا من باقي الصفحات
### الوضع الحالي
وظيفيًا ممتازة بعد إضافة time-range filtering والمراجعة اليدوية.
لكن بصريًا يمكن دفعها لمستوى أعلى.

### المطلوب
- session summary banner أقوى
- visual identity خاصة بالباكتيست
- clearer review flow
- أفضل عرض للفلترة التاريخية
- فصل أوضح بين create / library / review

### الأولوية
**عالية**

---

## I. حالات الفراغ والتحميل والأخطاء تحتاج لمسات أكثر
### الوضع الحالي
موجودة وتعمل.

### المطلوب
- empty states أكثر product-like
- لغة إرشادية أقوى
- loading skeletons لاحقًا بدل overlay فقط
- error surfaces أنظف وأقل فجائية

### الأولوية
**متوسطة**

---

## J. التفاعل الحركي ما زال محدودًا
### الوضع الحالي
يوجد hover وtransition خفيف.

### المطلوب
- page transitions أنعم
- card entrance states
- chip transitions
- state change emphasis بعد الحفظ أو review
- refined modal behavior

### الأولوية
**متوسطة**

---

## الفجوات غير البصرية لكن مؤثرة على الإحساس الاحترافي

## 1) لا توجد screenshots تشغيل حي فعلية بعد
للوصول إلى confidence أعلى، نحتاج لاحقًا:
- build محلي
- screenshots حقيقية من التطبيق
- مقارنة مباشرة مع mockup

## 2) لا توجد design tokens مستقلة رسميًا
حاليًا CSS جيد، لكن ما يزال ينقصه formalization أكبر مثل:
- spacing tokens
- elevation tokens
- semantic color roles
- component states

## 3) لا توجد icon system أو asset language
وهذا جزء مهم جدًا من الانتقال من “واجهة جيدة” إلى “واجهة تجارية”.

---

## ما الذي أوصي به كخطة للوصول من 70% إلى 90% بصريًا؟

## Sprint A — Icon & Component Polish
### الهدف
رفع الإحساس الاحترافي بسرعة.
### العمل
- إضافة icon set ثابت
- variants للبطاقات
- تحسين chips/buttons/forms
- ضبط typographic scale

## Sprint B — Analytics Visual Upgrade
### الهدف
جعل التحليلات تبدو SaaS-grade.
### العمل
- charts أجمل
- mini-stat strips
- stronger breakdown rows
- heatmap polish

## Sprint C — Backtest Experience Polish
### الهدف
جعل الباكتيست من أقوى صفحات المنتج.
### العمل
- drill session hero
- review pipeline UI
- clearer signal review controls
- session progress visualization

## Sprint D — Motion & State Polish
### الهدف
رفع الإحساس النهائي بالمنتج.
### العمل
- refined transitions
- success/error states
- empty states
- skeletons
- subtle animation system

---

## الأولويات التنفيذية المباشرة
إذا أردنا أعلى أثر بأقل تكلفة، فالترتيب الأفضل هو:

1. **Icon system**
2. **Component variants**
3. **Analytics chart polish**
4. **Backtest visual polish**
5. **Motion / micro-interactions**

---

## الخلاصة
**أهم خبر جيد:**
الفجوة الحالية لم تعد فجوة معمارية أو منطقية.

بل أصبحت في الغالب:
> **فجوة صقل بصري وتجربة استخدام**

وهذا ممتاز جدًا، لأن:
- النواة موجودة
- الواجهات الأساسية موجودة
- المسارات الأساسية تعمل
- ويمكن الآن العمل على “رفع مستوى المنتج” بدل “إنقاذه من الأساس”

## الحكم النهائي
التطبيق الآن:
- **قوي جدًا كنواة**
- **جيد جدًا كبداية UI احترافية**
- ويحتاج **عدة Sprintات صقل مركزة** ليصل لمستوى الصورة المرجعية بدرجة عالية.
