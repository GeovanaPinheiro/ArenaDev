# 🚀 Dev Arena — Prompt & Logic

Plataforma de batalha de prompts e lógica de programação, onde participantes competem contra bots em desafios de **Engenharia de Prompts** e **Algoritmos**, com avaliação feita por IA (Gemini).

## 🎮 Como funciona

- **Prompt Arena**: você escreve um prompt para um desafio proposto e compete contra prompts de bots. Um juiz de IA avalia clareza, formatação e prevenção de alucinações.
- **Logic Arena**: você escreve uma solução de código para um desafio algorítmico e compete contra soluções de bots. Um "Tech Lead" de IA avalia correção, complexidade (Big-O) e clean code.
- Ao final, um pódio mostra o ranking com nota e feedback detalhado de cada submissão.
- A entrada pede o nome do participante e o placar global mantém a melhor nota de cada nome.
- A avaliação usa a Interactions API do Gemini 3.8 Flash e alterna para Gemini Flash-Lite se o serviço principal estiver temporariamente indisponível.

## 🛠️ Tecnologias

- HTML, CSS (Tailwind via CDN) e JavaScript puro no front-end
- Vercel Serverless Function (`/api/evaluate.js`) para chamar a API do Gemini com segurança
- Vercel Serverless Function (`/api/leaderboard.js`) para manter o placar global com Upstash Redis
- Google Gemini API para avaliação das submissões

## 📁 Estrutura do projeto

```
dev-arena/
├── index.html          # Interface e lógica do front-end
├── api/
│   ├── evaluate.js     # Function serverless que chama o Gemini
│   └── leaderboard.js  # Function serverless do placar global
├── images/             # Ícones e assets da aplicação
├── README.md
└── package.json (se aplicável)
```

## ⚙️ Configuração

Este projeto precisa de uma API Key do Gemini e, opcionalmente, uma conexão com Upstash Redis para o placar global.

No painel do Vercel, em **Settings → Environment Variables**, adicione:

| Nome | Valor |
|------|-------|
| `GEMINI_API_KEY` | sua chave do Gemini |
| `UPSTASH_REDIS_REST_URL` | URL REST do seu banco Upstash |
| `UPSTASH_REDIS_REST_TOKEN` | Token REST do seu banco Upstash |

> A chave nunca fica exposta no código do front-end — toda chamada à API do Gemini passa pela function serverless (`/api/evaluate.js`), que roda no servidor.
> O placar global usa Upstash Redis. Se sua integração da Vercel fornecer `KV_REST_API_URL` e `KV_REST_API_TOKEN`, a API também aceita esses nomes.

## 🚀 Deploy

Publicado via [Vercel](https://vercel.com). Basta importar este repositório e configurar as variáveis de ambiente antes do deploy.

**Link do deploy:** _(adicione aqui o link gerado pelo Vercel, ex: https://dev-arena.vercel.app)_

## 📌 Desenvolvido para

Projeto apresentado em evento de tecnologia, com foco em engenharia de prompts e lógica de programação.
