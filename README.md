# XML-Danfe

**Conversor XML → DANFE (PDF)** — 100% no navegador, sem cadastro e sem envio de arquivos.

Site: [https://silvioalbqrq.github.io/XML-Danfe/](https://silvioalbqrq.github.io/XML-Danfe/)

Repositório: [https://github.com/silvioalbqrq/XML-Danfe](https://github.com/silvioalbqrq/XML-Danfe)

## Funcionalidades

- Arraste ou selecione até **200 XMLs** de NF-e (modelo 55)
- Gera **DANFE em PDF** no layout oficial
- Download individual ou **ZIP com todos**
- Processamento **100% no cliente** (nada sobe para servidor)

## Como usar

1. Abra o site (ou `index.html` no navegador)
2. Clique na área pontilhada para selecionar os XMLs
3. Clique em **Gerar DANFEs**
4. Baixe os PDFs individualmente ou em ZIP

## GitHub Pages

Em **Settings → Pages**:
- Source: **Deploy from a branch**
- Branch: `main` / pasta `/` (root)

A URL fica: `https://silvioalbqrq.github.io/XML-Danfe/`

## Tecnologias

- [node-sped-pdf](https://github.com/kalmonv/node-sped-pdf) — geração do DANFE
- JSZip — compactação dos PDFs
- HTML/CSS/JS puro (sem build)

## Limitações

- Apenas **NF-e modelo 55**
- Até 200 arquivos por conversão
- O DANFE gerado é representação gráfica para conferência — o documento fiscal com validade jurídica é o XML

## Licença

MIT
