-- Demo shop and public catalogue. No real users, appointments, or payments are seeded.
insert into public.barbershops (id, name, slug, description, phone, address_line, city, state, timezone)
values (
  '10000000-0000-4000-8000-000000000001',
  'Noir Barbearia',
  'noir-pinheiros',
  'Barbearia contemporânea em Pinheiros.',
  '(11) 3333-4444',
  'Rua dos Pinheiros, 412',
  'São Paulo',
  'SP',
  'America/Sao_Paulo'
)
on conflict (id) do nothing;

insert into public.services (id, barbershop_id, name, description, price_cents, duration_minutes, buffer_minutes, sort_order)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Corte clássico', 'Precisão nos detalhes, acabamento na navalha e finalização.', 6500, 45, 0, 1),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Barba & toalha quente', 'Ritual completo com toalha quente, desenho e hidratação.', 4800, 35, 0, 2),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Corte + barba', 'A experiência completa para sair renovado da cadeira.', 9900, 75, 0, 3)
on conflict (id) do nothing;

insert into public.business_hours (barbershop_id, weekday, is_closed, opens_at, closes_at)
values
  ('10000000-0000-4000-8000-000000000001', 0, true, null, null),
  ('10000000-0000-4000-8000-000000000001', 1, true, null, null),
  ('10000000-0000-4000-8000-000000000001', 2, false, '09:00', '20:00'),
  ('10000000-0000-4000-8000-000000000001', 3, false, '09:00', '20:00'),
  ('10000000-0000-4000-8000-000000000001', 4, false, '09:00', '20:00'),
  ('10000000-0000-4000-8000-000000000001', 5, false, '09:00', '20:00'),
  ('10000000-0000-4000-8000-000000000001', 6, false, '09:00', '18:00')
on conflict (barbershop_id, barber_member_id, weekday) do nothing;
