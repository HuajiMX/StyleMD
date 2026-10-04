import { useMemo } from 'react'
import { renderMath } from '@stylemd/core'
import type { RoleDefinition } from '@stylemd/theme-schema'

/**
 * 公式角色的样式样例：交给 KaTeX 真渲染，而不是把 `$$...$$` 当纯文本摆出来。
 *
 * 公式的字体由 KaTeX 负责，主题能改的是字号、颜色与对齐，所以外面这层照样带角色样式，
 * 缩放到卡片/预览框放得下为止。样例是仓库里的静态数据、不经过用户输入，KaTeX 自己也会转义。
 */
export function MathSample({ definition }: { definition: RoleDefinition }) {
  const display = definition.sampleKind === 'display-math'
  const html = useMemo(() => renderMath(definition.sample, display).html, [definition.sample, display])
  return (
    <span
      className={`math-sample stylemd-math ${display ? 'stylemd-math-block' : 'stylemd-math-inline'}`}
      style={{ display: display ? 'block' : 'inline' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/** 这个角色的样例要不要走公式渲染。 */
export function isMathSample(definition: RoleDefinition | undefined): boolean {
  return definition?.sampleKind === 'inline-math' || definition?.sampleKind === 'display-math'
}
