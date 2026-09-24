# 🚀 Dev Arena — Prompt & Logic

Plataforma de batalha de prompts e lógica de programação, onde participantes competem contra bots em desafios de **Engenharia de Prompts** e **Algoritmos**, com avaliação feita por IA (Gemini).

## 🎮 Como funciona

- **Prompt Arena**: você escreve um prompt para um desafio proposto e compete contra prompts de bots. Um juiz de IA avalia clareza, formatação e prevenção de alucinações.
- **Logic Arena**: você escreve uma solução de código para um desafio algorítmico e compete contra soluções de bots. Um "Tech Lead" de IA avalia correção, complexidade (Big-O) e clean code.
- Ao final, um pódio mostra o ranking com nota e feedback detalhado de cada submissão.

## 🛠️ Tecnologias

- HTML, CSS (Tailwind via CDN) e JavaScript puro no front-end
- Vercel Serverless Function (`/api/evaluate.js`) para chamar a API do Gemini com segurança
- Google Gemini API para avaliação das submissões

## 📁 Estrutura do projeto

```
dev-arena/
├── index.html          # Interface e lógica do front-end
├── api/
│   └── evaluate.js     # Function serverless que chama o Gemini
└── README.md
```

## ⚙️ Configuração

Este projeto precisa de uma API Key do Gemini para funcionar, obtida gratuitamente em [Google AI Studio](https://aistudio.google.com).

No painel do Vercel, em **Settings → Environment Variables**, adicione:

| Nome              | Valor                  |
|-------------------|------------------------|
| `GEMINI_API_KEY`  | sua chave do Gemini    |

> A chave nunca fica exposta no código do front-end — toda chamada à API do Gemini passa pela function serverless (`/api/evaluate.js`), que roda no servidor.

## 🚀 Deploy

Publicado via [Vercel](https://vercel.com). Basta importar este repositório e configurar a variável de ambiente acima antes do deploy.

**Link do deploy:** _(adicione aqui o link gerado pelo Vercel, ex: https://dev-arena.vercel.app)_

## 📌 Desenvolvido para

Projeto apresentado em evento de tecnologia, com foco em engenharia de prompts e lógica de programação.
