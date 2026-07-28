# Plano de corte e rollback

## Corte

1. Manter `ditygnxttjvlfrdpvaxe` intacto.
2. Aplicar e validar o schema em `cctygrudsyoowuotlyfo`.
3. Criar o administrador no Auth novo e o respectivo perfil.
4. Configurar secrets, Vault e funções.
5. Confirmar três sincronizações consecutivas.
6. Validar login, dashboards e rota anônima.
7. Atualizar chave publicável, Auth URLs e publicar o front-end.
8. Monitorar por pelo menos um plantão.

## Rollback

Restaurar a URL e a chave publicável anteriores na hospedagem e republicar a
versão anterior do front-end. Não apagar dados do novo projeto; preservar tudo
para conciliação. O projeto antigo só poderá ser desativado após aceite da
operação e backup válido.
