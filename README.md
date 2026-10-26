# Frameo

Extensão de navegador para ajustar o enquadramento e a velocidade de vídeos e abrir o vídeo em uma janela flutuante (Picture-in-Picture).

## Recursos

- Cinco enquadramentos: original, tela cheia, estendida, preencher largura e preencher altura.
- Velocidade de reprodução de 0,5× a 2×, com preferência salva.
- Vídeo flutuante para players e navegadores compatíveis.
- Controle para ativar ou desativar os ajustes, temas claro e escuro e dicas nos controles.

As preferências são salvas localmente pelo navegador. Com a extensão ativada, elas são aplicadas aos vídeos detectados nas páginas abertas.

## Instalação para desenvolvimento

### Chrome e navegadores compatíveis

1. Baixe ou clone este repositório.
2. Abra a página de extensões do navegador e ative o modo de desenvolvedor.
3. Escolha **Carregar sem compactação** e selecione a pasta do projeto.
4. Abra uma página com vídeo, inicie a reprodução e clique no ícone do Frameo.

### Safari no macOS

O Safari usa um aplicativo que contém a extensão. Para desenvolvimento, converta o projeto com o conversor de extensões do Safari fornecido pelo Xcode, abra o projeto gerado no Xcode e execute o aplicativo. Depois, habilite a extensão nas configurações do Safari. O carregamento de uma extensão não assinada pode exigir a opção de desenvolvimento correspondente no Safari.

## Como usar

Abra um vídeo na aba atual, dê play e abra o menu do Frameo. Escolha o enquadramento e a velocidade. O botão no cabeçalho abre ou fecha o vídeo flutuante. Se o vídeo ainda não aparecer no menu, clique em **Verificar novamente**.

A chave no cabeçalho desativa os ajustes; as preferências permanecem salvas para quando a extensão for ativada novamente.

## Limitações

- O enquadramento ajusta a proporção do vídeo em relação ao player; não detecta automaticamente barras pretas incorporadas à imagem.
- O PiP nativo utiliza a proporção original do vídeo. A velocidade continua associada ao vídeo, mas o zoom e o alongamento do player não são aplicados à janela flutuante.
- Alguns sites, players, vídeos protegidos ou navegadores podem impedir ajustes ou Picture-in-Picture. O Safari pode exigir uma interação com o player, como play ou pausa, antes de abrir o PiP.
- O funcionamento depende do acesso da extensão à página e da presença de um elemento de vídeo acessível.

## Permissões

- **Acesso aos sites:** detectar vídeos e aplicar os ajustes em páginas e players incorporados.
- **Armazenamento:** guardar as preferências no navegador.
- **Aba ativa e execução de scripts:** localizar o vídeo e acionar o Picture-in-Picture na aba atual.

## Testes

Com Node.js instalado, execute:

```sh
node --test tests/*.test.cjs
```

Os testes automatizados usam APIs simuladas; teste também nos navegadores e serviços de vídeo que pretende utilizar.
