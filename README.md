# Noir — Barbearia contemporânea

Projeto inicial de uma plataforma comercial reutilizável para barbearias. Esta entrega cobre a **Etapa 1: experiência pública e identidade visual**, com conteúdo fictício e navegação funcional no frontend.

## Arquitetura e estrutura

- `src/pages`: páginas públicas (início, serviços e fluxo demonstrativo de agendamento).
- `src/components`: cabeçalho, marca e rodapé compartilhados.
- `src/data/mock.ts`: dados fictícios centralizados para serviços e profissionais.
- `src/styles.css`: identidade visual responsiva e componentes estilizados com Tailwind CSS disponível no projeto.
- `public`: arquivos estáticos.
- Etapas futuras: Supabase/PostgreSQL e RLS, Edge Functions para disponibilidade/reservas, Supabase Auth e Mercado Pago com validação no servidor.

A identidade usa variáveis CSS em `src/styles.css`; textos e serviços estão em `src/data/mock.ts`. A marca atual é uma demonstração chamada Noir e pode ser personalizada nesses pontos.

## Requisitos

Node.js 20.19+ ou 22.12+ e npm.

## Rodar no VS Code

1. Extraia o ZIP e abra a pasta `barbearia-studio` no VS Code.
2. No terminal integrado, execute:

   ```bash
   npm install
   npm run dev
   ```

3. Abra o endereço local mostrado pelo Vite (normalmente `http://localhost:5173`).
4. Para conferir a versão de produção localmente: `npm run build` e depois `npm run preview`.

## Git

Na pasta do projeto:

```bash
git init
git add .
git commit -m "Inicia site da barbearia Noir"
```

Para conectar ao GitHub, crie um repositório vazio e execute os comandos de `git remote add origin ...` e `git push -u origin main` indicados pelo GitHub.

## O que funciona nesta versão

- Navegação responsiva e páginas públicas Início, Serviços e Agendar.
- Fluxo de seleção de serviço, profissional, data e horário, com resumo atualizado na tela.
- Confirmação explicitamente identificada como demonstração.

## Limites desta etapa

- Serviços, preços, equipe e disponibilidade são dados fictícios locais.
- O formulário não envia nem armazena informações; não cria reserva e não confirma pagamento.
- Não há painel administrativo, login, banco de dados ou integração com Mercado Pago ainda.
- As imagens da galeria vêm de URLs do Unsplash e precisam de internet para carregar.
- `.env.example` documenta variáveis previstas para etapas futuras. Nenhuma chave é necessária para esta entrega.

## Roteiro do produto

1. **Concluída nesta entrega:** scaffold, identidade, navegação e experiência pública responsiva demonstrativa.
2. Configurar Supabase, modelo multiempresa, migrações, RLS, dados e autenticação por papel.
3. Implementar disponibilidade validada no servidor, bloqueios, reserva temporária e prevenção transacional de conflitos.
4. Integrar Mercado Pago por Edge Functions, webhooks validados, idempotência e estados de pagamento.
5. Construir painel administrativo, histórico, relatórios e testes automatizados das regras de domínio.
6. Preparar implantação na Vercel e configuração por barbearia.

## Dependências principais

React, Vite, TypeScript, Tailwind CSS, React Router e Lucide. Supabase e Mercado Pago serão adicionados nas etapas correspondentes, mantendo credenciais privadas fora do navegador.
