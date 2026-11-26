# Monograph support form (Tally)

Build this at https://tally.so (free plan). Shopify requires a public form
with name, email, store URL (with an example), a problem description and a
file upload, and no budget or phone fields. Merchants must get a reply within
two business days.

## Form settings

- **Form title:** Monograph theme support
- **Description (text block under the title):**
  Tell us what you need help with and we'll reply by email within two
  business days. Before you write, check the documentation:
  https://shailen-dra.github.io/monograph-docs/
  (change the link if the docs live somewhere else)

## Questions, in this order

| # | Tally block | Label | Required | Notes |
|---|---|---|---|---|
| 1 | Short answer | Your name | Yes | |
| 2 | Email | Email | Yes | Turn on email validation (Tally does this by default for the Email block). |
| 3 | Website / URL | Store URL | Yes | Placeholder: `your-store.myshopify.com`. Help text: "Your .myshopify.com address, for example your-store.myshopify.com" |
| 4 | Multiple choice | What do you need help with? | Yes | Options: Setting up the theme · A section or block · Product page · Collections, filters or search · Cart · Something looks broken · Other |
| 5 | Short answer | Page or section | No | Placeholder: "For example: home page, Slideshow section" |
| 6 | Long answer | Describe the problem | Yes | Placeholder: "What did you expect to happen, and what happened instead? Steps to reproduce help us fix it faster." |
| 7 | File upload | Screenshots or files | No | Allow multiple files. Help text: "Screenshots or a short screen recording help us find the problem." |
| 8 | Checkbox | I understand that support covers the theme as it was released, not code changes or third-party apps. | No | Optional; it cuts down on out-of-scope requests. |

Don't add phone, budget or "how did you hear about us" questions.

## After the form is sent

- **Thank-you page (Settings → Customize thank-you page):**
  "Thanks, we've got your message. We'll reply by email within two business
  days. A copy of your message has been sent to your email address."
- **Self email notifications:** on, sent to the support inbox that will
  answer merchants.
- **Respondent email notification:** on, sent to the Email answer (question
  2), with the subject "We've received your Monograph support request" and
  the same text as the thank-you page. If your Tally plan doesn't include
  this, the thank-you page still counts as the on-screen confirmation.

## Publish

1. Click **Publish** and copy the share link (`https://tally.so/r/xxxxxx`).
2. Open it in a private browser window and check it works without logging in.
3. Send a test request with a screenshot attached and check that both
   emails arrive.
4. Send the link to Claude, who puts it in `documentation/support.md`,
   `config/settings_schema.json` (`theme_support_url`) and the listing.
