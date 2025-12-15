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

    const skuData = await prisma.skuData.findMany({
      where: { sessionId: id }
    })

    const allocations = await prisma.allocation.findMany({
      where: { sessionId: id }
    })

    // Create allocation lookup map
    const allocationMap = new Map<string, any>()
    for (const allocation of allocations) {
      allocationMap.set(allocation.hierarchyPath, {
        percentage: parseFloat(allocation.percentage.toString()),
        amount: allocation.amount.toString(),
        quantity: allocation.quantity
      })
    }

    // Build CSV rows
    const hierarchyColumns = budgetSession.hierarchyDefinitions.map(
      h => h.columnName
    )

    const headers = [
      ...hierarchyColumns,
      'sku_code',
      'unitprice',
      'percentage',
      'amount',
      'quantity'
    ]

    const rows: string[][] = [headers]

    for (const sku of skuData) {
      const values = sku.hierarchyValues as Record<string, string>

      // Build hierarchy path
      const pathParts = hierarchyColumns.map(col => values[col] || '')
      const hierarchyPath = pathParts.filter(Boolean).join('/')

      const allocation = allocationMap.get(hierarchyPath) || {
        percentage: 0,
        amount: '0',
        quantity: 0
      }

      const row = [
        ...pathParts,
        sku.skuCode,
        sku.unitPrice.toString(),
        allocation.percentage.toString(),
        allocation.amount,
        allocation.quantity.toString()
      ]

      rows.push(row)
    }

    // Convert to CSV string
    const csvContent = rows
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n')

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="budget-allocation-${id}.csv"`
      }
    })
  } catch (error) {
    console.error('Error exporting data:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
