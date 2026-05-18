export interface CornerPoint {
  x: number
  y: number
}

export interface PaperCorners {
  topLeftCorner: CornerPoint
  topRightCorner: CornerPoint
  bottomLeftCorner: CornerPoint
  bottomRightCorner: CornerPoint
}

export interface CapturedPage {
  id: string
  blob: Blob
  previewUrl: string
  capturedAt: number
}

export interface DocumentScannerProps {
  onComplete: (pages: CapturedPage[]) => void | Promise<void>
  onCancel: () => void
  maxPages?: number
  autoCaptureDelayMs?: number
  outputLongEdge?: number
  outputQuality?: number
}
