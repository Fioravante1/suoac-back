-- SUC-48: e-mail de usuario sempre em minusculas, garantido pelo banco.
--
-- `users.email` e unico, mas a unicidade do Postgres diferencia maiusculas, entao
-- "Fulano@x.com" e "fulano@x.com" eram duas contas possiveis, e quem digitava com
-- outra caixa nao era encontrado no login. A partir daqui o dado e normalizado na
-- escrita (DTOs e UsersService) e o banco recusa o que escapar disso.
--
-- Ordem das etapas:
--   1. Checagem previa: se duas contas diferirem so na caixa, o backfill colidiria
--      no indice unico. Em vez de falhar com um erro de unicidade sem contexto, a
--      migration aborta listando os e-mails, e o pre-deploy da Railway cancela
--      (a versao anterior segue servindo). Decidir qual conta sobrevive e tratar
--      antes de rodar de novo.
--   2. Backfill para minusculas.
--   3. CHECK que mantem o invariante. Com ele, o indice `users_email_key` ja
--      existente passa a valer sem diferenciar caixa, e a busca por igualdade usa o
--      indice. Nenhum indice novo.
--
-- Janela de deploy: ate a versao nova subir, a versao anterior ainda serve. Nesse
-- intervalo, um login digitado com maiusculas, de conta que tinha maiusculas, nao
-- acha a conta, e um POST /users com maiusculas esbarra no CHECK. A janela e de
-- um ou dois minutos num fluxo de uso baixo.

DO $$
DECLARE
  colliding text;
BEGIN
  SELECT string_agg(lower_email, ', ' ORDER BY lower_email)
    INTO colliding
    FROM (
      SELECT lower(email) AS lower_email
        FROM users
       GROUP BY lower(email)
      HAVING count(*) > 1
    ) AS duplicated;

  IF colliding IS NOT NULL THEN
    RAISE EXCEPTION 'SUC-48: contas com e-mails que diferem so na caixa: %. Decida qual conta sobrevive e corrija antes de normalizar.', colliding;
  END IF;
END
$$;

UPDATE "users" SET "email" = lower("email") WHERE "email" <> lower("email");

ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase_check" CHECK ("email" = lower("email"));
