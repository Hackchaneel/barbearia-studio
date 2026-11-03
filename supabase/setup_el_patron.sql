-- Atualiza os dados públicos da instalação para a El Patrón Barbearia.
-- Execute uma vez no SQL Editor do projeto Supabase correspondente.
update public.barbershops
set name = 'Barbearia EL PATRÓN',
    slug = 'el-patron-riacho-fundo',
    description = 'Barbearia no Riacho Fundo I, ao lado do Frango do Pote.',
    phone = '(61) 9938-2259',
    address_line = 'Riacho Fundo I, ao lado do Frango do Pote',
    city = 'Brasília',
    state = 'DF'
where slug in ('noir-pinheiros', 'el-patron-riacho-fundo')
returning id, name, phone, address_line, city, state;
