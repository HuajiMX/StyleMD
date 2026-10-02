import type { EditorScheme, EditorSchemeTokens, EditorTokenName } from './types'

/**
 * 内置配色方案。色值都经过 packages/editor-theme/test/presets.test.ts 的对比度断言，
 * 改任何一个值都必须让测试继续通过。
 */
export const BUILT_IN_SCHEMES: EditorScheme[] = [
  {
    id: 'paper',
    name: '纸感',
    builtIn: true,
    tokens: {
      background: '#ffffff',
      foreground: '#17202e',
      heading: '#1d4ed8',
      emphasis: '#7a3ea8',
      code: '#0f766e',
      codeBg: '#f1f5f9',
      link: '#0b6bcb',
      listMarker: '#b45309',
      marker: '#7590c9',
      muted: '#7b879b',
      separator: '#8595af',
      activeLine: '#f2f6ff',
      activeBlockBar: '#2f6fed',
    },
  },
  {
    id: 'vivid',
    name: '鲜明',
    builtIn: true,
    tokens: {
      background: '#ffffff',
      foreground: '#101826',
      heading: '#c2185b',
      emphasis: '#6a1fb1',
      code: '#00706a',
      codeBg: '#eef6f5',
      link: '#0550ae',
      listMarker: '#c2410c',
      marker: '#4f74d9',
      muted: '#6b7688',
      separator: '#8795aa',
      activeLine: '#fff4de',
      activeBlockBar: '#d97c00',
    },
  },
  {
    id: 'quiet',
    name: '黑白',
    builtIn: true,
    tokens: {
      background: '#ffffff',
      foreground: '#1a1a1a',
      heading: '#000000',
      emphasis: '#333333',
      code: '#444444',
      codeBg: '#f0f0f0',
      link: '#1a1a1a',
      listMarker: '#6b6b6b',
      marker: '#949494',
      muted: '#8a8a8a',
      separator: '#949494',
      activeLine: '#f2f2f2',
      activeBlockBar: '#4a4a4a',
    },
  },
  {
    id: 'night',
    name: '夜读',
    builtIn: true,
    tokens: {
      background: '#131a26',
      foreground: '#dbe3ef',
      heading: '#8ab4ff',
      emphasis: '#c9a2ff',
      code: '#7ddcd0',
      codeBg: '#1c2535',
      link: '#7cb0ff',
      listMarker: '#e0a05a',
      marker: '#6b86b8',
      muted: '#7d8ba1',
      separator: '#546781',
      activeLine: '#1b2434',
      activeBlockBar: '#5b8def',
    },
  },
  {
    id: 'contrast',
    name: '高对比',
    builtIn: true,
    tokens: {
      background: '#ffffff',
      foreground: '#0b1220',
      heading: '#0b3fa8',
      emphasis: '#5b1f96',
      code: '#005c54',
      codeBg: '#e8eef5',
      link: '#053f8f',
      listMarker: '#8a3b00',
      marker: '#3f5ba8',
      muted: '#55617a',
      separator: '#6b7688',
      activeLine: '#dfe9ff',
      activeBlockBar: '#11429c',
    },
  },
]

export function getBuiltInScheme(id: string): EditorScheme | undefined {
  return BUILT_IN_SCHEMES.find((scheme) => scheme.id === id)
}

/** 兜底色值：缺色槽、坏档一律按默认方案的对应色补。 */
export function defaultToken(name: EditorTokenName): string {
  const fallback = getBuiltInScheme('paper') ?? BUILT_IN_SCHEMES[0]
  if (!fallback) throw new Error('内置配色方案缺失')
  return fallback.tokens[name]
}

export function cloneTokens(tokens: EditorSchemeTokens): EditorSchemeTokens {
  return { ...tokens }
}

export function isBuiltInSchemeId(id: string): boolean {
  return BUILT_IN_SCHEMES.some((scheme) => scheme.id === id)
}
