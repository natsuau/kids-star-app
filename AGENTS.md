# Repository Instructions

These instructions apply to the entire repository.

## Security and privacy

- Treat this repository as public. Never place sensitive or personal information in source code, configuration files, comments, documentation, test data, screenshots, logs, commit messages, or generated files.
- Sensitive information includes names, home or work addresses, phone numbers, personal email addresses, family or child information, passwords, PINs, API keys, access tokens, session tokens, private keys, credentials, and non-public URLs.
- Use clearly fictional placeholders such as `YOUR_API_KEY` and `example@example.com` whenever an example value is needed.
- Never embed secrets in HTML, CSS, client-side JavaScript, mobile application bundles, or any file delivered to a user's browser or device.
- When a service requires a secret, keep it in a server-side environment variable or an appropriate secret-management service. Ensure local environment files containing secrets are excluded with `.gitignore`.
- Before creating or modifying files, committing, pushing, or publishing, inspect the complete change for secrets and personal information. If anything is uncertain, stop and ask the user before publishing.
- If the user accidentally supplies a secret, do not repeat it in responses, save it to files, or commit it. If it may already have been exposed, explain that deleting it from the current files is insufficient and recommend revoking or rotating it immediately.
- Do not add analytics, authentication, payments, advertising trackers, user accounts, or collection or transmission of personal data without first explaining what data will be handled and obtaining the user's confirmation.
- Use the minimum data and permissions required for each feature.
