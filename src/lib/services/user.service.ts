import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { UserRole, AuditAction } from '@prisma/client'

export interface CreateUserData {
  email: string
  password: string
  name?: string
  phone?: string
  role?: UserRole
}

export interface UpdateUserData {
  name?: string
  phone?: string
  avatar?: string
}

export class UserService {
  static async createUser(data: CreateUserData, createdBy?: string) {
    const normalizedEmail = data.email.trim().toLowerCase()

    const existingUser = await db.user.findUnique({
      where: { email: normalizedEmail },
    })

    if (existingUser) {
      throw new Error('User with this email already exists')
    }

    const passwordHash = await bcrypt.hash(data.password, 12)

    const user = await db.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: data.name,
        phone: data.phone,
        role: data.role || UserRole.CUSTOMER,
      },
    })

    await db.auditLog.create({
      data: {
        userId: createdBy || user.id,
        action: AuditAction.USER_REGISTER,
        entityType: 'User',
        entityId: user.id,
        description: `User registered with email ${user.email}`,
      },
    })

    return user
  }

  static async getUserById(id: string) {
    return db.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        avatar: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })
  }

  static async getUserByEmail(email: string) {
    return db.user.findUnique({
      where: { email },
    })
  }

  static async updateUser(id: string, data: UpdateUserData) {
    const user = await db.user.update({
      where: { id },
      data,
    })

    await db.auditLog.create({
      data: {
        userId: id,
        action: AuditAction.USER_PROFILE_UPDATE,
        entityType: 'User',
        entityId: id,
        description: 'User profile updated',
        newValues: JSON.stringify(data),
      },
    })

    return user
  }

  static async changePassword(id: string, currentPassword: string, newPassword: string) {
    const user = await db.user.findUnique({ where: { id } })

    if (!user || !user.passwordHash) {
      throw new Error('User not found')
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash)

    if (!isValid) {
      throw new Error('Current password is incorrect')
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)

    await db.user.update({
      where: { id },
      data: { passwordHash },
    })

    await db.auditLog.create({
      data: {
        userId: id,
        action: AuditAction.USER_PASSWORD_CHANGE,
        entityType: 'User',
        entityId: id,
        description: 'Password changed successfully',
      },
    })
  }

  static async createAdminUser(data: CreateUserData) {
    return this.createUser({ ...data, role: UserRole.ADMIN })
  }

  static async getAllUsers(params: {
    page?: number
    limit?: number
    role?: UserRole
    search?: string
  }) {
    const { page = 1, limit = 20, role, search } = params
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {}

    if (role) {
      where.role = role
    }

    if (search) {
      where.OR = [
        { email: { contains: search } },
        { name: { contains: search } },
      ]
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          avatar: true,
          role: true,
          isActive: true,
          createdAt: true,
          _count: {
            select: { bookings: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.user.count({ where }),
    ])

    return {
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }

  static async deactivateUser(id: string) {
    return db.user.update({
      where: { id },
      data: { isActive: false },
    })
  }

  static async activateUser(id: string) {
    return db.user.update({
      where: { id },
      data: { isActive: true },
    })
  }
}
