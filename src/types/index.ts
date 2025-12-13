import { SessionStatus } from '@prisma/client'

export interface User {
  id: string
  email: string
  name: string | null
}

export interface Category {
  id: string
  name: string
  userId: string
  createdAt: Date
  updatedAt: Date
}

export interface Session {
  id: string
  categoryId: string
  name: string
  totalBudget: bigint
  status: SessionStatus
  createdAt: Date
  updatedAt: Date
}

export interface HierarchyDefinition {
  id: string
  sessionId: string
  level: number
  columnName: string
  displayOrder: number
}

export interface SkuData {
  id: string
  sessionId: string
  skuCode: string
  unitPrice: number
  hierarchyValues: Record<string, string>
  createdAt: Date
}

export interface Allocation {
  id: string
  sessionId: string
  hierarchyPath: string
  level: number
  percentage: number
  amount: bigint
  quantity: number
  updatedAt: Date
}

export interface HierarchyNode {
  path: string
  level: number
  name: string
  percentage: number
  amount: number
  quantity: number
  children?: HierarchyNode[]
  unitPrice?: number
}

export interface CSVRow {
  [key: string]: string
}

export interface ImportData {
  skuData: Array<{
    skuCode: string
    unitPrice: number
    hierarchyValues: Record<string, string>
  }>
  hierarchyColumns: string[]
}
