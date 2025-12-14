import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const sessionSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1).max(200),
  totalBudget: z.number().int().positive()
})

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const categoryId = searchParams.get('categoryId')

    const where = categoryId ? { categoryId } : {}

    const sessions = await prisma.session.findMany({
      where,
      include: {
        category: true
      },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json(
      sessions.map(s => ({
        ...s,
        totalBudget: s.totalBudget.toString()
      }))
    )
  } catch (error) {
    console.error('Error fetching sessions:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const authSession = await getServerSession(authOptions)

    if (!authSession?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { categoryId, name, totalBudget } = sessionSchema.parse(body)

    // Verify category exists
    const category = await prisma.category.findUnique({
      where: { id: categoryId }
    })

    if (!category) {
      return NextResponse.json(
        { error: 'Category not found' },
        { status: 404 }
      )
    }

    const newSession = await prisma.session.create({
      data: {
        categoryId,
        name,
        totalBudget: BigInt(totalBudget),
        status: 'draft'
      },
      include: {
        category: true
      }
    })

    return NextResponse.json(
      {
        ...newSession,
        totalBudget: newSession.totalBudget.toString()
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error creating session:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
