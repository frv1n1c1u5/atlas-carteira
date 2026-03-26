# Atlas Carteira

Interface web para consolidação de carteira de investimentos, pronta para deploy na Vercel.

## Stack

- `Next.js` com exportação estática
- Processamento no navegador
- Importação de `XLSX` e `CSV`

## Rodar localmente

```bash
npm install
npm run dev
```

## Build de produção

```bash
npm run build
```

## Deploy na Vercel

1. Suba este repositório para o GitHub.
2. Conecte o projeto na Vercel.
3. Use as configurações padrão do Next.js.
4. O app já exporta como conteúdo estático, então o deploy fica simples e rápido.

## O que a interface faz

- Upload de planilha com normalização automática
- Inserção e edição manual
- Consolidação por classe, instituição, emissor, indexador e ticker
- Alertas inteligentes, score e insights automáticos
- Benchmark visual e matriz de correlação estimada

## Observação

O motor foi desenhado para funcionar mesmo com dados incompletos. Se depois você quiser, a próxima etapa natural é conectar uma API/Supabase para persistência multiusuário e histórico.
