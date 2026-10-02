// Aturan sandi = Supabase Auth (config.toml: minimum_password_length 8, password_requirements "letters_digits").
export const PASSWORD_HINT = "Minimal 8 karakter, berisi huruf dan angka.";
export const passwordError = (pw: string) =>
  pw.length < 8 || !/[a-z]/i.test(pw) || !/\d/.test(pw) ? `Kata sandi terlalu lemah. ${PASSWORD_HINT}` : null;
