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

      // If source has allocations, copy them. Otherwise just create empty period.
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
      }

      return NextResponse.json({
        success: true,
        period: period.trim(),
        copied: sourceAllocations.length,
      });
    } else {
      // Just create an empty period marker (no actual allocations yet)
      // The period will be available for selection in the UI
      return NextResponse.json({
        success: true,
        period: period.trim(),
        copied: 0,
      });
    }
  } catch (error) {
    console.error('Error adding period:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
