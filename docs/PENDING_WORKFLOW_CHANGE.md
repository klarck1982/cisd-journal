# Pending change: publish SHA-256 checksums with each release

## Why this is a separate note

This repository's GitHub App is not granted the `workflows` permission, so a
push that edits `.github/workflows/**` is rejected:

```
refusing to allow a GitHub App to create or update workflow
`.github/workflows/release.yml` without `workflows` permission
```

The change below is therefore documented rather than committed. **It needs a
maintainer with write access to apply it**, which takes about a minute.

## Why it matters

`docs/الخطة.md` listed "every release publishes a SHA-256 digest" as done. It
was not: the snippet lived only as a suggestion inside `docs/CODE_SIGNING.md`
and had never been added to the workflow. Users were being told to verify a
digest that did not exist.

Because the Windows installer stays **unsigned** until a commercial certificate
is purchased, a published digest is the only integrity check a user has. When
SmartScreen warns about an unknown publisher, the digest is what distinguishes
"unsigned but authentic" from "tampered with".

## The change

In `.github/workflows/release.yml`, insert this step **after** `npm run dist:win`
and **before** `Publish GitHub Release`:

```yaml
      # The installer is unsigned until a commercial certificate is bought, so a
      # published digest is the only way a user can verify what they downloaded.
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

Then add one line to the release `files:` list:

```yaml
          files: |
            dist/*.exe
            dist/SHA256SUMS.txt          # <-- add this
            bridges/mt5_readonly_sync.exe
```

## Verifying it worked

After the next tagged release, `SHA256SUMS.txt` should appear among the release
assets. A user verifies a download with:

```powershell
Get-FileHash .\CISD-Journal-Setup.exe -Algorithm SHA256
```

and compares the result against the matching line in `SHA256SUMS.txt`.

## Related

`docs/CODE_SIGNING.md` covers the longer-term fix — a commercial certificate,
roughly $400–700/year plus a registered entity — which also unblocks automatic
updates, since `electron-updater` refuses unsigned updates.
