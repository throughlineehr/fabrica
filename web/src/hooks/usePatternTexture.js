import { useMemo, useEffect } from 'react'
import * as THREE from 'three'
import { color } from '../styles'

const PATTERNS = {
  s5: drawDiagonalLines,
  s4: drawCrosshatch,
  s3: drawHorizontalLines,
  s2: drawDots,
  s1: drawVerticalLines,
}

const SIZE = 64
const LINE_W = 5
const GAP = 12

function drawDiagonalLines(ctx, fg) {
  ctx.strokeStyle = fg
  ctx.lineWidth = LINE_W
  for (let i = -SIZE; i < SIZE * 2; i += GAP) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i + SIZE, SIZE)
    ctx.stroke()
  }
}

function drawCrosshatch(ctx, fg) {
  ctx.strokeStyle = fg
  ctx.lineWidth = LINE_W
  for (let i = -SIZE; i < SIZE * 2; i += GAP) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i + SIZE, SIZE)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(i + SIZE, 0)
    ctx.lineTo(i, SIZE)
    ctx.stroke()
  }
}

function drawHorizontalLines(ctx, fg) {
  ctx.strokeStyle = fg
  ctx.lineWidth = LINE_W
  for (let y = GAP / 2; y < SIZE; y += GAP) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(SIZE, y)
    ctx.stroke()
  }
}

function drawDots(ctx, fg) {
  ctx.fillStyle = fg
  for (let x = GAP / 2; x < SIZE; x += GAP) {
    for (let y = GAP / 2; y < SIZE; y += GAP) {
      ctx.beginPath()
      ctx.arc(x, y, LINE_W, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function drawVerticalLines(ctx, fg) {
  ctx.strokeStyle = fg
  ctx.lineWidth = LINE_W
  for (let x = GAP / 2; x < SIZE; x += GAP) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, SIZE)
    ctx.stroke()
  }
}

function makeTexture(systemKey, bg) {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, SIZE, SIZE)

  ctx.globalAlpha = 0.7
  const draw = PATTERNS[systemKey]
  if (draw) draw(ctx, color.black)

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(4, 4)
  tex.needsUpdate = true
  return tex
}

// Returns a CSS background-image data URL for use in HTML elements
export function getPatternDataUrl(systemKey, bg) {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.globalAlpha = 0.7
  const draw = PATTERNS[systemKey]
  if (draw) draw(ctx, color.black)
  return canvas.toDataURL()
}

export function usePatternTexture(systemKey, fillColor, enabled) {
  const tex = useMemo(
    () => (enabled && systemKey ? makeTexture(systemKey, fillColor) : null),
    [systemKey, fillColor, enabled],
  )

  useEffect(() => () => tex?.dispose(), [tex])

  return tex
}
