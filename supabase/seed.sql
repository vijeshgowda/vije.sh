-- Starter rows; safe to run twice.
insert into app.categories (slug, name, description, position, staff_only) values
  ('announcements', 'Announcements', 'News about the site.',             0, true),
  ('engineering',   'Engineering',   'Backend, infrastructure, tooling.', 1, false),
  ('local-ai',      'Local AI',      'Small models on your own hardware.', 2, false),
  ('games',         'Games',         'Saltbound and other projects.',     3, false),
  ('off-topic',     'Off-topic',     'Everything else.',                  4, false)
on conflict (slug) do nothing;
