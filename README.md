# ASTRA — Samrat Ashok Technological Institute

A responsive, space-themed college festival website with individual event registration and email verification. The browser UI and Node.js server are included; registrations are written to a local JSON file after an email request is made.

## Run the website in VS Code

1. Install Node.js 18 or newer.
2. Open this project folder in VS Code.
3. Open the VS Code terminal in this folder and run `npm install`.
4. Copy `.env.example` to `.env` and add the SMTP settings for the email account that should send verification messages.
5. Run `npm start` and open `http://localhost:3000` in your browser.

The site must be served by `npm start`; opening `index.html` directly will not enable event loading, registration, or email verification. Keep `.env` private and do not commit it.

## Email verification setup

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` in `.env`. Port 587 usually uses `SMTP_SECURE=false`; port 465 uses `SMTP_SECURE=true`. The verification link expires after 30 minutes.

For a deployed site, set `APP_BASE_URL` to its public HTTPS address so email links return to the deployed server. The default `http://localhost:3000` link only works on the same computer that runs the development server.

## Included behavior

- Samrat Ashok Technological Institute branding across the site and verification page.
- Eight sample events across Technical and Cultural categories and two festival dates.
- Event cards with distinct registration buttons. Each registration is linked to that event.
- Required name, email, and mobile number fields, with browser and server-side validation.
- A secure random, single-use email verification token stored as a hash and expiring after 30 minutes.
- Filterable event cards and a day-wise schedule. Events sharing a start time are shown in the same time block on separate lines with their venues.
- Pending and verified registration records are kept in `data/registrations.json`; that file is excluded from Git by `.gitignore`.

Edit `events.json` to update the festival lineup. Keep each event ID unique and keep dates in `YYYY-MM-DD` and times in 24-hour `HH:MM` format.
