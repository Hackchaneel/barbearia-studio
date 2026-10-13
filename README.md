# Noir — Barbearia contemporânea

Plataforma comercial reutilizável para barbearias. A experiência pública da Etapa 1 e a base de dados e autenticação da Etapa 2 estão implementadas.

## Arquitetura

- `src/pages`: páginas públicas e fluxo demonstrativo de agendamento.
- `src/components`: cabeçalho, marca e rodapé compartilhados.
- `src/data/mock.ts`: catálogo demonstrativo usado quando o Supabase não está configurado; profissionais ainda aguardam a gestão da equipe.
- `src/auth`: sessão, cadastro/login e proteção da área privada.
- `src/auth/ServicesManager.tsx`: cadastro, edição e ativação de serviços para proprietários e gerentes.
- `src/auth/TeamManager.tsx`: vínculo de profissionais, serviços atendidos e jornada semanal individual.
- `src/lib/supabase.ts`: cliente Supabase com chave publicável no navegador.
- `supabase/migrations`: esquema PostgreSQL multiempresa e políticas RLS versionados.
- `supabase/migrations/20261013050000_manage_appointment_status.sql`: transições autorizadas de status e histórico de atendimentos, executadas no banco.
- `supabase/migrations/20261013060000_manage_barbershop_team.sql`: operações seguras para vincular e editar profissionais e substituir suas associações de serviços.
- `supabase/migrations/20261013070000_manual_appointments.sql`: criação transacional de agendamentos presenciais/por telefone, validando permissões e disponibilidade no banco.
- `supabase/seed.sql`: dados fictícios para desenvolvimento.
- `supabase/functions/create-appointment-hold`: endpoint da Edge Function para reservar horários temporariamente.
- `supabase/functions/create-payment-checkout` e `supabase/functions/mercado-pago-webhook`: Checkout Pro e confirmação de pagamentos no servidor.
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

Sem URL e chave configuradas, o site público segue com dados demonstrativos e `/entrar` mostra como configurar o Supabase. Com credenciais e migrações aplicadas, o agendamento consulta disponibilidade real e abre o Checkout Pro. O painel já tem visão geral e agenda semanal somente para leitura; ações de edição, bloqueios, cadastros e relatórios detalhados ainda serão implementados.

Imagens do site são carregadas do Unsplash e precisam de internet.

## Roteiro do produto

1. **Concluída:** estrutura, identidade, navegação e experiência pública responsiva.
2. **Implementada no código:** esquema multiempresa, migrações, RLS e autenticação. Aplicar ao projeto Supabase requer as credenciais do proprietário.
3. **Implementada no código:** disponibilidade, bloqueios, reservas temporárias, prevenção transacional de conflitos e integração do formulário com RPC/Edge Function. Aplicar e publicar no Supabase e cadastrar profissionais continuam pendentes.
4. **Integração escrita no código:** Checkout Pro, assinatura de webhook, consulta do pagamento no Mercado Pago, idempotência local e transições protegidas de pagamento. Configurar credenciais, publicar e validar com conta de teste continuam pendentes.
5. **Em andamento:** dashboard, agenda semanal, bloqueios, ações de cancelar/concluir atendimentos, gestão de serviços e equipe. Cadastro manual de agendamentos está implementado; faltam histórico detalhado, relatórios e validação das regras de domínio.
6. Preparar implantação na Vercel e configuração por barbearia.

## Dependências principais

React, Vite, TypeScript, Tailwind CSS, React Router, Lucide e Supabase JS. Mercado Pago será integrado no servidor por Edge Functions; credenciais privadas não ficam no navegador.

## Publicação automática sem `npm run dev`

O projeto já está preparado para implantação na Vercel, incluindo fallback de rotas do React Router em `vercel.json`. Para configurar uma vez:

1. Entre na Vercel usando sua conta GitHub e importe `Hackchaneel/barbearia-studio`.
2. Confirme a raiz do projeto como a raiz do repositório. O Vite deve ser detectado automaticamente; os valores são `npm run build` para build e `dist` para saída.
3. Clique em Deploy. A Vercel publica uma URL para o site.

Depois disso, cada `git push` na branch principal dispara um novo build e publicação. Você não precisa rodar `npm run dev` para ver a versão online; use esse comando apenas quando quiser uma prévia local durante o desenvolvimento. Quando conectar o Supabase, cadastre também `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` nas variáveis de ambiente do projeto Vercel.

### Reservas e disponibilidade (Etapa 3)

- Aplique as migrações no Supabase com `npx supabase db push`.
- Publique o endpoint com `npx supabase functions deploy create-appointment-hold`.
- A Edge Function usa `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` do ambiente gerenciado pelo Supabase. A chave privada não deve ser adicionada ao Vite nem à Vercel.
- O RPC `get_available_slots` considera serviços associados, profissionais públicos, jornada padrão ou individual, pausas, bloqueios, atendimentos existentes, duração, intervalo e fuso da barbearia.
- A reserva é criada no servidor, vale pelo prazo `reservation_minutes` e valida o horário de novo. Uma restrição do PostgreSQL impede sobreposição mesmo em pedidos simultâneos.
- Para haver horários, cadastre profissionais públicos em `barbershop_members`, associe-os em `barber_services` e configure `business_hours`. O seed atual não cria profissionais.
- Com as credenciais, a migração, o catálogo e a Edge Function ativos, o formulário consulta a agenda e cria uma reserva temporária real. Sem esses pré-requisitos, ele permanece identificado como demonstrativo.
- A confirmação do pagamento depende de credenciais, publicação das funções e configuração do webhook no painel Mercado Pago.

### Mercado Pago (Etapa 4)

- A migração adiciona preferências de checkout, uma intenção de pagamento única por agendamento e funções transacionais para preparar o checkout e reconciliar eventos.
- `create-payment-checkout` cria a preferência do Checkout Pro no servidor. O valor é obtido do agendamento no banco, e a validade da preferência acompanha a expiração da reserva.
- `mercado-pago-webhook` valida `x-signature` por HMAC-SHA256, consulta o pagamento diretamente na API do Mercado Pago e compara referência, valor e moeda antes de registrar o status.
- Somente o webhook validado pode marcar o agendamento como confirmado. A página de retorno do Checkout Pro não é tratada como prova de pagamento.
- Configure os secrets `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET` e `PUBLIC_SITE_URL` em **Supabase → Edge Functions → Secrets**. Use primeiro credenciais de teste.
- Publique com `npx supabase functions deploy create-payment-checkout` e `npx supabase functions deploy mercado-pago-webhook`. Configure a URL de webhook no painel do Mercado Pago para `https://SEU_PROJECT_REF.supabase.co/functions/v1/mercado-pago-webhook` e habilite eventos de pagamento.
- Configure as URLs de retorno para o domínio do site usado em `PUBLIC_SITE_URL`. Nunca salve o Access Token ou o segredo do webhook em variáveis `VITE_` ou no Git.
- Se um pagamento for aprovado depois que a reserva expirou, o sistema registra `payment_approved_after_hold` e não confirma um horário que pode ter sido ocupado; esse caso exige revisão operacional.

### Painel administrativo (Etapa 5, primeira parte)

- Acesse `/painel` com uma conta autenticada vinculada à barbearia.
- Proprietários e gerentes veem agenda, pagamentos pendentes e recebimentos aprovados do dia. Barbeiros veem somente seus próprios atendimentos, conforme RLS.
- O painel permite alternar entre resumo e agenda dos próximos sete dias, além de atualizar os dados manualmente.
- Proprietários e gerentes podem cadastrar e remover bloqueios por dia inteiro ou intervalo, para toda a equipe ou um barbeiro específico. Os horários são salvos em UTC com referência ao fuso de Brasília.
- A equipe pode cancelar atendimentos futuros e marcar como concluídos apenas atendimentos confirmados cujo horário final já passou. As mudanças são autorizadas no banco e registradas em `appointment_events`.
- Cancelar um atendimento pago não processa reembolso automaticamente; o estorno precisa ser feito no Mercado Pago.
- Proprietários e gerentes podem criar, editar, ativar e desativar serviços. O site público e o fluxo de agendamento leem o catálogo ativo do Supabase quando conectado.
- Proprietários e gerentes podem vincular uma conta Supabase com e-mail confirmado como barbeiro, editar o perfil, associar serviços e configurar a jornada individual. O profissional precisa criar a própria conta em `/entrar`; o painel não envia convite por e-mail.
- Profissionais ativos e públicos aparecem na página inicial e no agendamento. Para haver horários, configure serviços e jornada semanal.
- Proprietários, gerentes e barbeiros podem criar agendamentos presenciais ou recebidos por telefone em **Novo agendamento** no painel. O sistema confirma o horário escolhido e grava os dados do cliente e observações.
- Agendamentos manuais usam o valor atual do serviço e ficam confirmados imediatamente. Pagamentos recebidos no local ainda não são lançados na tabela de pagamentos; os indicadores de recebimentos refletem apenas pagamentos aprovados pelo provedor online.
- O dashboard precisa das migrações de Supabase e de dados reais; o seed demo não cria membros nem agendamentos.
