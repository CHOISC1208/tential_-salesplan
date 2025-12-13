import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const skuDataSchema = z.object({
  skuCode: z.string(),
  unitPrice: z.number().int().positive(),
  hierarchyValues: z.record(z.string())
})

const importSchema = z.object({
  skuData: z.array(skuDataSchema),
  hierarchyColumns: z.array(z.string())
})

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Verify session belongs to user
    const budgetSession = await prisma.session.findFirst({
      where: {
        id: params.id,
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
    const { skuData, hierarchyColumns } = importSchema.parse(body)

    // Delete existing data
    await prisma.$transaction([
      prisma.allocation.deleteMany({ where: { sessionId: params.id } }),
      prisma.skuData.deleteMany({ where: { sessionId: params.id } }),
      prisma.hierarchyDefinition.deleteMany({ where: { sessionId: params.id } })
    ])

    // Create hierarchy definitions
    const hierarchyDefinitions = hierarchyColumns.map((col, index) => ({
      sessionId: params.id,
      level: index + 1,
      columnName: col,
      displayOrder: index + 1
    }))

    await prisma.hierarchyDefinition.createMany({
      data: hierarchyDefinitions
    })

    // Create SKU data
    const skuRecords = skuData.map(sku => ({
      sessionId: params.id,
      skuCode: sku.skuCode,
      unitPrice: sku.unitPrice,
      hierarchyValues: sku.hierarchyValues
    }))

    await prisma.skuData.createMany({
      data: skuRecords
    })

    return NextResponse.json({
      success: true,
      imported: skuData.length,
      hierarchyLevels: hierarchyColumns.length
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error importing data:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
