# Foto Fiel

Aplicativo de fotografia em português. Melhoria não generativa, estilos globais/seletivos e downloads em resolução original. Processamento no navegador; fotografias não são enviadas ao GitHub.

## Publicação

GitHub Pages com GitHub Actions, saída apenas de `_site/`. O build baixa versões fixas de TensorFlow.js/BodyPix e confere SHA-256 com o pacote revisado. Nenhuma fotografia, credencial ou evidência de teste integra o repositório ou o site.

## Desenvolvimento

Node.js 24 LTS. `node scripts/build-pages.mjs` gera o site. Use um servidor estático para testar `_site/`.

O site é público, conforme autorização do proprietário. O código e os arquivos do aplicativo podem ser vistos por qualquer visitante. O navegador baixa o modelo de aproximadamente 48 MB quando necessário; esse download não envia fotografias. Limites de memória e qualidade da segmentação variam por dispositivo.

Bibliotecas e modelo: licenças distribuídas em `vendor/` na versão publicada.
