import { PrismaService } from '../../infra/prisma/prisma.service';

/** True when the two people have been in a match together (either side). */
export async function haveMet(prisma: PrismaService, a: string, b: string): Promise<boolean> {
  return (await prisma.match.count({ where: { OR: [{ userAId: a, userBId: b }, { userAId: b, userBId: a }] } })) > 0;
}
