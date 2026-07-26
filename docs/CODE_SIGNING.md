# Code Signing — إزالة تحذير Windows

## المشكلة

عند تثبيت التطبيق حالياً يظهر تحذير:

> **Windows protected your PC** — Unknown publisher

هذا لا يعني أن التطبيق خطر، بل أن المثبّت **غير موقّع رقمياً**. أي ملف EXE بلا توقيع
يعرض هذا التحذير، ويجب على المستخدم الضغط على **More info → Run anyway**.

## متى يهم هذا؟

| الحالة | هل التوقيع ضروري؟ |
|---|---|
| استخدامك الشخصي | ❌ لا — اضغط "Run anyway" مرة واحدة |
| مشاركته مع 2–3 أشخاص تعرفهم | ⚠️ مفيد لكن ليس ضرورياً |
| توزيع عام أو بيع | ✅ ضروري |

**التوصية:** لا تشترِ شهادة قبل أن تقرر التوزيع فعلاً.

## الخيارات والتكلفة

| النوع | التكلفة السنوية | التحذير يختفي |
|---|---|---|
| **OV** (Organization Validation) | 200–400$ | تدريجياً، بعد بناء سمعة |
| **EV** (Extended Validation) | 400–700$ | فوراً |

- **OV** أرخص لكن يتطلب وقتاً حتى يثق SmartScreen بالملف.
- **EV** يزيل التحذير فوراً، ويأتي على جهاز USB مادي (HSM).
- كلاهما يتطلب **كياناً تجارياً مسجلاً** — لا تُصدر للأفراد عادةً.

## كيف يُفعَّل بعد شراء الشهادة

`electron-builder` يدعم التوقيع مباشرة. الإعداد المطلوب في `package.json`:

```json
"win": {
  "target": "nsis",
  "icon": "assets/icon.ico",
  "signtoolOptions": {
    "certificateSubjectName": "اسم شركتك كما في الشهادة"
  }
}
```

وللشهادات المستضافة سحابياً (Azure Trusted Signing مثلاً):

```json
"win": {
  "azureSignOptions": {
    "publisherName": "اسم الناشر",
    "endpoint": "https://eus.codesigning.azure.net",
    "certificateProfileName": "اسم الملف الشخصي",
    "codeSigningAccountName": "اسم الحساب"
  }
}
```

### في GitHub Actions

لا تضع الشهادة في المستودع أبداً. استخدم Secrets:

```yaml
- run: npm run dist:win
  env:
    CSC_LINK: ${{ secrets.WINDOWS_CERT_BASE64 }}
    CSC_KEY_PASSWORD: ${{ secrets.WINDOWS_CERT_PASSWORD }}
```

> **تنبيه أمني:** شهادات EV على HSM لا يمكن تصديرها كملف، لذا لا تعمل مع
> `CSC_LINK`. تحتاج إما جهاز بناء محلي، أو خدمة توقيع سحابية.

## بديل مجاني مؤقت

حتى تقرر الشراء، أرفق مع كل إصدار **بصمة SHA-256** للملف حتى يتحقق المستخدم منه:

```powershell
Get-FileHash "CISD Journal Setup.exe" -Algorithm SHA256
```

انشر البصمة في صفحة الإصدار على GitHub. من يهمه الأمر يقارنها قبل التثبيت.

## التحديث التلقائي

`electron-updater` **يتطلب توقيعاً** على Windows؛ التحديثات غير الموقّعة تُرفض.
لذلك التحديث التلقائي مؤجل حتى يُحسم التوقيع. حتى ذلك الحين، الإصدارات تُنزَّل يدوياً
من صفحة GitHub Releases.

---

## الخلاصة العملية

1. **الآن:** انشر بصمة SHA-256 مع كل إصدار. لا تكلفة.
2. **عند التوزيع الجاد:** اشترِ شهادة EV وفعّل `signtoolOptions`.
3. **بعد التوقيع:** فعّل `electron-updater`.

---

## ملاحظة: تعديلان يحتاجان يدك

الوكيل البرمجي لا يملك صلاحية تعديل ملفات `.github/workflows/` (قيد أمني في GitHub).
التعديلان التاليان جاهزان للنسخ:

### 1) تحديث إصدارات Actions المهجورة

كل تشغيل ينبّه أن Node 20 مهجور. في **كل** ملفات `.github/workflows/`:

```
actions/checkout@v4       →  actions/checkout@v5
actions/setup-node@v4     →  actions/setup-node@v5
actions/setup-python@v5   →  actions/setup-python@v6
actions/upload-artifact@v4 → actions/upload-artifact@v5
```

### 2) نشر بصمة SHA-256 مع كل إصدار

في `.github/workflows/release.yml`، أضف قبل خطوة `Publish GitHub Release`:

```yaml
      - name: Generate SHA-256 checksums
        shell: pwsh
        run: |
          $files = @(Get-ChildItem dist/*.exe) +
                   @(Get-ChildItem bridges/mt5_readonly_sync.exe -ErrorAction SilentlyContinue)
          $lines = foreach ($f in $files) {
            $h = Get-FileHash $f.FullName -Algorithm SHA256
            "$($h.Hash)  $($f.Name)"
          }
          $lines | Out-File -FilePath dist/SHA256SUMS.txt -Encoding utf8
          Get-Content dist/SHA256SUMS.txt
```

ثم أضف `dist/SHA256SUMS.txt` إلى قائمة `files:` في نفس الملف.
