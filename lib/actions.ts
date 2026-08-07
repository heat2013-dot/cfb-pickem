"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { PICKERS } from "@/lib/pickers";

export async function setPick(
  gameId: number,
  picker: string,
  betType: "spread" | "total",
  side: string
) {
  if (!(PICKERS as readonly string[]).includes(picker)) {
    throw new Error("Invalid picker");
  }
  const validSides = betType === "spread" ? ["home", "away"] : ["over", "under"];
  if (!validSides.includes(side)) {
    throw new Error("Invalid pick");
  }

  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) throw new Error("Game not found");
  if (game.startDate.getTime() <= Date.now()) {
    throw new Error("Picks are locked once a game starts");
  }

  await prisma.pick.upsert({
    where: { gameId_picker: { gameId, picker } },
    create: { gameId, picker, betType, side },
    update: { betType, side },
  });

  revalidatePath("/");
}

export async function clearPick(gameId: number, picker: string) {
  if (!(PICKERS as readonly string[]).includes(picker)) {
    throw new Error("Invalid picker");
  }

  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) throw new Error("Game not found");
  if (game.startDate.getTime() <= Date.now()) {
    throw new Error("Picks are locked once a game starts");
  }

  await prisma.pick.deleteMany({ where: { gameId, picker } });

  revalidatePath("/");
}
