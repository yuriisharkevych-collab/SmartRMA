/**
 * Jednorazowy skrypt developerski — ustawia NOWE hasło istniejącemu kontu
 * w lokalnej bazie, gdy hasło zostało zapomniane i nie da się zalogować,
 * by użyć wbudowanego resetu (który wymaga bycia już zalogowanym jako
 * administrator). Hasuje przez `bcrypt`, dokładnie jak `PasswordService`.
 *
 * Użycie:
 *   npx ts-node prisma/scripts/set-password.ts <email> <noweHaslo>
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

async function main() {
  const [email, newPassword] = process.argv.slice(2);
  if (!email || !newPassword) {
    console.error('Użycie: npx ts-node prisma/scripts/set-password.ts <email> <noweHaslo>');
    process.exit(1);
  }
  if (newPassword.length < 8) {
    console.error('Hasło musi mieć co najmniej 8 znaków (AUTH-004).');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst({ where: { email, loginMethod: 'Password' } });
    if (!user) {
      console.error(`Nie znaleziono konta logującego się hasłem o adresie e-mail: ${email}`);
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    console.log(`Hasło ustawione. Zaloguj się jako "${email}" nowym hasłem.`);
  } finally {
    await prisma.$disconnect();
  }
}

main();
