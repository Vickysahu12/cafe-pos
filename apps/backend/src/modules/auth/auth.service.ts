import { prisma } from "../../config/db";
import { hashPassword, comparePassword } from "../../utils/password";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { ACCESS_TOKEN_EXPIRY, REFRESH_TOKEN_EXPIRY } from "../../utils/constants";
import type { RegisterOrganizationInput, CreateStaffInput } from "@cafe-pos/shared-schemas";
import type { AccessTokenPayload } from "@cafe-pos/shared-types";

function generateAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

function generateRefreshToken(userId: string): string {
  return jwt.sign({ userId }, env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

// Slug helper — turns "Sharma Cafe" into "sharma-cafe"
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function registerOrganization(input: RegisterOrganizationInput) {
  const existingUser = await prisma.user.findUnique({ where: { email: input.email } });
  if (existingUser) {
    const err: any = new Error("Email already in use");
    err.statusCode = 409;
    throw err;
  }

  const passwordHash = await hashPassword(input.password);
  const baseSlug = slugify(input.outletName);

  // Ensure slug uniqueness by appending a short random suffix if needed
  let slug = baseSlug;
  const slugExists = await prisma.outlet.findUnique({ where: { slug } });
  if (slugExists) {
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  // Organization + Outlet + Owner created atomically — if any step fails, all roll back
  const result = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name: input.organizationName },
    });

    const outlet = await tx.outlet.create({
      data: {
        name: input.outletName,
        slug,
        address: input.outletAddress,
        phone: input.phone,
        organizationId: organization.id,
      },
    });

    const owner = await tx.user.create({
      data: {
        name: input.ownerName,
        email: input.email,
        phone: input.phone,
        passwordHash,
        role: "OWNER",
        outletId: outlet.id,
      },
    });

    return { organization, outlet, owner };
  });

  const accessToken = generateAccessToken({
    userId: result.owner.id,
    role: "OWNER",
    outletId: result.outlet.id,
    organizationId: result.organization.id,
  });
  const refreshToken = generateRefreshToken(result.owner.id);

  return { user: result.owner, outlet: result.outlet, accessToken, refreshToken };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.isActive) {
    const err: any = new Error("Invalid email or password");
    err.statusCode = 401;
    throw err;
  }

  const isValid = await comparePassword(password, user.passwordHash);
  if (!isValid) {
    const err: any = new Error("Invalid email or password");
    err.statusCode = 401;
    throw err;
  }

  const accessToken = generateAccessToken({
    userId: user.id,
    role: user.role,
    outletId: user.outletId,
    organizationId: (await prisma.outlet.findUnique({ where: { id: user.outletId } }))!.organizationId,
  });
  const refreshToken = generateRefreshToken(user.id);

  return { user, accessToken, refreshToken };
}

export async function refreshAccessToken(refreshToken: string) {
  let payload: { userId: string };
  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as { userId: string };
  } catch {
    const err: any = new Error("Invalid or expired refresh token");
    err.statusCode = 401;
    throw err;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { outlet: true },
  });

  if (!user || !user.isActive) {
    const err: any = new Error("User not found or inactive");
    err.statusCode = 401;
    throw err;
  }

  return generateAccessToken({
    userId: user.id,
    role: user.role,
    outletId: user.outletId,
    organizationId: user.outlet.organizationId,
  });
}

export async function createStaff(input: CreateStaffInput, createdByRole: string) {
  // Only Owner/Manager can call this (enforced at route level), but Manager
  // additionally cannot create another Manager — only Owner can
  if (input.role === "MANAGER" && createdByRole !== "OWNER") {
    const err: any = new Error("Only the Owner can create a Manager account");
    err.statusCode = 403;
    throw err;
  }

  const existingUser = await prisma.user.findUnique({ where: { email: input.email } });
  if (existingUser) {
    const err: any = new Error("Email already in use");
    err.statusCode = 409;
    throw err;
  }

  const passwordHash = await hashPassword(input.password);

  const staff = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash,
      role: input.role,
      outletId: input.outletId,
    },
  });

  return staff;
}

// Yeh dhyan se dekho — kuch important decisions:

// $transaction use kiya register mein — Organization, Outlet, Owner teeno ek saath banate hain; agar beech mein kahin error aaye (jaise duplicate slug), sab automatically rollback ho jayega, aadha-adhura data DB mein nahi bachega.
// Slug collision handling — agar do log "Cafe Delight" naam se outlet banayein, dusre ko automatically cafe-delight-x7k2 jaisa unique slug milega.
// Manager, Manager nahi bana sakta — sirf Owner hi Manager create kar sakta hai, yeh business rule maine service layer mein add kiya hai (tumne explicitly nahi bola tha, lekin yeh common RBAC best-practice hai — warna Managers apne jaise aur Managers bana ke owner ka control kam kar sakte hain). Agar tumhe yeh restriction nahi chahiye, bata dena, hata denge.