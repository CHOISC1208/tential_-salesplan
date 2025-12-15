import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * PUT /api/sessions/[id]/periods/[period]
 * Rename a period
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; period: string }> }
) {
  try {
    const { id: sessionId, period: oldPeriod } = await params;
    const body = await request.json();
    const { newPeriod } = body;

    // Decode URL-encoded period
    const decodedOldPeriod = decodeURIComponent(oldPeriod);
    const actualOldPeriod = decodedOldPeriod === 'null' ? null : decodedOldPeriod;

    // Validate new period name
    if (!newPeriod || typeof newPeriod !== 'string' || newPeriod.trim() === '') {
      return NextResponse.json(
        { error: 'New period name is required' },
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

    // Check if old period exists
    const oldAllocations = await prisma.allocation.findMany({
      where: {
        sessionId,
        period: actualOldPeriod,
      },
    });

    if (oldAllocations.length === 0) {
      return NextResponse.json(
        { error: 'Period not found' },
        { status: 404 }
      );
    }

    // Check if new period already exists
    const existingAllocation = await prisma.allocation.findFirst({
      where: {
        sessionId,
        period: newPeriod.trim(),
      },
    });

    if (existingAllocation) {
      return NextResponse.json(
        { error: 'New period name already exists' },
        { status: 409 }
      );
    }

    // Update all allocations with the new period name
    await prisma.allocation.updateMany({
      where: {
        sessionId,
        period: actualOldPeriod,
      },
      data: {
        period: newPeriod.trim(),
      },
    });

    return NextResponse.json({
      success: true,
      oldPeriod: actualOldPeriod,
      newPeriod: newPeriod.trim(),
      updated: oldAllocations.length,
    });
  } catch (error) {
    console.error('Error renaming period:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sessions/[id]/periods/[period]
 * Delete a period and all its allocations
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; period: string }> }
) {
  try {
    const { id: sessionId, period } = await params;

    // Decode URL-encoded period
    const decodedPeriod = decodeURIComponent(period);
    const actualPeriod = decodedPeriod === 'null' ? null : decodedPeriod;

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

    // Delete all allocations for this period
    const result = await prisma.allocation.deleteMany({
      where: {
        sessionId,
        period: actualPeriod,
      },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { error: 'Period not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      period: actualPeriod,
      deleted: result.count,
    });
  } catch (error) {
    console.error('Error deleting period:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
