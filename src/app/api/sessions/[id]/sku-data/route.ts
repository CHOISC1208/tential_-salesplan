import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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

    const skuData = await prisma.skuData.findMany({
      where: { sessionId: id },
      orderBy: { createdAt: 'asc' }
    })

    return NextResponse.json(skuData)
  } catch (error) {
    console.error('Error fetching SKU data:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
