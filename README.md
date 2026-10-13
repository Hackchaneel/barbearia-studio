# Noir — Barbearia contemporânea

Plataforma comercial reutilizável para barbearias. A experiência pública da Etapa 1 e a base de dados e autenticação da Etapa 2 estão implementadas.

## Arquitetura

- `src/pages`: páginas públicas e fluxo demonstrativo de agendamento.
- `src/components`: cabeçalho, marca e rodapé compartilhados.
- `src/data/mock.ts`: conteúdo fictício de serviços e profissionais enquanto o catálogo público não é conectado ao banco.
- `src/auth`: sessão, cadastro/login e proteção da área privada.
- `src/lib/supabase.ts`: cliente Supabase com chave publicável no navegador.
- `supabase/migrations`: esquema PostgreSQL multiempresa e políticas RLS versionados.
- `supabase/seed.sql`: dados fictícios para desenvolvimento.
- `src/styles.css`: identidade visual responsiva. Textos, cores e serviços podem ser personalizados.

## Requisitos e execução

Use Node.js 20.19+ ou 22.12+ e npm. Na pasta `codigo-fonte` do pacote:

```bash
npm install
npm run dev
```

Abra o endereço local informado pelo Vite. Para compilar: `npm run build`; para servir a compilação: `npm run preview`.

## Git

O repositório deste projeto já está configurado. Para publicar novas mudanças:

```bash
git add .
git commit -m "Descreve a alteração"
git push
```

## Etapa 2 — Supabase e autenticação

A base da etapa 2 está incluída:

- `supabase/migrations/20261013010000_initial_multi_tenant_schema.sql`: modelo multiempresa, relacionamentos, índices, estados de agendamento/pagamento, restrição contra horários sobrepostos, criação de perfil após cadastro e políticas RLS.
- `supabase/seed.sql`: catálogo Noir fictício e horários. Não cria usuários, profissionais, agendamentos nem pagamentos.
- `/entrar`: cadastro e login por Supabase Auth quando há credenciais configuradas.
- `/painel`: verifica sessão e vínculo ativo de equipe; o painel operacional completo será construído numa etapa posterior.

### Conectar um projeto Supabase

1. Crie um projeto Supabase e copie a Project URL e a chave publicável (`sb_publishable_...`).
2. Na raiz do projeto, copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Nunca coloque a secret/service-role key em variáveis `VITE_`.
3. Aplique a migração ao projeto remoto com o Supabase CLI:

   ```bash
   npx supabase login
   npx supabase link --project-ref SEU_PROJECT_REF
   npx supabase db push
   ```

4. Para carregar a barbearia e o catálogo de demonstração, execute `supabase/seed.sql` no SQL Editor do painel Supabase. O seed não é aplicado automaticamente por `db push`.
5. Reinicie o Vite (`npm run dev`) e crie sua conta em `/entrar`. Para vincular a primeira conta como proprietária, substitua o e-mail abaixo e execute este SQL no SQL Editor. A função `owner` só pode ser atribuída por um administrador confiável.

   ```sql
   insert into public.barbershop_members (barbershop_id, user_id, role, display_name)
   select shop.id, auth_user.id, 'owner', coalesce(auth_user.raw_user_meta_data ->> 'full_name', 'Proprietário')
   from public.barbershops shop
   cross join auth.users auth_user
   where shop.slug = 'noir-pinheiros'
     and auth_user.email = 'SEU_EMAIL'
   on conflict (barbershop_id, user_id) do update
     set role = 'owner', is_active = true;
   ```

O identificador da barbearia demo é `10000000-0000-4000-8000-000000000001`. O catálogo e horários públicos são somente leitura; dados de perfil são restritos ao usuário; operações de equipe verificam o vínculo à barbearia. A tabela pública de equipe não expõe o UUID do usuário.

## Limites atuais

Sem URL e chave configuradas, o site público segue com dados demonstrativos e `/entrar` mostra como configurar o Supabase. Com credenciais, cadastro e login são reais. A migração e o seed ainda não foram executados num projeto Supabase, pois as credenciais do projeto não foram fornecidas. O catálogo público ainda usa `src/data/mock.ts`; reservas públicas, Edge Functions, pagamento e painel administrativo virão nas próximas etapas.

Imagens do site são carregadas do Unsplash e precisam de internet.

## Roteiro do produto

1. **Concluída:** estrutura, identidade, navegação e experiência pública responsiva.
2. **Implementada no código:** esquema multiempresa, migrações, RLS e autenticação. Aplicar ao projeto Supabase requer as credenciais do proprietário.
3. Implementar disponibilidade no servidor, bloqueios, reservas temporárias e prevenção transacional de conflitos.
4. Integrar Mercado Pago por Edge Functions, validar webhooks e registrar idempotência e estados de pagamento.
5. Construir painel administrativo, histórico, relatórios e testes das regras de domínio.
6. Preparar implantação na Vercel e configuração por barbearia.

## Dependências principais

React, Vite, TypeScript, Tailwind CSS, React Router, Lucide e Supabase JS. Mercado Pago será integrado no servidor por Edge Functions; credenciais privadas não ficam no navegador.
