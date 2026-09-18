import bcrypt from 'bcryptjs';

function bcryptRounds(): number {
  const raw = Number(process.env.BCRYPT_ROUNDS ?? 12);
  return Number.isInteger(raw) && raw >= 4 && raw <= 15 ? raw : 12;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(bcryptRounds());
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
