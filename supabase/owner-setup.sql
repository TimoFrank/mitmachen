-- Run this after creating users in Authentication > Users.
-- Replace the email/display_name/initials/role values with the real users.

update public.profiles
set display_name = 'Beispiel Admin',
    initials = 'BA',
    role = 'admin',
    active = true
where lower(email) = lower('admin@example.invalid');

-- Repeat this block for every additional account.
update public.profiles
set display_name = 'Beispiel Editor',
    initials = 'BE',
    role = 'editor',
    active = true
where lower(email) = lower('editor@example.invalid');

update public.profiles
set display_name = 'Beispiel Viewer',
    initials = 'BV',
    role = 'viewer',
    active = true
where lower(email) = lower('viewer@example.invalid');

-- Cleanup for the first import that accidentally copied legacy topic text into topics.
update public.contacts
set topics = '{}'
where cardinality(topics) > 0;

select id, email, display_name, initials, role, active
from public.profiles
order by display_name;
