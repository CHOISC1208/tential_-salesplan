import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const allocationSchema = z.object({
  hierarchyPath: z.string(),
  level: z.number().int().positive(),
  percentage: z.number().min(0).max(100),
  amount: z.number().int().nonnegative(),
  quantity: z.number().int().nonnegative()
})

const allocationsUpdateSchema = z.object({
  allocations: z.array(allocationSchema)
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params

    // Verify session belongs to user
    const budgetSession = await prisma.session.findFirst({
      where: {
        id,
        category: {
          userId: session.user.id
        }
      }
    })

    if (!budgetSession) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    const allocations = await prisma.allocation.findMany({
      where: { sessionId: id },
      orderBy: [{ level: 'asc' }, { hierarchyPath: 'asc' }]
    })

    return NextResponse.json(
      allocations.map(a => ({
        ...a,
        percentage: parseFloat(a.percentage.toString()),
        amount: a.amount.toString()
      }))
    )
  } catch (error) {
    console.error('Error fetching allocations:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params

    // Verify session belongs to user
    const budgetSession = await prisma.session.findFirst({
      where: {
        id,
        category: {
          userId: session.user.id
        }
      }
    })

    if (!budgetSession) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { allocations } = allocationsUpdateSchema.parse(body)

    // Delete existing allocations and create new ones
    await prisma.allocation.deleteMany({
      where: { sessionId: id }
    })

    const allocationRecords = allocations.map(a => ({
      sessionId: id,
      hierarchyPath: a.hierarchyPath,
      level: a.level,
      percentage: a.percentage,
      amount: BigInt(a.amount),
      quantity: a.quantity
    }))

    await prisma.allocation.createMany({
      data: allocationRecords
    })

    return NextResponse.json({ success: true, updated: allocations.length })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error updating allocations:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
