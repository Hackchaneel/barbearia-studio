-- Initial shop profile for the El Patrón installation.
-- The public site and profile settings continue to read/write these database fields.
update public.barbershops
set name = 'Barbearia EL PATRÓN',
    slug = 'el-patron-riacho-fundo',
    description = 'Barbearia no Riacho Fundo I, ao lado do Frango do Pote.',
    phone = '(61) 9938-2259',
    address_line = 'Riacho Fundo I, ao lado do Frango do Pote',
    city = 'Brasília',
    state = 'DF'
where slug in ('noir-pinheiros', 'el-patron-riacho-fundo');
