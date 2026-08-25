-- Removes OAuth self-service scaffolding that no code path uses yet
-- (self-service is explicitly deferred per product decision) and trims the
-- integration provider catalog down to the one provider actually in use
-- today: google_calendar, connected manually by an internal operator, not
-- via OAuth. No client data exists in any of these rows.

drop table if exists app.integration_oauth_states;

delete from app.integration_providers where key <> 'google_calendar';

update app.integration_providers
set auth_strategy = 'manual',
    updated_at = now()
where key = 'google_calendar';
