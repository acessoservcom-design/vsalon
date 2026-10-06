# vBarber

## Deploy
- Sempre fazer o deploy após qualquer alteração em arquivos do projeto:
  `firebase deploy --only hosting --project app-vsalon`
- Alterações em `functions/` ou `firestore.rules`: incluir no mesmo comando (ex.: `firebase deploy --only hosting,functions,firestore:rules --project app-vsalon`).

## Comandos úteis
- Validar JS balanceado do index.html/agendar.html: `node C:\Users\Lincoln\AppData\Local\Temp\check3.js` (recriar script se não existir).
- Testar login/erros de console no site publicado: `node C:\Users\Lincoln\AppData\Local\Temp\opencode\test-login.js https://vsalon.web.app/` (puppeteer-core + Chrome).

## APK Android (painel do barbeiro)
- Capacitor 8, app `com.vbarber.painel`, carrega o site ao vivo via `server.url` (sempre atualiza sem novo build).
- Fonte web de fallback offline: `apk-web/` (ignorado no deploy do Hosting).
- Build assinado:
  - `$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'; $env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"; $env:ANDROID_SDK_ROOT=$env:ANDROID_HOME`
  - `cd android; .\gradlew.bat assembleRelease --no-daemon`
  - Saída: copiar `android\app\build\outputs\apk\release\app-release.apk` para `dist\vBarber-<versão>.apk`
- Keystore: `android/vbarber-release.jks` (alias `vbarber`, senha `VBarber2026`, props em `android/keystore.properties`). NUNCA perder nem trocar — trocar impede atualizar o app instalado.
- Ícones: gerar de `icon-512.png` para as pastas `mipmap-*` (legacy + foreground adaptativo) e cor `ic_launcher_background` = `#0C0E1C`.
- Versão: aumentar `versionCode`/`versionName` em `android/app/build.gradle` a cada release.


## Contexto
- Projeto Firebase: `app-vsalon` (site do Hosting: `vsalon` → https://vsalon.web.app; site padrão do projeto: https://app-vsalon.web.app).
- Perfis: operador/superadmin (`OPERATOR_UID` em `index.html`), barbeiro (`barbers/{email}`, campo `allowSubscriptions` controla o módulo de assinaturas), cliente (`agendar.html`).
