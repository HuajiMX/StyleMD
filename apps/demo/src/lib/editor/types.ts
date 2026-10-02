/**
 * 源码编辑器的对外句柄。
 *
 * App 只认这个接口，不认「它是不是 textarea」——当初换掉 textarea 时，
 * 改动就被收在这一层后面，滚动同步、大纲定位、光标恢复都不用重写。
 */
export interface SourceEditorHandle {
  getValue(): string
  setValue(next: string): void
  focus(): void
  /** 把插入点移到某个偏移。 */
  setCursor(offset: number): void
  /** 把某个偏移滚到视口首行，用于大纲跳转与会话恢复。 */
  revealOffset(offset: number): void
  /**
   * 一批偏移「顶到首行」所需的 scrollTop（已夹在可滚动范围内）。
   * 用于判断左侧大纲当前高亮哪一条：夹住上限这点很重要——文末的标题永远也顶不到首行，
   * 夹住之后它才算「已经到达」。
   */
  offsetTopsFor(offsets: number[]): number[]
  /** 当前滚动位置（px）。 */
  scrollTop(): number
  /** 滚动进度 0–1。 */
  getScrollRatio(): number
  setScrollRatio(ratio: number): void
  destroy(): void
}

/** e2e 用的调试句柄：只在 URL 带 ?e2e=1 时挂到 window 上。 */
export interface EditorDebugHandle {
  getValue(): string
  setValue(next: string): void
  getCursor(): number
  setCursor(offset: number): void
  getScrollTop(): number
  setScrollTop(top: number): void
  getScrollRatio(): number
}
