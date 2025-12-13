import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const updateSessionSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  totalBudget: z.number().int().positive().optional(),
  status: z.enum(['draft', 'confirmed', 'archived']).optional()
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

    const budgetSession = await prisma.session.findFirst({
      where: {
        id,
        category: {
          userId: session.user.id
        }
      },
      include: {
        category: true,
        hierarchyDefinitions: {
          orderBy: { level: 'asc' }
        }
      }
    })

    if (!budgetSession) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      ...budgetSession,
      totalBudget: budgetSession.totalBudget.toString()
    })
  } catch (error) {
    console.error('Error fetching session:', error)
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
    const authSession = await getServerSession(authOptions)

    if (!authSession?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params
    const body = await request.json()
    const data = updateSessionSchema.parse(body)

    // Verify session belongs to user
    const existingSession = await prisma.session.findFirst({
      where: {
        id,
        category: {
          userId: authSession.user.id
        }
      }
    })

    if (!existingSession) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    const updateData: any = {}
    if (data.name) updateData.name = data.name
    if (data.status) updateData.status = data.status
    if (data.totalBudget) updateData.totalBudget = BigInt(data.totalBudget)

    const updatedSession = await prisma.session.update({
      where: { id },
      data: updateData
    })

    return NextResponse.json({
      ...updatedSession,
      totalBudget: updatedSession.totalBudget.toString()
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error updating session:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
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
    const existingSession = await prisma.session.findFirst({
      where: {
        id,
        category: {
          userId: session.user.id
        }
      }
    })

    if (!existingSession) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    await prisma.session.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting session:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
