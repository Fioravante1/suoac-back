-- SUC-101: tipo de evento "Outro", oferecido pelo formulário novo de evento.
--
-- Aditiva: só acrescenta o valor ao enum, sem reescrever nenhuma linha.
--
-- A ordem de deploy NÃO é livre. O front anterior só mostra o seletor de dias para
-- congresso regional e não conhece o rótulo de OTHER: num evento OTHER de vários dias
-- ninguém consegue se inscrever, e o tipo aparece como "undefined". Publicar o front
-- do SUC-101 antes ou junto com esta API. Reverter a API depois que existirem eventos
-- OTHER também quebra: o PDF e o recibo da versão anterior saem com "undefined".

-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'OTHER';
