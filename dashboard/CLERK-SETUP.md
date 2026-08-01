# Clerk setup for AutiveX Control

The dashboard is already wired for Clerk. Until a publishable key is present it intentionally shows a configuration screen instead of an insecure demo bypass.

## 1. Create the Clerk application

1. Create a Development instance in [Clerk Dashboard](https://dashboard.clerk.com).
2. Enable the sign-in methods you want. Email code or Google plus email code is a sensible first version.
3. Keep production and development as separate Clerk instances.

## 2. Add the browser key

Copy `dashboard/.env.example` to `dashboard/.env.local` and replace the placeholder:

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_ONBOARDING_SCHEDULING_URL=https://your-real-calendar-link.example/onboarding
VITE_ONBOARDING_SUPPORT_URL=https://wa.me/your-business-number
```

Then restart:

```bash
npm run dev:dashboard
```

Never put `CLERK_SECRET_KEY` in a variable beginning with `VITE_`. Vite exposes every `VITE_` variable to the browser.

## 3. Configure AutiveX as B2B

In Clerk, enable Organizations and use these access settings before inviting a customer:

- Set sign-up mode to **Restricted**.
- Turn **Organization membership required** on.
- Turn user-created Organizations off. AutiveX creates the clinic after payment.
- Keep Personal Accounts off.

Use this model:

- One Clerk User = one person.
- One Clerk Organization = one clinic.
- `org:admin` = owner/administrator.
- `org:member` = receptionist or other team member.

The current UI limits `Conexiones` and `Uso y plan` to `org:admin`. The backend must enforce the same rule once those screens read real data.

For the first customers, keep sign-up invite-only. Create the clinic organization after payment, invite its administrator, and let Clerk handle account creation from that invitation. If these restrictions are not enabled, someone could register publicly or create an unapproved clinic tenant.

## 4. Control what the customer sees

The current MVP reads `onboardingStatus` from the active Organization's public metadata. Supported values are:

```text
needs_onboarding -> asks the customer to schedule kickoff
scheduled        -> shows preparation instructions
configuring      -> shows that integrations are being connected
review           -> asks for the final test
active           -> unlocks the real dashboard
```

Temporary manual workflow:

1. Open the clinic Organization in Clerk Dashboard.
2. Edit its public metadata.
3. Set, for example:

```json
{
  "onboardingStatus": "configuring"
}
```

4. When the number, agent and integrations are verified, change it to:

```json
{
  "onboardingStatus": "active"
}
```

The browser can read public metadata but cannot write it. That prevents the customer from activating their own dashboard from this UI.

## 5. Next backend milestone

Organization metadata is only the MVP display gate. The canonical onboarding state, Retell agent ID, n8n workflow ID, calendar connection and phone number should live in AutiveX's own database keyed by Clerk `organization.id`.

Every future dashboard API must validate the Clerk token on the server and filter its query by the token's active `orgId`. Hiding a React component is not authorization.

The dashboard uses clean client-side routes (`/sign-in`, `/onboarding`, `/app`). Its production host must rewrite unknown paths to `dist-dashboard/index.html`; otherwise a direct visit or an OAuth callback can return 404. Add the host-specific SPA rewrite when the dashboard deployment target is chosen.

Useful official references:

- [React + Vite quickstart](https://clerk.com/docs/react/getting-started/quickstart)
- [Clerk environment variables](https://clerk.com/docs/guides/development/clerk-environment-variables)
- [Organizations overview](https://clerk.com/docs/guides/organizations/overview)
- [Organizations in React](https://clerk.com/docs/react/guides/organizations/getting-started)
- [Custom onboarding flow](https://clerk.com/docs/guides/development/add-onboarding-flow)
