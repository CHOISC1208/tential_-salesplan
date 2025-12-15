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
    const { id } = await params
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const budgetSession = await prisma.session.findUnique({
      where: { id },
      include: {
        category: {
          include: {
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        },
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

    // 作業中（draft）のセッションは作成者のみアクセス可能
    if (budgetSession.status === 'draft' && budgetSession.category.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'このセッションは作成者が作業中です' },
        { status: 403 }
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
    const { id } = await params
    const authSession = await getServerSession(authOptions)

    if (!authSession?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const data = updateSessionSchema.parse(body)

    // Verify session exists and belongs to user
    const existingSession = await prisma.session.findUnique({
      where: { id },
      include: {
        category: true
      }
    })

    if (!existingSession) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    // 作成者のみが編集可能
    if (existingSession.category.userId !== authSession.user.id) {
      return NextResponse.json(
        { error: '作成者のみがセッションを編集できます' },
        { status: 403 }
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
    const { id } = await params
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Verify session exists and belongs to user
    const existingSession = await prisma.session.findUnique({
      where: { id },
      include: {
        category: true
      }
    })

    if (!existingSession) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    // 作成者のみが削除可能
    if (existingSession.category.userId !== session.user.id) {
      return NextResponse.json(
        { error: '作成者のみがセッションを削除できます' },
        { status: 403 }
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
