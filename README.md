# AWS resilient payment flow

The Lambda uses Node.js 24 and exports `handler` from `src/index.ts`.

Build and package it from the repository root (requires npm and `zip`):

```bash
npm ci
npm run build
zip -j dist/lambda_function_1.0.0.zip dist/index.js
terraform -chdir=terraform init
terraform -chdir=terraform plan -var='lambdasVersion=1.0.0'
```

The ZIP contains `index.js` at its root to match `index.handler`. Use the same
version in the ZIP filename and `lambdasVersion`. Terraform uploads this local
ZIP directly to Lambda. The S3 backend bucket must already exist before initialization.
