# Consolidador de Portifólio

Interface web para consolidação de carteira de investimentos, pronta para deploy na Vercel.

## Stack

- `Next.js` pronto para Vercel
- Processamento no navegador
- Rota diária para benchmarks com cache
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
4. O app publica a interface e a rota de benchmarks sem configuração extra.

## O que a interface faz

- Upload de planilha com normalização automática
- Inserção e edição manual apenas na visão geral
- Consolidação por classe, tipo de RF, instituição, emissor, indexador e ticker
- Alertas inteligentes, score e insights automáticos
- Benchmarks com variação de 1 mês e 12 meses
- Navegação por abas
- Destaque explícito para ativos com e sem FGC

## Observação

O motor foi desenhado para funcionar mesmo com dados incompletos. Se depois você quiser, a próxima etapa natural é conectar uma API/Supabase para persistência multiusuário e histórico.
