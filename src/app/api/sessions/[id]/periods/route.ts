import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * GET /api/sessions/[id]/periods
 * Get list of all periods used in a session
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;

    // Verify session exists
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Get distinct period values from allocations
    const allocations = await prisma.allocation.findMany({
      where: { sessionId },
      select: { period: true },
      distinct: 'period',
    });

    // Extract period values and sort
    const periods = allocations
      .map(a => a.period)
      .sort((a, b) => {
        // null (default) comes first
        if (a === null) return -1;
        if (b === null) return 1;
        return a.localeCompare(b);
      });

    return NextResponse.json({ periods });
  } catch (error) {
    console.error('Error fetching periods:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sessions/[id]/periods
 * Add a new period (with option to copy existing allocations)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const body = await request.json();
    const { period, copyFrom } = body;

    // Validate period name
    if (!period || typeof period !== 'string' || period.trim() === '') {
      return NextResponse.json(
        { error: 'Period name is required' },
        { status: 400 }
      );
    }

    // Verify session exists
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Check if period already exists
    const existingAllocation = await prisma.allocation.findFirst({
      where: {
        sessionId,
        period: period.trim(),
      },
    });

    if (existingAllocation) {
      return NextResponse.json(
        { error: 'Period already exists' },
        { status: 409 }
      );
    }

    if (copyFrom !== undefined && copyFrom !== null && copyFrom !== '') {
      // Copy allocations from another period
      const sourceAllocations = await prisma.allocation.findMany({
        where: {
          sessionId,
          period: copyFrom,
        },
      });

      // If source has allocations, copy them
      if (sourceAllocations.length > 0) {
        await prisma.allocation.createMany({
          data: sourceAllocations.map(allocation => ({
            sessionId: allocation.sessionId,
            hierarchyPath: allocation.hierarchyPath,
            level: allocation.level,
            percentage: allocation.percentage,
            amount: allocation.amount,
            quantity: allocation.quantity,
            period: period.trim(),
          })),
        });

        return NextResponse.json({
          success: true,
          period: period.trim(),
          copied: sourceAllocations.length,
        });
      }
    }

    // If no source to copy from, or source is empty, create placeholder allocations
    // Get session's hierarchy structure from SKU data
    const skuData = await prisma.skuData.findMany({
      where: { sessionId },
    });

    const hierarchyDefinitions = await prisma.hierarchyDefinition.findMany({
      where: { sessionId },
      orderBy: { level: 'asc' },
    });

    if (skuData.length > 0 && hierarchyDefinitions.length > 0) {
      // Build hierarchy paths from SKU data
      const hierarchyPaths = new Set<string>();

      for (const sku of skuData) {
        const hierarchyValues = sku.hierarchyValues as Record<string, string>;

        for (let level = 1; level <= hierarchyDefinitions.length; level++) {
          const pathParts: string[] = [];

          for (let i = 0; i < level; i++) {
            const def = hierarchyDefinitions[i];
            const value = hierarchyValues[def.columnName];
            if (value) {
              pathParts.push(value);
            }
          }

          if (pathParts.length === level) {
            hierarchyPaths.add(pathParts.join('/'));
          }
        }
      }

      // Create empty allocations for each hierarchy path
      const allocations = Array.from(hierarchyPaths).map(path => ({
        sessionId,
        hierarchyPath: path,
        level: path.split('/').length,
        percentage: 0,
        amount: BigInt(0),
        quantity: 0,
        period: period.trim(),
      }));

      if (allocations.length > 0) {
        await prisma.allocation.createMany({
          data: allocations,
        });
      }
    }

    return NextResponse.json({
      success: true,
      period: period.trim(),
      copied: 0,
    });
  } catch (error) {
    console.error('Error adding period:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
