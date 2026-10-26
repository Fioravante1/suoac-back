/**
 * Política de senha compartilhada entre os DTOs que definem senha (criação de
 * usuário, aceite de convite, cadastro de circuito, redefinição por link e
 * troca de senha pelo próprio usuário).
 *
 * Exige de 12 a 100 caracteres, com ao menos uma letra minúscula, uma
 * maiúscula, um número e um símbolo. Símbolo é qualquer caractere que não seja
 * letra, número nem espaço — a expressão é Unicode, então letra acentuada conta
 * como letra, e a mesma regra roda igual no navegador (o frontend a espelha).
 *
 * Vale só para quem **define** senha. O login não aplica a política: quem
 * cadastrou senha de 8 caracteres antes da mudança precisa continuar entrando.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 100;

export const PASSWORD_LENGTH_MESSAGE = `A senha deve ter entre ${PASSWORD_MIN_LENGTH} e ${PASSWORD_MAX_LENGTH} caracteres`;

export const PASSWORD_COMPLEXITY_REGEX = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\p{L}\p{N}\s])/u;

export const PASSWORD_COMPLEXITY_MESSAGE =
  'A senha deve conter ao menos uma letra maiúscula, uma minúscula, um número e um símbolo';
