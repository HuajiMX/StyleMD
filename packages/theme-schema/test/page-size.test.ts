import { describe, expect, it } from 'vitest'
import { pageDimensionsMm } from '../src/defaults'

describe('纸张尺寸的唯一读法', () => {
  it('规格名查表，横向把宽高对调', () => {
    expect(pageDimensionsMm({ size: 'A4' })).toEqual({ widthMm: 210, heightMm: 297 })
    expect(pageDimensionsMm({ size: 'A4', orientation: 'landscape' })).toEqual({ widthMm: 297, heightMm: 210 })
    expect(pageDimensionsMm({ size: 'A5', orientation: 'portrait' })).toEqual({ widthMm: 148, heightMm: 210 })
    // Letter 不是整数毫米，照原值给，不做取整
    expect(pageDimensionsMm({ size: 'Letter', orientation: 'landscape' })).toEqual({ widthMm: 279.4, heightMm: 215.9 })
  })

  it('自定义尺寸直接用它，横向同样对调', () => {
    expect(pageDimensionsMm({ size: { widthMm: 176, heightMm: 250 } })).toEqual({ widthMm: 176, heightMm: 250 })
    expect(pageDimensionsMm({ size: { widthMm: 176, heightMm: 250 }, orientation: 'landscape' })).toEqual({
      widthMm: 250,
      heightMm: 176,
    })
  })

  it('没写规格或认不出的规格一律按 A4 兜底', () => {
    expect(pageDimensionsMm()).toEqual({ widthMm: 210, heightMm: 297 })
    expect(pageDimensionsMm({ orientation: 'landscape' })).toEqual({ widthMm: 297, heightMm: 210 })
    expect(pageDimensionsMm({ size: 'B7' as never })).toEqual({ widthMm: 210, heightMm: 297 })
  })
})
