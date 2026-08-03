# Clerk and manual activation setup

AutiveX now supports two account paths with the same login:

- A public prospect creates a free clinic workspace, completes four short questions and reaches `AutiveX Preview`.
- A locally closed customer can be created or upgraded manually from `/admin` after AutiveX verifies an in-person, Mercado Pago, transfer or paid-invoice payment.

Registration, payment verification and production activation are deliberately separate events.

## 1. Browser configuration

Create `dashboard/.env.local` from `dashboard/.env.example`:

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_ONBOARDING_SCHEDULING_URL=https://your-calendar.example/onboarding
VITE_ONBOARDING_SUPPORT_URL=https://wa.me/5210000000000
VITE_SALES_CONTACT_URL=https://wa.me/5210000000000?text=Quiero%20activar%20AutiveX
```

Only the publishable Clerk key belongs in a `VITE_` variable.

## 2. Server configuration

Copy `.env.example` to `.env` and configure at minimum:

```env
CLERK_SECRET_KEY=sk_test_...
AUTIVEX_ADMIN_USER_IDS=user_...
AUTIVEX_ADMIN_EMAILS=tu-correo@autivexai.com
CLERK_AUTHORIZED_PARTIES=http://127.0.0.1:4184,https://app.autivexai.com
AUTIVEX_APP_URL=http://127.0.0.1:4184
```

`AUTIVEX_ADMIN_USER_IDS` is preferred. `AUTIVEX_ADMIN_EMAILS` is supported so the first operator can be configured before looking up their Clerk user ID. Neither variable is exposed to the browser.

Run the dashboard and its local API together:

```bash
npm run dev:control
```

Then open `http://127.0.0.1:4184/`.

## 3. Clerk B2B settings

In the Clerk Dashboard:

- Make sign-up public.
- Enable Organizations.
- Require Organization membership.
- Disable Personal Accounts.
- Enable automatic creation of the first Organization.
- Disable creation of additional Organizations by customers.
- Use `org:admin` as the creator role and `org:member` as the invited default.
- Keep the initial Organization membership limit small.
- Disable organization-name detection from email domain; many clinics use Gmail or Hotmail.

One Clerk User represents one person. One Clerk Organization represents one clinic, including an unpaid prospect clinic.

## 4. What each route does

```text
/sign-up       Public account creation
/app           Universal entry; the server resolves the correct experience
/onboarding    Paid customer activation
/admin         Internal AutiveX operations only
```

`/admin` does not trust `org:admin`, because every clinic owner has that role. The API validates the Clerk token and then checks the server-side AutiveX staff allowlist.

## 5. Current workspace state

For the first local customers, the control API stores the following state in Clerk Organization metadata:

```text
billingStatus:    unpaid | verified | past_due | canceled | refunded | disputed
onboardingStatus: prospect_intake | prospect_ready | needs_onboarding | scheduled | configuring | review | active
serviceStatus:    demo | locked | provisioning | live | suspended
```

Public metadata contains only display/gating state. The onboarding draft, payment record, production provisioning and short audit trail are kept in private metadata and can only be read by the backend and the internal admin console.

This is an intentional bootstrap for the first handful of manually operated customers. Before storing call records, patient data, extensive audit history or running at scale, move canonical tenant state to Postgres and keep Clerk only for identity, Organizations and roles.

## 6. Manual payment workflow

From `/admin`:

1. Open an existing prospect or choose `Crear cliente pagado`.
2. Verify that the money is actually credited in Mercado Pago, the bank account or cash log.
3. Record method, amount, date and reference.
4. Confirm payment. This changes the clinic to `verified + needs_onboarding + locked`.
5. Advance onboarding and start configuration with the semantic actions shown by the console.
6. Record the Retell agent, assigned E.164 number, human fallback, approved Retell test call, tested fallback and verified post-call webhook.
7. `Publicar llamada de prueba` and `Activar producción` remain blocked until all six checks are complete. Final activation also requires typing the clinic name.

An invoice sent, screenshot or customer claim is not treated as proof of payment. The success action never puts the phone agent into production automatically.

For a cold-sale client without an account, the console creates a Clerk Organization and sends an `org:admin` invitation. If the email already owns one unpaid prospect Organization, it reuses that Organization instead of creating a duplicate.

## 7. Retell Preview

Configure the existing Retell variables in the server `.env`:

```env
RETELL_API_KEY=...
RETELL_AGENT_ID_2=...
```

The personalized preview passes clinic name, city, services, draft schedule and scenario as dynamic variables. The Retell agent prompt must reference those variables. Do not create a separate Retell agent for every free signup.

The production provisioning record is intentionally manual in this bootstrap. It is evidence that the required resources and safety paths were tested; it does not itself create or modify a Retell agent.

## 8. Deployment notes

- Set every server variable in the production host; never copy `CLERK_SECRET_KEY` into the dashboard build.
- The dashboard host must rewrite `/app`, `/onboarding`, `/admin`, `/sign-in` and `/sign-up` to `dist-dashboard/index.html`.
- If the API uses a different domain, replace the relative `/api` calls with a configured API origin and include that origin in Clerk's authorized parties.
- Use separate Clerk development and production instances.

Useful references:

- [Clerk Organizations configuration](https://clerk.com/docs/guides/organizations/configure)
- [Clerk session tokens](https://clerk.com/docs/guides/sessions/session-tokens)
- [Clerk Organization metadata](https://clerk.com/docs/guides/organizations/metadata)
- [Clerk Organization invitations](https://clerk.com/docs/reference/backend/organization/create-organization-invitation)
