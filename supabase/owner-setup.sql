-- Run this after creating users in Authentication > Users.
-- Replace the email/display_name/initials/role values with the real users.

update public.profiles
set display_name = 'Timo Frank',
    initials = 'TF',
    role = 'admin',
    active = true
where lower(email) = lower('timofrank@example.de');

-- Repeat this block for every additional account.
update public.profiles
set display_name = 'Mirjam Scholz',
    initials = 'MS',
    role = 'editor',
    active = true
where lower(email) = lower('mirjam@example.de');

update public.profiles
set display_name = 'Max Fröhlich',
    initials = 'MF',
    role = 'viewer',
    active = true
where lower(email) = lower('max@example.de');

-- Cleanup for the first import that accidentally copied legacy topic text into topics.
update public.contacts
set topics = '{}'
where cardinality(topics) > 0;

select id, email, display_name, initials, role, active
from public.profiles
order by display_name;
