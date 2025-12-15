import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const autoAllocateSchema = z.object({
  level: z.number().int().positive()
})

export async function POST(
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
      },
      include: {
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

    const body = await request.json()
    const { level } = autoAllocateSchema.parse(body)

    // Get all SKU data
    const skuData = await prisma.skuData.findMany({
      where: { sessionId: id }
    })

    if (skuData.length === 0) {
      return NextResponse.json(
        { error: 'No SKU data found' },
        { status: 400 }
      )
    }

    // Get hierarchy definition for the level
    const hierarchyDef = budgetSession.hierarchyDefinitions.find(
      h => h.level === level
    )

    if (!hierarchyDef) {
      return NextResponse.json(
        { error: 'Invalid level' },
        { status: 400 }
      )
    }

    // Build hierarchy paths up to the requested level
    const hierarchyPaths = new Set<string>()

    for (const sku of skuData) {
      const values = sku.hierarchyValues as Record<string, string>
      const pathParts: string[] = []

      for (let i = 0; i < level; i++) {
        const def = budgetSession.hierarchyDefinitions[i]
        if (def && values[def.columnName]) {
          pathParts.push(values[def.columnName])
        }
      }

      if (pathParts.length === level) {
        hierarchyPaths.add(pathParts.join('/'))
      }
    }

    const paths = Array.from(hierarchyPaths)
    const percentage = paths.length > 0 ? 100 / paths.length : 0
    const totalBudget = Number(budgetSession.totalBudget)
    const amount = Math.floor(totalBudget * (percentage / 100))

    // Create allocations
    const allocations = paths.map(path => ({
      sessionId: id,
      hierarchyPath: path,
      level,
      percentage,
      amount: BigInt(amount),
      quantity: 0 // Will be calculated on frontend based on SKU details
    }))

    // Delete existing allocations for this level
    await prisma.allocation.deleteMany({
      where: {
        sessionId: id,
        level
      }
    })

    await prisma.allocation.createMany({
      data: allocations
    })

    return NextResponse.json({
      success: true,
      allocated: allocations.length,
      percentage
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error auto-allocating:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
