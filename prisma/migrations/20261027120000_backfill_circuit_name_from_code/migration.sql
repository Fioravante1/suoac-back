-- SUC-60 (passo 1 do contract): `circuits.name` passa a ser o unico identificador.
--
-- So dados, nenhuma mudanca de estrutura. Compativel com a versao anterior da
-- aplicacao, que le `code ?? name` e grava os dois com o mesmo valor: depois do
-- backfill, `code` e `name` coincidem e ela nao percebe a diferenca.
--
-- Se alguma linha legada colidir com o `name` de outro circuito, o UPDATE viola
-- `circuits_name_key`, a migration falha e o Railway aborta o deploy com a versao
-- anterior ainda servindo. Nada fica pela metade: a instrucao e atomica.
--
-- A coluna e o indice de `code` ficam para o passo 2, num deploy posterior a este.
-- Reversao: nao ha; o valor anterior de `name` nao e guardado e nada mais o le.

UPDATE "circuits" SET "name" = "code" WHERE "code" IS NOT NULL AND "name" <> "code";
